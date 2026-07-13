"""
Mock API for vessel-tracks — serves real vessel data from a local SQLite
snapshot (see seed_db.py), no live database needed.
Mirrors the real main.py endpoints so the frontend works unchanged.

Run:  cd mock_api && ../venv/bin/python -m uvicorn main:app --reload --port 8001
"""

import os
import re
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

import pandas as pd  # type: ignore
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from shapely.geometry import Point, shape  # type: ignore

DB_PATH = Path(__file__).parent / "mock.db"

# Re-use the real analysis code — noise TIFs and plotting are committed to the repo.
sys.path.insert(0, str(Path(__file__).parent.parent / "analysis"))
from noise import render_noise_overlay, noise_range, NOISE_EXTENT, NOISE_DATA_DIR  # noqa: E402
from plots import plot_vessel_types, plot_speed_overall, plot_vessel_density, ORDERED_TYPES  # noqa: E402

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def query(sql: str, params=None) -> list[dict]:
    if not DB_PATH.exists():
        raise HTTPException(
            status_code=503,
            detail="mock.db not found — run seed_db.py first (see mock_api/seed_db.py)",
        )
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        cur = conn.execute(sql, params or [])
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


TYPE_CATEGORIES = {
    "cargo":                    range(70, 80),
    "tanker":                   range(80, 90),
    "fishing":                  range(30, 31),
    "passenger":                range(60, 70),
    "search and rescue vessel": [51],
    "other":                    list(range(20, 30)) + list(range(31, 51)) +
                                list(range(52, 60)) + list(range(90, 100)),
}


def classify_ship_type(code):
    try:
        c = int(code)
    except (TypeError, ValueError):
        return "unknown"
    for label, codes in TYPE_CATEGORIES.items():
        if c in codes:
            return label
    return "unknown"


@app.get("/")
def root():
    return {"message": "mock api is running"}


@app.get("/api/vessels")
def get_vessels(start: str | None = Query(None), end: str | None = Query(None)):
    date_filter = ""
    params: list = []
    if start and end:
        date_filter = "AND received_at >= ? AND received_at <= ?"
        params = [start, end]

    rows = query(f"""
        SELECT
            p.mmsi,
            v.name AS vessel_name,
            v.ship_type,
            p.source,
            p.point_count
        FROM (
            SELECT mmsi, source, COUNT(*) AS point_count
            FROM ais_positions
            WHERE 1=1 {date_filter}
            GROUP BY mmsi, source
        ) p
        LEFT JOIN vessels v USING (mmsi)
        ORDER BY v.name IS NULL, v.name, p.mmsi
    """, params)
    return {"vessels": rows, "count": len(rows)}


MAX_ROUTE_POINTS = 500


@app.get("/api/vessel/{mmsi}/route")
def get_vessel_route(
    mmsi: int,
    start: str | None = Query(None),
    end: str | None = Query(None),
):
    sql = "SELECT CAST(strftime('%s', received_at) AS INTEGER) AS time, longitude, latitude, speed AS sog, course AS cog, source FROM ais_positions WHERE mmsi = ?"
    params: list = [mmsi]
    if start:
        sql += " AND received_at >= ?"
        params.append(start)
    if end:
        sql += " AND received_at <= ?"
        params.append(end)
    sql += " ORDER BY received_at"

    points = query(sql, params)
    if not points:
        raise HTTPException(status_code=404, detail=f"No route data for MMSI {mmsi}")

    total = len(points)
    if total > MAX_ROUTE_POINTS:
        step = total / MAX_ROUTE_POINTS
        points = [points[int(i * step)] for i in range(MAX_ROUTE_POINTS)]
    return {"mmsi": mmsi, "points": points, "count": len(points), "total": total, "sampled": total > MAX_ROUTE_POINTS}


class RegionRequest(BaseModel):
    polygon: dict
    start: str
    end: str


def _positions_in_region(req: RegionRequest) -> tuple[list[dict], tuple[float, float, float, float]]:
    try:
        polygon = shape(req.polygon)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid GeoJSON polygon")

    minx, miny, maxx, maxy = polygon.bounds
    rows = query("""
        SELECT p.mmsi, p.received_at, p.latitude, p.longitude, p.speed, v.ship_type
        FROM ais_positions p
        LEFT JOIN vessels v USING (mmsi)
        WHERE p.received_at >= ? AND p.received_at < ?
          AND p.latitude  BETWEEN ? AND ?
          AND p.longitude BETWEEN ? AND ?
    """, [req.start, req.end, miny, maxy, minx, maxx])

    inside = [r for r in rows if polygon.contains(Point(r["longitude"], r["latitude"]))]
    return inside, (minx, miny, maxx, maxy)


@app.post("/api/region/vessels")
def get_region_vessels(req: RegionRequest):
    inside, _ = _positions_in_region(req)
    return {
        "vessel_mmsis": sorted({r["mmsi"] for r in inside}),
        "positions": [
            {"mmsi": r["mmsi"], "lat": r["latitude"], "lon": r["longitude"], "sog": r["speed"], "ship_type": r["ship_type"]}
            for r in inside
        ],
    }


@app.post("/api/analysis/region")
def analyse_region(req: RegionRequest):
    inside, (minx, miny, maxx, maxy) = _positions_in_region(req)

    if not inside:
        return {"days": [], "total_positions": 0, "unique_vessels": 0, "plots": {}}

    df = pd.DataFrame(inside)
    df["day"] = df["received_at"].astype(str).str[:10]
    df["type_label"] = df["ship_type"].apply(classify_ship_type)

    daily_counts = (
        df.groupby(["day", "type_label"])["mmsi"]
        .nunique()
        .unstack(fill_value=0)
        .reindex(columns=ORDERED_TYPES, fill_value=0)
    )
    daily_counts.index = pd.to_datetime(daily_counts.index)

    daily: dict = defaultdict(lambda: defaultdict(set))
    for r in inside:
        day = str(r["received_at"])[:10]
        label = classify_ship_type(r["ship_type"])
        daily[day][label].add(r["mmsi"])

    days = []
    for day in sorted(daily):
        counts = {t: len(daily[day][t]) for t in daily[day]}
        days.append({"date": day, "vessel_counts": counts})

    unique_vessels = len({r["mmsi"] for r in inside})

    plots = {
        "vessel_types":  plot_vessel_types(daily_counts),
        "speed_overall": plot_speed_overall(df[["day", "speed"]].rename(columns={"speed": "speed"})),
    }
    try:
        plots["vessel_density"] = plot_vessel_density(df[["longitude", "latitude"]], minx, maxx, miny, maxy)
    except ValueError:
        plots["vessel_density_error"] = "Not enough position data for a density map."

    return {
        "days": days,
        "total_positions": len(inside),
        "unique_vessels": unique_vessels,
        "vessel_mmsis": sorted({r["mmsi"] for r in inside}),
        "positions": [
            {"mmsi": r["mmsi"], "lat": r["latitude"], "lon": r["longitude"], "sog": r["speed"], "ship_type": r["ship_type"]}
            for r in inside
        ],
        "plots": plots,
    }


@app.get("/api/noise/extent")
def get_noise_extent():
    return NOISE_EXTENT


@app.get("/api/noise/available")
def get_noise_available():
    result: dict[str, list[dict]] = {}
    try:
        entries = os.listdir(NOISE_DATA_DIR)
    except FileNotFoundError:
        return result
    for name in entries:
        m = re.match(r"^(.+)_f(\d+)_d(\d+)$", name)
        if m and os.path.isdir(os.path.join(NOISE_DATA_DIR, name)):
            var, freq, depth = m.group(1), int(m.group(2)), int(m.group(3))
            result.setdefault(var, []).append({"freq": freq, "depth": depth})
    return result


@app.get("/api/noise/dates")
def get_noise_dates(
    variable: str = Query("vessel_noise"),
    freq: float = Query(50),
    depth: float = Query(10),
):
    dir_path = os.path.join(NOISE_DATA_DIR, f"{variable}_f{int(freq)}_d{int(depth)}")
    try:
        files = os.listdir(dir_path)
    except FileNotFoundError:
        return []
    return sorted(f[:-4] for f in files if f.endswith(".tif"))


@app.get("/api/noise/range")
def get_noise_range(
    date: str = Query(...),
    variable: str = Query("vessel_noise"),
    freq: float = Query(50),
    depth: float = Query(10),
):
    try:
        vmin, vmax = noise_range(date, variable=variable, freq=freq, depth=depth)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"No noise data for {date}")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"vmin": round(vmin, 1), "vmax": round(vmax, 1)}


@app.get("/api/noise/overlay")
def get_noise_overlay(
    date: str = Query(...),
    variable: str = Query("vessel_noise"),
    freq: float = Query(50),
    depth: float = Query(10),
    vmin: float | None = Query(None),
    vmax: float | None = Query(None),
):
    try:
        png = render_noise_overlay(date, variable=variable, freq=freq, depth=depth, vmin=vmin, vmax=vmax)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"No noise data for {date}")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return Response(content=png, media_type="image/png")

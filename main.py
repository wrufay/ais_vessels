"""
Scotian Shelf AIS Vessel Tracker — FastAPI backend.
Requires TimescaleDB/Postgres via DATABASE_URL.

Run locally:  DATABASE_URL=postgresql://... uvicorn main:app --reload
"""

import os
import sys
from contextlib import asynccontextmanager

import pandas as pd # type: ignore
import psycopg2 # type: ignore
import psycopg2.extras # type: ignore
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from shapely.geometry import Point, shape # type: ignore

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "analysis"))
from plots import plot_vessel_types, plot_speed_overall, plot_vessel_density, ORDERED_TYPES  # noqa: E402 # type: ignore

DATABASE_URL: str = os.environ["DATABASE_URL"]

ALLOWED_MMSIS: set[int] = set()


def query(sql: str, params=None) -> list[dict]:
    with psycopg2.connect(DATABASE_URL) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params or [])
            return [dict(r) for r in cur.fetchall()]


@asynccontextmanager
async def lifespan(_: FastAPI):
    global ALLOWED_MMSIS
    try:
        rows = query(
            "SELECT DISTINCT mmsi FROM vessels WHERE mmsi BETWEEN 200000000 AND 799999999"
        )
        ALLOWED_MMSIS = {r["mmsi"] for r in rows}
        print(f"Loaded {len(ALLOWED_MMSIS)} vessels.")
    except Exception as e:
        print(f"Warning: could not load vessels ({e}).")
    yield


app = FastAPI(lifespan=lifespan)

CORS_ORIGINS = os.environ.get(
    "CORS_ORIGINS",
    "http://localhost,http://localhost:3000,http://localhost:5173",
).split(",")
app.add_middleware(
    CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"]
)


@app.get("/")
def root():
    return {"message": "app is running"}


@app.get("/api/vessels")
def get_vessels(start: str | None = Query(None), end: str | None = Query(None)):
    params: list = []
    date_filter = ""
    if start and end:
        date_filter = "AND received_at >= %s AND received_at <= %s"
        params = [start, end]

    rows = query(f"""
        SELECT
            p.mmsi,
            v.name AS vessel_name,
            v.ship_type,
            p.source
        FROM (
            SELECT DISTINCT ON (mmsi) mmsi, source
            FROM ais_positions
            WHERE mmsi BETWEEN 200000000 AND 799999999
            {date_filter}
            ORDER BY mmsi, received_at DESC
        ) p
        LEFT JOIN vessels v USING (mmsi)
        ORDER BY v.name NULLS LAST, p.mmsi
    """, params or None)
    return {"vessels": rows, "count": len(rows)}


@app.get("/api/vessel/{mmsi}/route")
def get_vessel_route(
    mmsi: int,
    start: str | None = Query(None),
    end: str | None = Query(None),
):
    sql = """
        SELECT
            EXTRACT(EPOCH FROM received_at)::BIGINT AS time,
            longitude, latitude, speed AS sog, course AS cog, source
        FROM ais_positions
        WHERE mmsi = %s
    """
    params: list = [mmsi]

    if start:
        sql += " AND received_at >= %s"
        params.append(start)
    if end:
        sql += " AND received_at <= %s"
        params.append(end)

    sql += " ORDER BY received_at"

    points = query(sql, params)
    return {"mmsi": mmsi, "points": points, "count": len(points)}


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


class RegionRequest(BaseModel):
    polygon: dict  # GeoJSON polygon
    start: str
    end: str


@app.post("/api/analysis/region")
def analyse_region(req: RegionRequest):
    try:
        polygon = shape(req.polygon)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid GeoJSON polygon")

    minx, miny, maxx, maxy = polygon.bounds

    rows = query("""
        SELECT p.mmsi, p.received_at, p.latitude, p.longitude, p.speed, v.ship_type
        FROM ais_positions p
        LEFT JOIN vessels v USING (mmsi)
        WHERE p.received_at >= %s AND p.received_at < %s
          AND p.latitude  BETWEEN %s AND %s
          AND p.longitude BETWEEN %s AND %s
          AND p.mmsi BETWEEN 200000000 AND 799999999
    """, [req.start, req.end, miny, maxy, minx, maxx])

    # Filter to exact polygon
    inside = [r for r in rows if polygon.contains(Point(r["longitude"], r["latitude"]))]

    if not inside:
        return {"days": [], "total_positions": 0, "unique_vessels": 0, "plots": {}}

    df = pd.DataFrame(inside)
    df["day"] = df["received_at"].astype(str).str[:10]
    df["type_label"] = df["ship_type"].apply(classify_ship_type)

    # Daily unique vessel counts by type
    daily_counts = (
        df.groupby(["day", "type_label"])["mmsi"]
        .nunique()
        .unstack(fill_value=0)
        .reindex(columns=ORDERED_TYPES, fill_value=0)
    )
    daily_counts.index = pd.to_datetime(daily_counts.index)

    # Daily stats for JSON response
    from collections import defaultdict
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
        "vessel_types":    plot_vessel_types(daily_counts),
        "speed_overall":   plot_speed_overall(df[["day", "speed"]].rename(columns={"speed": "speed"})),
        "vessel_density":  plot_vessel_density(df[["longitude", "latitude"]], minx, maxx, miny, maxy),
    }

    return {
        "days": days,
        "total_positions": len(inside),
        "unique_vessels": unique_vessels,
        "plots": plots,
    }

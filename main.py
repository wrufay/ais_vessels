"""
FastAPI backend - contains all API routes for the entire application.

Requires: TimescaleDB/Postgres via DATABASE_URL (no default, process
needs DATABASE_URL to start). Docker sets this for you in
docker-compose.yml, running locally - you set it yourself (see below).

How to run
----------
Inside Docker container:
Run this command each time you make edits and wish to have the changes applied.

    docker compose up -d --build backend

Locally (outside Docker):
Run main.py locally to have changes automatically applied without rebuilding Docker
image and restarting the container on each iteration.

    DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ais \
      venv/bin/uvicorn main:app --reload --port 8000
Note: This requires `docker compose up db` running for Postgres.
"""

import os
import sys

import pandas as pd # type: ignore
import psycopg2 # type: ignore
import psycopg2.extras # type: ignore
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from shapely.geometry import Point, shape # type: ignore

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "analysis"))
from plots import plot_vessel_types, plot_speed_overall, plot_vessel_density, ORDERED_TYPES, classify_ship_type  # noqa: E402 # type: ignore
from noise import render_noise_overlay, noise_range, NOISE_DATA_DIR  # noqa: E402 # type: ignore
from noise_impact import list_sites as list_noise_impact_sites, list_options as list_noise_impact_options, compute_impact as compute_noise_impact  # noqa: E402 # type: ignore

# reads DATABASE_URL from environment (REQUIRED)
DATABASE_URL: str = os.environ["DATABASE_URL"]


def query(sql: str, params=None) -> list[dict]:
    with psycopg2.connect(DATABASE_URL) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params or [])
            return [dict(r) for r in cur.fetchall()]

app = FastAPI()

CORS_ORIGINS = os.environ.get(
    "CORS_ORIGINS",
    "http://localhost,http://localhost:3000,http://localhost:5173",
).split(",")
app.add_middleware(
    CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"]
)


# --- HEALTH ---

# health check endpoint to confirm API is reachable
@app.get("/")
def root():
    return {"message": "app is running"}


# --- VESSELS ---

# returns VALID vessels (contains position data, MMSI in range)
# used for the vessel tracks feature to filter the displayed list based on date.
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
            p.source,
            p.point_count
        FROM (
            SELECT mmsi, source, COUNT(*) AS point_count,
                   MAX(received_at) AS last_seen
            FROM ais_positions
            WHERE mmsi BETWEEN 200000000 AND 799999999
            {date_filter}
            GROUP BY mmsi, source
        ) p
        LEFT JOIN vessels v USING (mmsi)
        ORDER BY v.name NULLS LAST, p.mmsi
    """, params or None)
    return {"vessels": rows, "count": len(rows)}


@app.get("/api/ccg/status")
def get_ccg_status():
    """Freshness of the live CCG terrestrial AIS feed — most recent position
    timestamp actually ingested, so the UI can show "updated N min ago"."""
    rows = query(
        "SELECT MAX(received_at) AS last_position_at FROM ais_positions WHERE source = 'CCG_terrestrial'"
    )
    last = rows[0]["last_position_at"] if rows else None
    return {"last_position_at": last.isoformat() if last else None}


# define MAXIMUM number of points shown per route.
# longer routes get downsampled to prevent slowing down the application, adjust if desired.
MAX_ROUTE_POINTS = 500 


# returns position history for ONE vessel, by MMSI (downsampled if long)
# used by Map.tsx when displaying a vessel's track on the map when selecting it in the list.
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
    total = len(points)
    if total > MAX_ROUTE_POINTS:
        step = total / MAX_ROUTE_POINTS
        points = [points[int(i * step)] for i in range(MAX_ROUTE_POINTS)]
    return {"mmsi": mmsi, "points": points, "count": len(points), "total": total, "sampled": total > MAX_ROUTE_POINTS}


# --- REGIONS ---

class RegionRequest(BaseModel):
    polygon: dict  # GeoJSON polygon
    start: str
    end: str


@app.post("/api/region/vessels")
def get_region_vessels(req: RegionRequest):
    """Lightweight endpoint — positions + MMSI list only, no plots."""
    try:
        polygon = shape(req.polygon)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid GeoJSON polygon")

    minx, miny, maxx, maxy = polygon.bounds
    rows = query("""
        SELECT p.mmsi, p.latitude, p.longitude, p.speed AS sog, v.ship_type
        FROM ais_positions p
        LEFT JOIN vessels v USING (mmsi)
        WHERE p.received_at >= %s AND p.received_at < %s
          AND p.latitude  BETWEEN %s AND %s
          AND p.longitude BETWEEN %s AND %s
          AND p.mmsi BETWEEN 200000000 AND 799999999
        ORDER BY p.mmsi, p.received_at
    """, [req.start, req.end, miny, maxy, minx, maxx])

    inside = [r for r in rows if polygon.contains(Point(r["longitude"], r["latitude"]))]
    return {
        "vessel_mmsis": sorted({r["mmsi"] for r in inside}),
        "positions": [
            {"mmsi": r["mmsi"], "lat": r["latitude"], "lon": r["longitude"], "sog": r["sog"], "ship_type": r["ship_type"]}
            for r in inside
        ],
    }


# runs a FULL analysis on a drawn region (daily vessel counts by type, speed distribution, density plot)
# used by Map.tsx for the region-analysis feature when showing results inside the pop-up modal
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



# --- NOISE MODEL OVERLAY ---

@app.get("/api/noise/available")
def get_noise_available():
    """Return available (variable, freq, depth) combinations by scanning noise_data/."""
    import re
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
    """Return sorted list of available date strings for a given variable/freq/depth."""
    dir_path = os.path.join(NOISE_DATA_DIR, f"{variable}_f{int(freq)}_d{int(depth)}")
    try:
        files = os.listdir(dir_path)
    except FileNotFoundError:
        return []
    dates = sorted(f[:-4] for f in files if f.endswith(".tif"))
    return dates


# returns minimum and maximum noise values (dB) for a given combination (date, variable, frequency, depth)
# used by useNoiseLayer.ts to set the color scale before drawing the noise overlay
@app.get("/api/noise/range")
def get_noise_range(
    date: str = Query(..., description="YYYY-MM-DD (daily) or YYYY-MM (monthly)"),
    variable: str = Query("vessel_noise"),
    freq: float = Query(50),
    # Any of the 19 NetCDF depth levels (10-500m) is a valid input — it gets
    # snapped server-side to the nearest one actually converted to GeoTIFF
    # (see resolve_depth in analysis/noise.py). The response's "depth" field
    # is what was ACTUALLY used, which the frontend must not assume equals
    # this requested value.
    depth: float = Query(10, description="Requested depth in metres; response reflects the nearest available depth actually used"),
):
    try:
        vmin, vmax, resolved_depth = noise_range(date, variable=variable, freq=freq, depth=depth)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"No noise data for {date}")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"vmin": round(vmin, 1), "vmax": round(vmax, 1), "depth": resolved_depth}


# renders the noise data as a PNG image, for the map overlay
# used by useNoiseLayer.ts (main noise layer)
@app.get("/api/noise/overlay")
def get_noise_overlay(
    date: str = Query(..., description="YYYY-MM-DD (daily) or YYYY-MM (monthly)"),
    variable: str = Query("vessel_noise"),
    freq: float = Query(50),
    depth: float = Query(10),
    vmin: float | None = Query(None, description="Override the auto colour-scale minimum (dB)"),
    vmax: float | None = Query(None, description="Override the auto colour-scale maximum (dB)"),
):
    try:
        png, _resolved_depth = render_noise_overlay(date, variable=variable, freq=freq, depth=depth, vmin=vmin, vmax=vmax)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"No noise data for {date}")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return Response(content=png, media_type="image/png")


# --- INTERACTIVE NOISE IMPACT ---

@app.get("/api/noise-impact/sites")
def get_noise_impact_sites():
    """Precomputed pile-driving noise-impact sites. Each is a transmission
    -loss model already run offline for a fixed source location/depth/
    frequency/date. Currently, no arbitrary-location mode (see
    analysis/noise_impact.py)."""
    return list_noise_impact_sites()


@app.get("/api/noise-impact/options")
def get_noise_impact_options():
    """Available hearing groups / impact types / metrics, sourced from the
    regulatory thresholds workbook via the noise-impact package's enums."""
    return list_noise_impact_options()


class NoiseImpactRequest(BaseModel):
    site: str
    hearing_groups: list[str]
    impact_types: list[str]
    metrics: list[str]
    # Negative metres below the surface (0 at the surface), matching the
    # underlying model's own depth coordinate convention.
    depth_range: tuple[float, float] = (-40.0, -0.01)
    spl_peak: float
    sel_single_strike: float
    n_strikes_per_pile: int
    n_piles: int = 1
    assessment_period_hours: float = 24


# returns impact zones after running the pile-driving noise-impact model for one site.
# used by useNoiseImpact.ts when you run the impact calculation with user-inputted parameter values.
@app.post("/api/noise-impact/compute")
def post_noise_impact_compute(req: NoiseImpactRequest):
    try:
        return compute_noise_impact(
            site=req.site,
            hearing_groups=req.hearing_groups,
            impact_types=req.impact_types,
            metrics=req.metrics,
            depth_range=req.depth_range,
            spl_peak=req.spl_peak,
            sel_single_strike=req.sel_single_strike,
            n_strikes_per_pile=req.n_strikes_per_pile,
            n_piles=req.n_piles,
            assessment_period_hours=req.assessment_period_hours,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

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

import hmac
import io
import json
import os
import sys
from contextlib import asynccontextmanager
from typing import Annotated, Literal

import pandas as pd # type: ignore
import psycopg2 # type: ignore
import psycopg2.extras # type: ignore
from fastapi import FastAPI, Header, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, StringConstraints
import shapely # type: ignore
from shapely.geometry import shape # type: ignore

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "analysis"))
from plots import plot_vessel_types, plot_speed_overall, plot_vessel_density, render_vessel_density_overlay, ORDERED_TYPES, classify_ship_type  # noqa: E402 # type: ignore
from noise import render_noise_overlay, noise_range, NOISE_DATA_DIR, combo_dirname, parse_combo_dirname  # noqa: E402 # type: ignore
from noise_impact import list_sites as list_noise_impact_sites, list_options as list_noise_impact_options, list_parameter_info as list_noise_impact_info, compute_impact as compute_noise_impact, export_impact as export_noise_impact  # noqa: E402 # type: ignore

# reads DATABASE_URL from environment (REQUIRED)
DATABASE_URL: str = os.environ["DATABASE_URL"]


def query(sql: str, params=None) -> list[dict]:
    with psycopg2.connect(DATABASE_URL) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params or [])
            return [dict(r) for r in cur.fetchall()]


# Same as query(), but for results with millions of rows: streams them out of
# Postgres as CSV straight into a DataFrame, instead of building one Python
# dict per row (which is slow and can run the server out of memory). With no
# rows, pandas can't tell the column types, so callers ask for numbers explicitly
# (e.g. .to_numpy(float)) where they need them.
def query_df(sql: str, params=None) -> pd.DataFrame:
    buf = io.BytesIO()
    with psycopg2.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            copy_sql = cur.mogrify(f"COPY ({sql}) TO STDOUT WITH CSV HEADER", params or []).decode()
            cur.copy_expert(copy_sql, buf)
    buf.seek(0)
    return pd.read_csv(buf)


# Same statement as docker/init.sql's -- also run on every startup because
# init.sql only runs when a brand-new database is created, and the live
# database predates this table.
FEEDBACK_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS feedback (
    id          BIGSERIAL PRIMARY KEY,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    category    TEXT NOT NULL CHECK (category IN ('issue', 'feature', 'other')),
    title       TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
    message     TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 2000),
    email       TEXT,
    status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'in_progress', 'completed', 'rejected')),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
"""

# Adds the title column to feedback tables created before it existed;
# submissions from back then get "(no title)". No-op once it's there.
FEEDBACK_TITLE_COLUMN_SQL = """
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS
    title TEXT NOT NULL DEFAULT '(no title)' CHECK (char_length(title) BETWEEN 1 AND 120);
ALTER TABLE feedback ALTER COLUMN title DROP DEFAULT;
"""


@asynccontextmanager
async def lifespan(app: FastAPI):
    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn, conn.cursor() as cur:
            cur.execute(FEEDBACK_TABLE_SQL)
            cur.execute(FEEDBACK_TITLE_COLUMN_SQL)
    finally:
        conn.close()
    yield

app = FastAPI(lifespan=lifespan)

CORS_ORIGINS = os.environ.get(
    "CORS_ORIGINS",
    "http://localhost,http://localhost:3000,http://localhost:5173",
).split(",")
app.add_middleware(
    CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"],
    # lets a cross-origin frontend (VITE_API_URL dev setup) read file
    # download names, e.g. /api/noise-impact/export's zip
    expose_headers=["Content-Disposition"],
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
    end: str  # a day (YYYY-MM-DD), included in full: queries use < end + 1 day


@app.post("/api/region/vessels")
def get_region_vessels(req: RegionRequest):
    """Lightweight endpoint — positions + MMSI list only, no plots."""
    try:
        polygon = shape(req.polygon)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid GeoJSON polygon")

    minx, miny, maxx, maxy = polygon.bounds
    df = query_df("""
        SELECT p.mmsi, p.latitude AS lat, p.longitude AS lon, p.speed AS sog, v.ship_type,
               p.source, floor(extract(epoch FROM p.received_at) / 120)::bigint AS slot
        FROM ais_positions p
        LEFT JOIN vessels v USING (mmsi)
        WHERE p.received_at >= %s AND p.received_at < %s::date + 1
          AND p.latitude  BETWEEN %s AND %s
          AND p.longitude BETWEEN %s AND %s
          AND p.mmsi BETWEEN 200000000 AND 799999999
        ORDER BY p.mmsi, p.received_at
    """, [req.start, req.end, miny, maxy, minx, maxx])

    # Filter to exact polygon, checking all points in one go
    shapely.prepare(polygon)
    df = df[shapely.contains_xy(polygon, df["lon"].to_numpy(float), df["lat"].to_numpy(float))]

    # For the live CCG feed (2026 on, tagged by pipeline/ingest_ccg_streaming.py)
    # keep only each vessel's first position in every 2-minute slot: it has a
    # position every few seconds, so most dots sat on top of each other and
    # the map lagged drawing them. Other sources (the older satellite data)
    # are sparse already and are kept as they are.
    live = df[df["source"] == "CCG_terrestrial"]
    repeats = live.index[live.duplicated(["mmsi", "slot"])]
    df = df.drop(index=repeats).drop(columns=["source", "slot"])
    df["ship_type"] = df["ship_type"].astype("Int64")  # whole numbers in the JSON (81, not 81.0)

    # The reply is written out by pandas rather than returned as one dict per
    # point: FastAPI's own JSON conversion of a dict per point is very slow
    # when there are hundreds of thousands of points.
    mmsis = json.dumps(sorted(df["mmsi"].unique().tolist()))
    positions = df.to_json(orient="records")
    return Response(content=f'{{"vessel_mmsis": {mmsis}, "positions": {positions}}}', media_type="application/json")


# vessel traffic density (time ships spent per cell) of a drawn region as a see-through PNG, shown on the map by the Heat map button
@app.post("/api/region/heatmap")
def get_region_heatmap(req: RegionRequest):
    try:
        polygon = shape(req.polygon)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid GeoJSON polygon")

    minx, miny, maxx, maxy = polygon.bounds
    pad = 0.1  # degrees: pings just outside let ships be followed in across the edge
    df = query_df("""
        SELECT p.mmsi, extract(epoch FROM p.received_at) AS t, p.latitude, p.longitude
        FROM ais_positions p
        WHERE p.received_at >= %s AND p.received_at < %s::date + 1
          AND p.latitude  BETWEEN %s AND %s
          AND p.longitude BETWEEN %s AND %s
          AND p.mmsi BETWEEN 200000000 AND 799999999
    """, [req.start, req.end, miny - pad, maxy + pad, minx - pad, maxx + pad])

    if df.empty or not shapely.contains_xy(polygon, df["longitude"].to_numpy(float), df["latitude"].to_numpy(float)).any():
        return {"image": None, "extent": None, "error": "No vessel activity found in this region for the selected dates."}
    n_days = (pd.Timestamp(req.end) - pd.Timestamp(req.start)).days + 1
    try:
        return {**render_vessel_density_overlay(df, polygon, max(1, n_days)), "error": None}
    except ValueError as e:
        return {"image": None, "extent": None, "error": str(e)}


# runs a FULL analysis on a drawn region (daily vessel counts by type, speed distribution, density plot)
# used by Map.tsx for the region-analysis feature when showing results inside the pop-up modal
@app.post("/api/analysis/region")
def analyse_region(req: RegionRequest):
    try:
        polygon = shape(req.polygon)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid GeoJSON polygon")

    minx, miny, maxx, maxy = polygon.bounds
    pad = 0.1  # degrees: as for the heat map, pings just outside let ships be followed in

    df = query_df("""
        SELECT p.mmsi, extract(epoch FROM p.received_at) AS t, to_char(p.received_at, 'YYYY-MM-DD') AS day,
               p.latitude, p.longitude, p.speed, v.ship_type
        FROM ais_positions p
        LEFT JOIN vessels v USING (mmsi)
        WHERE p.received_at >= %s AND p.received_at < %s::date + 1
          AND p.latitude  BETWEEN %s AND %s
          AND p.longitude BETWEEN %s AND %s
          AND p.mmsi BETWEEN 200000000 AND 799999999
    """, [req.start, req.end, miny - pad, maxy + pad, minx - pad, maxx + pad])

    # Exact polygon, checking all points in one go
    shapely.prepare(polygon)
    inside = shapely.contains_xy(polygon, df["longitude"].to_numpy(float), df["latitude"].to_numpy(float))
    if not inside.any():
        return {"days": [], "total_positions": 0, "unique_vessels": 0, "plots": {}}

    # The density map uses the pings around the region too, so it is made
    # before the rest is cut down to the region itself
    n_days = (pd.Timestamp(req.end) - pd.Timestamp(req.start)).days + 1
    try:
        density_plot = plot_vessel_density(df, polygon, max(1, n_days))
    except ValueError:
        density_plot = None
    df = df[inside]

    # classify each ship-type code once, not once per position
    labels = {code: classify_ship_type(code) for code in df["ship_type"].unique()}
    df["type_label"] = df["ship_type"].map(labels).fillna("unknown")

    # Daily unique vessel counts by type
    daily_counts = (
        df.groupby(["day", "type_label"])["mmsi"]
        .nunique()
        .unstack(fill_value=0)
        .reindex(columns=ORDERED_TYPES, fill_value=0)
    )

    # Daily stats for JSON response (only the types seen that day)
    days = [
        {"date": day, "vessel_counts": {t: int(n) for t, n in counts.items() if n > 0}}
        for day, counts in daily_counts.iterrows()
    ]
    daily_counts.index = pd.to_datetime(daily_counts.index)

    unique_vessels = int(df["mmsi"].nunique())

    plots = {
        "vessel_types":  plot_vessel_types(daily_counts),
        "speed_overall": plot_speed_overall(df[["day", "speed"]].rename(columns={"speed": "speed"})),
    }
    if density_plot:
        plots["vessel_density"] = density_plot
    else:
        plots["vessel_density_error"] = "Not enough position data for a density map."

    return {
        "days": days,
        "total_positions": len(df),
        "unique_vessels": unique_vessels,
        "plots": plots,
    }



# --- NOISE MODEL OVERLAY ---

@app.get("/api/noise/available")
def get_noise_available():
    """Return available (variable, freq, depth) combinations by scanning noise_data/."""
    result: dict[str, list[dict]] = {}
    try:
        entries = os.listdir(NOISE_DATA_DIR)
    except FileNotFoundError:
        return result
    for name in entries:
        if not os.path.isdir(os.path.join(NOISE_DATA_DIR, name)):
            continue
        parsed = parse_combo_dirname(name)
        if parsed:
            var, freq, depth = parsed
            result.setdefault(var, []).append({"freq": freq, "depth": depth})
    return result


@app.get("/api/noise/dates")
def get_noise_dates(
    variable: str = Query("combined_noise"),
    freq: float = Query(50),
    depth: float = Query(10),
):
    """Return sorted list of available date strings for a given variable/freq/depth."""
    dir_path = os.path.join(NOISE_DATA_DIR, combo_dirname(variable, freq, depth))
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
    variable: str = Query("combined_noise"),
    freq: float = Query(50),
    depth: float = Query(10, description="Depth in metres; must match an already-converted GeoTIFF exactly (see analysis/noise.py's module docstring for how to convert more)"),
):
    try:
        vmin, vmax = noise_range(date, variable=variable, freq=freq, depth=depth)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"No noise data for {date}")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"vmin": round(vmin, 1), "vmax": round(vmax, 1)}


# renders the noise data as a PNG image, for the map overlay
# used by useNoiseLayer.ts (main noise layer)
@app.get("/api/noise/overlay")
def get_noise_overlay(
    date: str = Query(..., description="YYYY-MM-DD (daily) or YYYY-MM (monthly)"),
    variable: str = Query("combined_noise"),
    freq: float = Query(50),
    depth: float = Query(10),
    vmin: float | None = Query(None, description="Override the auto colour-scale minimum (dB)"),
    vmax: float | None = Query(None, description="Override the auto colour-scale maximum (dB)"),
):
    try:
        png = render_noise_overlay(date, variable=variable, freq=freq, depth=depth, vmin=vmin, vmax=vmax)
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


@app.get("/api/noise-impact/info")
def get_noise_impact_info():
    """Hover-tooltip text for hearing groups / impact types, sourced from
    the regulatory thresholds workbook's own Info sheet."""
    return list_noise_impact_info()


class NoiseImpactCustomThreshold(BaseModel):
    # Checked (name, metric, dB range, duplicates) in analysis/noise_impact.py's
    # _validate_custom, which holds the limits.
    name: str
    metric: str
    threshold_db: float
    # Hearing group whose curve the noise is weighted by; None = unweighted.
    weighting: str | None = None


class NoiseImpactMitigation(BaseModel):
    # system is a key of analysis/noise_impact.py's MITIGATION_SYSTEMS; the
    # reductions (dB) are checked against its ranges in _validate_mitigation.
    system: str
    il_peak_db: float
    il_sel_db: float


class NoiseImpactSourceFormula(BaseModel):
    # reference is a key of analysis/noise_impact.py's PEAK_SPL_FORMULAS or
    # SEL_STRIKE_FORMULAS; checked in _validate_source_formula.
    reference: str
    energy_kj: float
    diameter_m: float


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
    # (hearing group, impact) pairs picked in the threshold grid -- zones
    # outside these are dropped (see analysis/noise_impact.py's _run_model).
    # None runs every hearing_groups x impact_types combination; [] runs
    # none of them (custom thresholds only).
    pairs: list[tuple[str, str]] | None = None
    # User-entered thresholds, run alongside the workbook ones (see
    # analysis/noise_impact.py's _run_custom).
    custom_thresholds: list[NoiseImpactCustomThreshold] = []
    # Noise mitigation system, taken off the source levels; None = none.
    mitigation: NoiseImpactMitigation | None = None
    # Works out spl_peak from hammer energy and pile diameter instead (the
    # spl_peak sent is then ignored); None = use spl_peak as typed.
    peak_spl_formula: NoiseImpactSourceFormula | None = None
    # The same for sel_single_strike, with its own hammer energy and diameter.
    sel_strike_formula: NoiseImpactSourceFormula | None = None


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
            pairs=req.pairs,
            custom_thresholds=[c.model_dump() for c in req.custom_thresholds],
            mitigation=req.mitigation.model_dump() if req.mitigation else None,
            peak_spl_formula=req.peak_spl_formula.model_dump() if req.peak_spl_formula else None,
            sel_strike_formula=req.sel_strike_formula.model_dump() if req.sel_strike_formula else None,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


class NoiseImpactExportRequest(NoiseImpactRequest):
    # keys of analysis/noise_impact.py's EXPORT_FORMATS
    format: Literal["shp", "gpkg"] = "shp"


# returns the same run's exceeded impact zones as a zipped Shapefile or GeoPackage download.
# used by useNoiseImpact.ts's handleExport, with the last Run's exact request body + format.
@app.post("/api/noise-impact/export")
def post_noise_impact_export(req: NoiseImpactExportRequest):
    try:
        filename, data = export_noise_impact(
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
            pairs=req.pairs,
            custom_thresholds=[c.model_dump() for c in req.custom_thresholds],
            mitigation=req.mitigation.model_dump() if req.mitigation else None,
            peak_spl_formula=req.peak_spl_formula.model_dump() if req.peak_spl_formula else None,
            sel_strike_formula=req.sel_strike_formula.model_dump() if req.sel_strike_formula else None,
            fmt=req.format,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    return Response(
        content=data,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# --- FEEDBACK ---

# Shared password for the /feedback-inbox page, set in the server's .env
# (never committed). Unset means the inbox is locked for everyone.
FEEDBACK_INBOX_PASSWORD = os.environ.get("FEEDBACK_INBOX_PASSWORD", "")


class FeedbackRequest(BaseModel):
    category: Literal["issue", "feature", "other"]
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
    email: Annotated[str, StringConstraints(strip_whitespace=True, max_length=254)] | None = None


class FeedbackStatusRequest(BaseModel):
    status: Literal["pending", "in_progress", "completed", "rejected"]


class FeedbackDeleteRequest(BaseModel):
    ids: Annotated[list[int], Field(min_length=1, max_length=1000)]


def check_inbox_password(password: str | None):
    if not FEEDBACK_INBOX_PASSWORD:
        raise HTTPException(status_code=503, detail="Feedback inbox password is not configured on the server")
    if not password or not hmac.compare_digest(password.encode(), FEEDBACK_INBOX_PASSWORD.encode()):
        raise HTTPException(status_code=401, detail="Wrong password")


# saves one submission from the Feedback side panel -- open to everyone
@app.post("/api/feedback")
def post_feedback(req: FeedbackRequest):
    rows = query(
        """INSERT INTO feedback (category, title, message, email)
           VALUES (%s, %s, %s, %s)
           RETURNING id, created_at""",
        [req.category, req.title, req.message, req.email or None],
    )
    return rows[0]


# lists every submission, newest first -- used by the /feedback-inbox page
@app.get("/api/feedback")
def get_feedback(x_inbox_password: str | None = Header(None)):
    check_inbox_password(x_inbox_password)
    return query(
        """SELECT id, created_at, category, title, message, email, status, updated_at
           FROM feedback
           ORDER BY created_at DESC, id DESC"""
    )


# changes one submission's status from the /feedback-inbox page
@app.patch("/api/feedback/{feedback_id}")
def patch_feedback_status(feedback_id: int, req: FeedbackStatusRequest, x_inbox_password: str | None = Header(None)):
    check_inbox_password(x_inbox_password)
    rows = query(
        """UPDATE feedback SET status = %s, updated_at = NOW()
           WHERE id = %s
           RETURNING id, status, updated_at""",
        [req.status, feedback_id],
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Feedback not found")
    return rows[0]


# permanently deletes the ticked submissions from the /feedback-inbox page --
# one request for the whole selection, so it's all-or-nothing
@app.post("/api/feedback/delete")
def delete_feedback(req: FeedbackDeleteRequest, x_inbox_password: str | None = Header(None)):
    check_inbox_password(x_inbox_password)
    rows = query("DELETE FROM feedback WHERE id = ANY(%s) RETURNING id", [req.ids])
    return {"deleted": [r["id"] for r in rows]}

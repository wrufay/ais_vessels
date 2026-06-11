"""
Scotian Shelf AIS Vessel Tracker — FastAPI backend.
Requires TimescaleDB/Postgres via DATABASE_URL.

Run locally:  DATABASE_URL=postgresql://... uvicorn main:app --reload
"""

import os
from contextlib import asynccontextmanager
from typing import List

import psycopg2
import psycopg2.extras
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from shapely.geometry import Point, shape

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
def get_vessels():
    rows = query("""
        SELECT
            p.mmsi,
            v.name AS vessel_name,
            v.ship_type,
            p.source
        FROM (SELECT DISTINCT ON (mmsi) mmsi, source FROM ais_positions ORDER BY mmsi, received_at DESC) p
        LEFT JOIN vessels v USING (mmsi)
        WHERE p.mmsi BETWEEN 200000000 AND 799999999
        ORDER BY v.name NULLS LAST, p.mmsi
    """)
    return {"vessels": rows, "count": len(rows)}


@app.get("/api/vessel/{mmsi}/route")
def get_vessel_route(
    mmsi: int,
    start: str | None = Query(None),
    end: str | None = Query(None),
):
    if ALLOWED_MMSIS and mmsi not in ALLOWED_MMSIS:
        raise HTTPException(status_code=404, detail="Vessel not found")

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
        return {"days": [], "total_positions": 0, "unique_vessels": 0}

    # Build daily stats
    from collections import defaultdict
    daily: dict = defaultdict(lambda: defaultdict(set))
    daily_speed: dict = defaultdict(lambda: defaultdict(list))

    for r in inside:
        day = str(r["received_at"])[:10]
        label = classify_ship_type(r["ship_type"])
        daily[day][label].add(r["mmsi"])
        if r["speed"] is not None:
            daily_speed[day][label].append(r["speed"])

    days = []
    for day in sorted(daily):
        counts = {t: len(daily[day][t]) for t in daily[day]}
        speeds = {t: round(sum(v)/len(v), 2) for t, v in daily_speed[day].items() if v}
        days.append({"date": day, "vessel_counts": counts, "mean_speed": speeds})

    unique_vessels = len({r["mmsi"] for r in inside})

    return {
        "days": days,
        "total_positions": len(inside),
        "unique_vessels": unique_vessels,
    }

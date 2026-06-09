"""
Scotian Shelf AIS Vessel Tracker — FastAPI backend.
Requires TimescaleDB/Postgres via DATABASE_URL.

Run locally:  DATABASE_URL=postgresql://... uvicorn main:app --reload
"""

import os
from contextlib import asynccontextmanager

import psycopg2
import psycopg2.extras
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

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

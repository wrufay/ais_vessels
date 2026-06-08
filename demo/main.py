"""
Scotian Shelf AIS Vessel Tracker — demo backend (SQLite, 18 vessels).

Deployed on Railway. Reads from data/ais.db which is committed to the repo
with a small cherry-picked sample safe to make public.

Run locally:  uvicorn demo.main:app --reload
"""

import os
import sqlite3
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

DB_PATH = Path(__file__).parent / "data" / "ais.db"

ALLOWED_MMSIS: set[int] = set()


def to_epoch(dt_str: str) -> int:
    dt = datetime.fromisoformat(dt_str)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp())


def query(sql: str, params: list | None = None) -> list[dict]:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    rows = conn.execute(sql, params or []).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@asynccontextmanager
async def lifespan(_: FastAPI):
    global ALLOWED_MMSIS
    try:
        rows = query(
            "SELECT DISTINCT mmsi FROM ais_202503_static WHERE mmsi BETWEEN 200000000 AND 799999999 ORDER BY mmsi"
        )
        ALLOWED_MMSIS = {r["mmsi"] for r in rows}
        print(f"Loaded {len(ALLOWED_MMSIS)} vessels from SQLite.")
    except Exception as e:
        print(f"Warning: could not load vessels ({e}).")
    yield


app = FastAPI(lifespan=lifespan)

CORS_ORIGINS = os.environ.get(
    "CORS_ORIGINS",
    "https://vesselviz.vercel.app,http://localhost:3000,http://localhost:5173",
).split(",")
app.add_middleware(
    CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"]
)


@app.get("/")
def root():
    return {"message": "demo app is running", "db": "sqlite"}


@app.get("/api/vessels")
def get_vessels():
    rows = query("""
        SELECT mmsi, vessel_name, ship_type, 'CCG' AS source
        FROM (
            SELECT mmsi, vessel_name, ship_type,
                   ROW_NUMBER() OVER (
                       PARTITION BY mmsi
                       ORDER BY CASE WHEN vessel_name IS NOT NULL AND vessel_name != '' THEN 0 ELSE 1 END
                   ) AS rn
            FROM ais_202503_static WHERE mmsi IS NOT NULL
        ) WHERE rn = 1
    """)
    seen: set[int] = set()
    vessels = []
    for r in rows:
        if r["mmsi"] in ALLOWED_MMSIS and r["mmsi"] not in seen:
            seen.add(r["mmsi"])
            vessels.append(r)
    return {"vessels": vessels, "count": len(vessels)}


@app.get("/api/vessel/{mmsi}/route")
def get_vessel_route(
    mmsi: int,
    start: str | None = Query(None),
    end: str | None = Query(None),
):
    if ALLOWED_MMSIS and mmsi not in ALLOWED_MMSIS:
        raise HTTPException(status_code=404, detail="Vessel not found")

    sql = "SELECT time, longitude, latitude, sog, cog FROM ais_202503_dynamic WHERE mmsi = ?"
    params: list = [mmsi]

    if start:
        sql += " AND time >= ?"
        params.append(to_epoch(start))
    if end:
        sql += " AND time <= ?"
        params.append(to_epoch(end))

    sql += " ORDER BY time"

    points = [
        {
            "time": r["time"],
            "latitude": r["latitude"],
            "longitude": r["longitude"],
            "sog": r["sog"],
            "cog": r["cog"],
            "source": "CCG",
        }
        for r in query(sql, params)
    ]
    return {"mmsi": mmsi, "points": points, "count": len(points)}

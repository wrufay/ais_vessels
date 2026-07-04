"""
Mock API for vessel-tracks — serves static fixture data, no database needed.
Mirrors the real main.py endpoints so the frontend works unchanged.

Run:  cd mock_api && uvicorn main:app --reload --port 8000
"""

import json
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

FIXTURES = Path(__file__).parent / "fixtures"

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"message": "mock api is running"}


@app.get("/api/vessels")
def get_vessels(start: str | None = Query(None), end: str | None = Query(None)):
    data = json.loads((FIXTURES / "vessels.json").read_text())
    return data


@app.get("/api/vessel/{mmsi}/route")
def get_vessel_route(
    mmsi: int,
    start: str | None = Query(None),
    end: str | None = Query(None),
):
    path = FIXTURES / "routes" / f"{mmsi}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"No route data for MMSI {mmsi}")
    return json.loads(path.read_text())


@app.get("/api/noise/extent")
def get_noise_extent():
    return {
        "minLon": -69.5,
        "maxLon": -59.0,
        "minLat": 41.0,
        "maxLat": 46.0,
    }


@app.get("/api/noise/overlay")
def get_noise_overlay(
    date: str = Query(...),
    variable: str = Query("vessel_noise"),
    freq: float = Query(50),
    depth: float = Query(10),
):
    raise HTTPException(status_code=404, detail="No noise data in mock API")


class RegionRequest(BaseModel):
    polygon: dict
    start: str
    end: str


@app.post("/api/region/vessels")
def get_region_vessels(req: RegionRequest):
    return {"vessel_mmsis": [], "positions": []}


@app.post("/api/analysis/region")
def analyse_region(req: RegionRequest):
    return {"days": [], "total_positions": 0, "unique_vessels": 0, "plots": {}}

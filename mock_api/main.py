"""
Mock API for vessel-tracks — serves static fixture data, no database needed.
Mirrors the real main.py endpoints so the frontend works unchanged.

Run:  cd mock_api && uvicorn main:app --reload --port 8000
"""

import json
import os
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

FIXTURES = Path(__file__).parent / "fixtures"

# Re-use the real analysis code — noise TIFs are committed to the repo.
sys.path.insert(0, str(Path(__file__).parent.parent / "analysis"))
from noise import render_noise_overlay, noise_range, NOISE_EXTENT, NOISE_DATA_DIR  # noqa: E402

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
    return NOISE_EXTENT


@app.get("/api/noise/available")
def get_noise_available():
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
):
    try:
        png = render_noise_overlay(date, variable=variable, freq=freq, depth=depth)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"No noise data for {date}")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return Response(content=png, media_type="image/png")


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

"""
Mock API server for local frontend development — no database needed.

Install: pip install fastapi uvicorn matplotlib
Run:     uvicorn mock_api:app --reload --port 8000
Then:    set VITE_API_URL=http://localhost:8000 in frontend/.env and run npm run dev
"""

import base64
import io
import math
import random

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

random.seed(42)

FAKE_VESSELS = [
    {"mmsi": 316001234, "vessel_name": "Atlantic Condor",   "ship_type": 70, "source": "terrestrial"},
    {"mmsi": 316002345, "vessel_name": "Nova Pioneer",      "ship_type": 70, "source": "terrestrial"},
    {"mmsi": 316003456, "vessel_name": "Ocean Harvester",   "ship_type": 30, "source": "terrestrial"},
    {"mmsi": 316004567, "vessel_name": "Cape Breton Star",  "ship_type": 80, "source": "satellite"},
    {"mmsi": 316005678, "vessel_name": "Halifax Express",   "ship_type": 70, "source": "terrestrial"},
    {"mmsi": 316006789, "vessel_name": "Bluenose Spirit",   "ship_type": 60, "source": "terrestrial"},
    {"mmsi": 316007890, "vessel_name": "Scotia Warrior",    "ship_type": 80, "source": "satellite"},
    {"mmsi": 316008901, "vessel_name": "East Coast Fisher", "ship_type": 30, "source": "terrestrial"},
    {"mmsi": 316009012, "vessel_name": "Sable Star",        "ship_type": 70, "source": "satellite"},
    {"mmsi": 316010123, "vessel_name": "Grand Banks",       "ship_type": 30, "source": "terrestrial"},
    {"mmsi": 316011234, "vessel_name": "Lunenburg Lady",    "ship_type": 60, "source": "terrestrial"},
    {"mmsi": 316012345, "vessel_name": "Yarmouth Trader",   "ship_type": 70, "source": "terrestrial"},
    {"mmsi": 316013456, "vessel_name": None,                "ship_type": 99, "source": "satellite"},
    {"mmsi": 316014567, "vessel_name": "Shelburne Spray",   "ship_type": 30, "source": "terrestrial"},
    {"mmsi": 316015678, "vessel_name": "Fundy Carrier",     "ship_type": 80, "source": "satellite"},
]


def _to_b64(fig) -> str:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=100, bbox_inches="tight")
    plt.close(fig)
    return base64.b64encode(buf.getvalue()).decode()


@app.get("/")
def root():
    return {"message": "mock api running"}


@app.get("/api/vessels")
def get_vessels():
    return {"vessels": FAKE_VESSELS, "count": len(FAKE_VESSELS)}


@app.get("/api/vessel/{mmsi}/route")
def get_vessel_route(mmsi: int, start: str = "2025-08-01T00:00:00", end: str = "2025-08-31T23:59:59"):
    vessel = next((v for v in FAKE_VESSELS if v["mmsi"] == mmsi), None)
    if not vessel:
        return {"mmsi": mmsi, "points": [], "count": 0}

    rng = random.Random(mmsi)

    # random start position on the Scotian Shelf
    lat0 = rng.uniform(43.0, 46.0)
    lon0 = rng.uniform(-66.0, -59.0)
    # random heading in degrees
    heading = rng.uniform(0, 360)
    speed = rng.uniform(4, 14)  # knots

    n_points = rng.randint(60, 300)
    import datetime
    t_start = datetime.datetime(2025, 8, rng.randint(1, 15), 0, 0, 0)
    interval_minutes = rng.randint(10, 30)

    points = []
    lat, lon = lat0, lon0
    t = t_start
    for _ in range(n_points):
        # slight heading drift
        heading += rng.gauss(0, 3)
        sog = speed + rng.gauss(0, 1.5)
        sog = max(0.0, round(sog, 1))
        cog = round(heading % 360, 1)

        # move vessel
        dist_nm = sog * (interval_minutes / 60)
        lat += dist_nm * math.cos(math.radians(heading)) / 60
        lon += dist_nm * math.sin(math.radians(heading)) / (60 * math.cos(math.radians(lat)))

        points.append({
            "time":      int(t.timestamp()),
            "latitude":  round(lat, 6),
            "longitude": round(lon, 6),
            "sog":       sog,
            "cog":       cog,
            "source":    vessel["source"],
        })
        t += datetime.timedelta(minutes=interval_minutes)

    return {"mmsi": mmsi, "points": points, "count": len(points)}


ORDERED_TYPES = ["cargo", "tanker", "fishing", "passenger", "search and rescue vessel", "other", "unknown"]
TYPE_COLORS   = ["#f4a261", "#e76f51", "#2a9d8f", "#8d6cc4", "#43aa8b", "#9aa5b1", "#cbd2d9"]


class RegionRequest(BaseModel):
    polygon: dict
    start: str
    end: str


@app.post("/api/analysis/region")
def analyse_region(req: RegionRequest):
    import datetime, numpy as np

    try:
        start_dt = datetime.date.fromisoformat(req.start[:10])
        end_dt   = datetime.date.fromisoformat(req.end[:10])
    except ValueError:
        start_dt = datetime.date(2025, 8, 1)
        end_dt   = datetime.date(2025, 8, 31)

    days = []
    current = start_dt
    while current <= end_dt:
        counts = {
            "cargo":    random.randint(2, 8),
            "tanker":   random.randint(0, 4),
            "fishing":  random.randint(3, 12),
            "passenger":random.randint(0, 3),
            "other":    random.randint(1, 5),
        }
        days.append({"date": current.isoformat(), "vessel_counts": counts})
        current += datetime.timedelta(days=1)

    total_vessels   = random.randint(40, 120)
    total_positions = random.randint(8000, 50000)

    # --- plot 1: stacked bar by vessel type ---
    fig1, ax1 = plt.subplots(figsize=(7, 3))
    dates = [d["date"] for d in days]
    bottoms = [0] * len(dates)
    for i, (type_name, color) in enumerate(zip(ORDERED_TYPES[:5], TYPE_COLORS[:5])):
        vals = [d["vessel_counts"].get(type_name, 0) for d in days]
        ax1.bar(range(len(dates)), vals, bottom=bottoms, label=type_name, color=color, width=0.85)
        bottoms = [b + v for b, v in zip(bottoms, vals)]
    ax1.set_xticks(range(0, len(dates), max(1, len(dates) // 8)))
    ax1.set_xticklabels([dates[i][:10] for i in range(0, len(dates), max(1, len(dates) // 8))], rotation=30, ha="right", fontsize=7)
    ax1.set_ylabel("Unique vessels")
    ax1.set_title("Daily vessels by type")
    ax1.legend(fontsize=7, ncol=3, loc="upper right")
    ax1.spines[["top", "right"]].set_visible(False)
    fig1.tight_layout()
    plot1 = _to_b64(fig1)

    # --- plot 2: mean speed line ---
    fig2, ax2 = plt.subplots(figsize=(7, 2.5))
    speeds = [round(random.gauss(7.5, 1.5), 2) for _ in days]
    ax2.plot(range(len(dates)), speeds, color="#127475", linewidth=1.8)
    ax2.fill_between(range(len(dates)), speeds, alpha=0.15, color="#127475")
    ax2.set_xticks(range(0, len(dates), max(1, len(dates) // 8)))
    ax2.set_xticklabels([dates[i][:10] for i in range(0, len(dates), max(1, len(dates) // 8))], rotation=30, ha="right", fontsize=7)
    ax2.set_ylabel("Mean speed (kt)")
    ax2.set_title("Daily mean speed — all vessels")
    ax2.spines[["top", "right"]].set_visible(False)
    fig2.tight_layout()
    plot2 = _to_b64(fig2)

    return {
        "days":             days,
        "total_positions":  total_positions,
        "unique_vessels":   total_vessels,
        "plots": {
            "vessel_types":  plot1,
            "speed_overall": plot2,
        },
    }

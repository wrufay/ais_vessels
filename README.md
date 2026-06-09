# Scotian Shelf AIS Vessel Tracker

Web tool for visualizing vessel traffic on the Scotian Shelf using AIS data from Canadian Coast Guard shore stations and exactEarth satellite feeds. Built for correlating vessel activity with underwater noise levels, marine mammal presence, and other oceanographic observations.

## Repo layout

```
/
  main.py                  FastAPI backend
  requirements.txt
  docker-compose.yml
  docker/
    backend.Dockerfile
    init.sql               DB schema (auto-created on first start)
  pipeline/
    ingest_csv.py          Bulk CSV loader (resumable, DuckDB-accelerated)
    requirements.txt
  frontend/                React + OpenLayers map UI
  analysis/
    sydney_bight.py        Sydney Bight WEA traffic analysis (August 2025)
```

## Stack

| Layer    | Technology                        |
|----------|-----------------------------------|
| Frontend | React + OpenLayers + Tailwind CSS |
| Backend  | FastAPI                           |
| Database | TimescaleDB (Postgres extension)  |
| Ingestion | DuckDB + psycopg2                |

## Setup (DFO server)

### 1. Add yourself to the docker group (one-time)

```bash
sudo usermod -aG docker $USER
```

Log out and back in for the group change to take effect. In the current session you can prefix docker commands with `sg docker -c "..."`.

### 2. Start the stack

```bash
docker compose up --build -d
```

Schema is created automatically on first start. Frontend is served at **http://localhost**.

To store Postgres data on external or mounted storage, set `PGDATA_PATH` in `.env`:

```
PGDATA_PATH=/mnt/external/pgdata
```

### 3. Set up the ingestion environment

```bash
python -m venv venv
source venv/bin/activate
pip install -r pipeline/requirements.txt
```

### 4. Load CSV data

Accepts both CCG terrestrial and exactEarth satellite CSV formats — columns are detected automatically.

```bash
python pipeline/ingest_csv.py /path/to/csv/dir --workers 4
```

The script is resumable — kill and restart anytime, already-processed files are skipped. Positions are filtered to the Scotian Shelf bounding box (lon -69 to -55, lat 41 to 47) on load.

## API

| Endpoint | Description |
|---|---|
| `GET /api/vessels` | All vessels with position data (MMSI, name, ship type, source) |
| `GET /api/vessel/{mmsi}/route?start&end` | Ordered position track for a vessel |

## Analysis

Sydney Bight WEA traffic statistics for August 2025:

```bash
source venv/bin/activate
python analysis/sydney_bight.py
```

Outputs to `analysis/`:
- `sydney_bight_vessel_types.png` — daily vessel counts by type (stacked bar)
- `sydney_bight_speed.png` — mean daily speed by vessel type
- `sydney_bight_speed_overall.png` — mean daily speed across all vessels
- `sydney_bight_map.png` — vessel positions inside the WEA colored by type
- `sydney_bight_stats.csv` — raw daily counts per type

Requires the WEA shapefile at `/home/shared/WEA_shapefiles/Designated_WEAs_25_07_29.shp`.


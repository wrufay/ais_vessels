# AIS data ingestion + UI prototype

Web interface hosted locally using Docker and accessible through DFO network.

Ingests decoded AIS data in form of .csv files. Compatible with exactEarth satellite (tested) and CCG terrestrial (untested)

Uses [DuckDB](https://duckdb.org) Python library to parse the large CSV files, data saved into [PostgreSQL](https://www.postgresql.org) database with [TimescaleDB](https://www.timescale.com) extension for faster querying.

Backend routing via [FastAPI](https://fastapi.tiangolo.com) to access data and relay to frontend, where vessel tracks are visualized with [React.js](https://react.dev) and [OpenLayers](https://openlayers.org) mapping library.


## Requirements

- Docker
- Python 3.10+
- Access to the DFO network

## Setup

**1. Add yourself to the docker group (one-time)**
```bash
sudo usermod -aG docker $USER
```
Log out and back in. Until then, prefix docker commands with `sg docker -c "..."`.

**2. Start the stack**
```bash
docker compose up --build -d
```
Frontend available at **http://localhost** or **http://142.2.83.73** from other DFO machines.

**3. Install pipeline dependencies**
```bash
python -m venv venv
source venv/bin/activate
pip install -r pipeline/requirements.txt
```

**4. Load data**
```bash
python pipeline/ingest_csv.py /path/to/csv/dir --workers 4
```
Accepts CCG terrestrial and exactEarth satellite CSV formats. Resumable — already-processed files are skipped.

## Architecture

```
AIS CSV files (CCG terrestrial + exactEarth satellite)
    │
    │  pipeline/ingest_csv.py
    │  - DuckDB reads and filters CSV to Scotian Shelf bbox
    │  - bulk inserts into Postgres via COPY
    ▼
Postgres / TimescaleDB (Docker)
    │
    │  FastAPI backend
    ▼
React + OpenLayers UI  →  http://142.2.83.73
```

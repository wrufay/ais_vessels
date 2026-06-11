# AIS data ingestion + UI prototype

Web interface to test decoded AIS data ingestion pipeline end-to-end, hosted locally on the DFO network via Docker.


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

## Workflow

- Ingests decoded AIS data (.csv): compatible with exactEarth satellite and CCG terrestrial (untested)

- Uses [DuckDB](https://duckdb.org) Python library to parse the large CSV files, saves into PostgreSQL database with [TimescaleDB](https://www.timescale.com) extension for faster querying.

- Backend routing via FastAPI to access data and relay to frontend, where vessel tracks are visualized with React.js and [OpenLayers](https://openlayers.org) mapping library.

- Containerized with Docker allowing database, backend and frontend to run as isolated services to keep data and development local to DFO network.



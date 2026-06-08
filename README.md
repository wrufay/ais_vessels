# Scotian Shelf AIS Vessel Tracker

Web tool for visualizing vessel traffic on the Scotian Shelf using AIS data from Canadian Coast Guard shore stations. Built for correlating vessel activity with underwater noise levels, marine mammal presence, and other oceanographic observations.

## Repo layout

```
/                        local research tool (Docker + TimescaleDB)
  main.py                FastAPI backend
  requirements.txt
  decode.py              CCG NMEA → SQLite decoder (standalone utility)
  docker-compose.yml
  docker/
    backend.Dockerfile
    init.sql             DB schema (created automatically on first start)
  pipeline/
    ingest_csv.py        bulk CSV loader (resumable)
  frontend/              React + OpenLayers map

demo/                    deployed public demo (Railway + Vercel, 18 vessels)
  main.py                SQLite backend
  data/ais.db            committed demo DB
  Procfile / railway.json
  pipeline/ingest.py     aisdb-based ingestion (used to build the demo DB)
```

## Stack

| Layer    | Technology                        |
|----------|-----------------------------------|
| Frontend | React + OpenLayers + Tailwind CSS |
| Backend  | FastAPI                           |
| Database | TimescaleDB (Postgres extension)  |

## Running locally

Requires Docker and Docker Compose.

```bash
docker compose up -d
```

Schema is created automatically on first start. Frontend is served at **http://localhost**.

To store Postgres data on external/mounted storage, set `PGDATA_PATH` in `.env`:
```
PGDATA_PATH=/mnt/external/pgdata
```

## Loading data

Input CSVs must be in the CCG decoded format with columns: `mmsi`, `message_type`, `latitude`, `longitude`, `speed`, `course`, `heading`, `name`, `ship_type`, `callsign`, `imo`, `source`, `reception_timestamp`.

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ais \
python pipeline/ingest_csv.py /path/to/csv/dir --workers 8
```

The script is resumable — kill and restart anytime, already-processed files are skipped. Tune `--workers` to match available CPU cores.

After the initial bulk load, add the index:
```sql
CREATE INDEX ON ais_positions (mmsi, received_at DESC);
```

## API

| Endpoint | Description |
|---|---|
| `GET /api/vessels` | All vessels (MMSI, name, ship type) |
| `GET /api/vessel/{mmsi}/route?start&end` | Ordered position track for a vessel |

## Demo

A small public demo (18 hand-picked vessels, March 2025) is deployed separately from the `demo/` directory via Railway (backend) and Vercel (frontend).

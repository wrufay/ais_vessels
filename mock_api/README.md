# Mock API

Serves real vessel data from a local SQLite snapshot (`mock.db`), so the frontend
works fully — including region select/analysis — without the real Postgres DB running.

## Setup

1. Seed `mock.db` with whichever real vessels you want, pulled from the real DB
   (requires the real Postgres reachable, e.g. via `docker compose up db`):

   ```bash
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ais_v2 \
     venv/bin/python mock_api/seed_db.py 255801680
   ```

   Add more MMSIs as extra args any time — re-running replaces `mock.db` from scratch.

2. Run the API (note: `venv`'s console scripts have a stale shebang from before this
   repo was renamed, so invoke uvicorn as a module):

   ```bash
   cd mock_api
   ../venv/bin/python -m uvicorn main:app --reload --port 8001
   ```

3. Point the frontend at it:

   ```bash
   cd frontend
   VITE_API_URL=http://localhost:8001 npm run dev
   ```

## What's included

- Whichever vessels you've seeded, with their *full* position history (not sampled)
- `/api/vessels`, `/api/vessel/{mmsi}/route` — same shape as the real API
- `/api/region/vessels`, `/api/analysis/region` — real polygon-filtering + stats logic,
  reusing `analysis/plots.py` for the charts
- Noise endpoints reuse `analysis/noise.py` against the committed noise GeoTIFs, same as before

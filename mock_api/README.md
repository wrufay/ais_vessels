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

   **Must run from inside `mock_api/`.** `uvicorn main:app` from the repo root (even
   with `venv` activated) loads the *other* `main.py` — the real backend, which expects
   a live Postgres via `DATABASE_URL` and will fail without it. Same filename, different
   app, easy to grab the wrong one if you `cd` back to root first.

   If this fails with `ModuleNotFoundError` for something like `geopandas` or
   `openpyxl`, your `venv` predates the noise-impact vendor package being added to
   `requirements.txt` — reinstall from the repo root: `venv/bin/pip install -r requirements.txt`.

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
- Noise-impact endpoints (`/api/noise-impact/*`) work with zero setup, anywhere — the real
  package + CSnap dataset normally live at `/home/shared` (too large to commit, ~950MB, and
  specific to the machine this was developed on), so `analysis/noise_impact.py` automatically
  falls back to a small vendored copy of the package (`mock_api/vendor`) and synthetic
  fixture data (`mock_api/noise_impact_fixtures`, regenerate via
  `venv/bin/python mock_api/seed_noise_impact_fixtures.py`) whenever `/home/shared` isn't
  present. That fixture data is **not real acoustic model output** — fine for UI development,
  not for anything resembling a real assessment. The UI shows an amber "synthetic placeholder
  data" note whenever fixture data is in use (`using_fixture_data` in the API responses), so
  it's never mistaken for the real thing.

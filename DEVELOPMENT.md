# Development

Architecture, conventions, and maintenance notes for whoever's working on
this next — human or AI. For setup/run instructions, see [README.md](README.md).

## Architecture

- **`frontend/`** — React + TypeScript + Vite, Tailwind CSS v3, OpenLayers
  for the map. `Map.tsx` is the main stateful component; most of
  `components/*.tsx` are controlled children that receive state/handlers as
  props rather than managing their own (see "Frontend conventions" below).
- **`main.py`** — FastAPI backend. Talks to Postgres/TimescaleDB via
  `psycopg2`. Requires `DATABASE_URL` (no default).
- **`mock_api/`** — a second FastAPI app serving the same endpoint shapes
  from a local SQLite snapshot, so frontend work doesn't need the real DB.
  **Must be kept in sync with `main.py`'s endpoints** — when you add/change
  a route in `main.py`, mirror it here too. See `mock_api/README.md`.
- **`analysis/`** — shared logic (`noise.py`, `plots.py`) imported by both
  `main.py` and `mock_api/main.py`, so noise rendering and region-stats
  plotting behave identically regardless of which backend is running.
- **`pipeline/`** — standalone ingestion/conversion scripts, run manually or
  via cron, not part of the request/response path. See `pipeline/README.md`.
- **`docker-compose.yml`** — orchestrates `db` (TimescaleDB), `backend`
  (`main.py`), `frontend` as separate services.

## Known gotchas

- **This machine has two Docker installs** — a snap-installed one
  (`/snap/bin/docker`) and whatever plain `docker` resolves to in `PATH`.
  If `docker ps` shows nothing despite a container clearly running, you're
  probably talking to the wrong one — try `/snap/bin/docker` directly.
- **Don't edit a script/server while it's already running.** Bash reads a
  `for` loop's body into memory once, so editing a running loop's script
  file has no effect on that invocation. Similarly, `uvicorn` without
  `--reload` won't pick up code changes — restart it.
- **`venv`'s console scripts have a stale shebang** from before this repo
  was renamed. Invoke `uvicorn` as `python -m uvicorn`, not the bare
  `uvicorn` command, or it can fail or pick up the wrong interpreter.
- **Noise GeoTIFFs in `pipeline/noise_data/` are deliberately git-tracked**,
  despite being generated output — see git history around "chore: update
  .gitignore to commit the converted monthly geotiff files."
- **The `ais` database is canonical.** `ais_v2` was a temporary database
  created for a one-time vessel static-info backfill (June 2026); its data
  has since been merged into `ais`. Don't point anything at `ais_v2`.

## Frontend conventions

- **Dark mode**: Tailwind `darkMode: "class"`. Theme state lives in the
  `useTheme()` hook (`frontend/src/useTheme.ts`) — respects OS preference
  by default, a manual toggle overrides and persists to `localStorage`.
  New UI should follow the same pairing convention already used throughout
  (`text-slate-600 dark:text-slate-300`, `bg-white dark:bg-slate-900`, etc.)
  rather than introducing new color choices.
- **State ownership**: `Map.tsx` owns most app state; child components
  (`IconBar.tsx`, `SidePanel.tsx`, etc.) receive it as props rather than
  reading global state themselves — keeps state changes traceable from one
  place instead of scattered across components.
- Native form controls (`<input type="date">`, etc.) need explicit text
  color and `[color-scheme:light] dark:[color-scheme:dark]` — Tailwind's
  `dark:bg-*` alone doesn't fix browser-rendered chrome like the calendar
  icon or default text color.

## Pipeline conventions

- Every script's module docstring follows the same shape: **Input: /
  Output: / Commands to run:** (see `ingest_csv.py` as the reference).
  Keep new scripts consistent with this instead of inventing new section
  names.
- Scripts are resumable by design — either via the `ingestion_log` table
  (DB ingestion scripts) or skip-if-output-exists (file conversion
  scripts) — so they're safe to interrupt and rerun.
- One-time/completed scripts (migrations, one-off fixes) get removed from
  the working tree once their job is done — they stay recoverable via git
  history, no need to keep them around as dead code.

## Maintenance

- Personal dev notes/journal live in a **separate private repo**
  (`dfo-notes` on GitHub), not in this repo — keep it that way, don't let
  dated journal-style notes accumulate back into `markdown/`.
- When `main.py` gains/changes an endpoint, update `mock_api/main.py` to
  match (see "Architecture" above).

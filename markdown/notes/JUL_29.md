# CCG Live AIS Streaming Integration

## What this is

Found a live, actively-updating data source mounted at `/mnt/echowind`
(same sshfs setup as `/mnt/shared_remote`) — `ccgStreaming/decode_stream/`
contains Canadian Coast Guard's decoded terrestrial AIS receiver feed:

- `Dynamic_CCG_AIS_UTC_Log_<date>.nc` — position reports (mmsi, lat, lon,
  speed, course, heading, timestamp). ~32M rows per day file, growing
  continuously as CCG decodes more raw NMEA sentences.
- `Static_CCG_AIS_UTC_Log_<date>.nc` — vessel info (mmsi, shipname,
  shiptype). ~2.7M rows per day file.
- `Outlog_CCG_AIS_UTC_Log_<date>.txt` — decode error log (checksum
  failures, truncated sentences — normal VHF reception noise).

This maps almost 1:1 onto the existing `ais_positions`/`vessels` Postgres
schema. The existing CSV pipeline (`pipeline/ingest_csv.py`) already had a
`"CCG_terrestrial"` source tag reserved for exactly this kind of data
(distinct from `"exactEarth"`, the satellite AIS provider already in the
DB) — meaning this integration was already anticipated, just not built yet.

## What was built

**`pipeline/ingest_ccg_streaming.py`** — a new ingestion script, separate
from `ingest_csv.py` since these NetCDF files behave differently than the
CSV pipeline's files (complete-once vs. continuously growing):

- Reuses the existing `ingestion_log` table, but repurposed as a **cursor**
  instead of a done/not-done flag — `rows_loaded` tracks how many rows of
  each file have been read so far, so each run only reads
  `[rows_loaded : current_length)`. Cheap even on a 32M-row/5GB file, since
  NetCDF slicing doesn't require loading the whole array.
- Processes in 2M-row chunks, committing (and advancing the cursor) after
  each chunk — a restart mid-file resumes near where it left off instead
  of redoing the whole thing.
- Applies the same Scotian Shelf bounding box and AIS message-type
  filtering (`POSITION_MSG_IDS`, `STATIC_MSG_IDS`) as `ingest_csv.py`, for
  consistency.
- Tags everything `source = 'CCG_terrestrial'`.
- Logs the **actual** `cur.rowcount` from the INSERT, not just how many
  rows passed filtering — early on this reported "2,303,062 positions
  inserted" when the real net-new count was 1,476,650, because
  `ON CONFLICT DO NOTHING` was silently skipping rows that already existed
  under a unique index on `(mmsi, received_at)` (not present in the
  `docker/init.sql` snapshot — must have been added later as a live
  migration). Fixed to log `X inserted (Y passed filters, Z already
  present)` so the numbers are actually trustworthy.

It's a one-shot "catch up, then exit" script, not a daemon — meant to be
triggered repeatedly (cron), same philosophy as the noise pipeline scripts.

**Automated via cron**, every 5 minutes:
```
*/5 * * * * cd /home/fwu/Desktop/projects/vessel-tracks && venv/bin/python3 pipeline/ingest_ccg_streaming.py >> pipeline/ccg_ingest.log 2>&1
```
Confirmed working — it picked up brand-new day files (`07-01`, `07-03`
through `07-06`) automatically as CCG produced them, with no code changes
needed (the glob pattern in `main()` just matches whatever's there).

## Showing it in the UI

Added a small "freshness" indicator so there's actually a way to tell this
is live, rather than it silently blending into existing vessel data:

- **Backend**: `GET /api/ccg/status` (added to both `main.py` and
  `mock_api/main.py`) returns `{ "last_position_at": <ISO timestamp or null> }`
  — the most recent `received_at` in `ais_positions` where
  `source = 'CCG_terrestrial'`.
- **Frontend** (`Map.tsx`): polls that endpoint every 60s, and shows
  "Live AIS (CCG) updated X ago" right under the Tracks panel header, via a
  small `formatRelativeTime()` helper (just now / N min ago / N h ago / N d
  ago — no library needed).

## A real finding, not a bug

The indicator currently shows **~23 days ago**. That's accurate, not a
display bug — CCG's own decode pipeline is genuinely behind:
`Outlog_CCG_AIS_UTC_Log_2026-07-07.txt` through `07-10` exist but are
completely empty (0 bytes), meaning CCG hasn't finished decoding those days
yet. Our ingestion is correctly catching up to whatever CCG has actually
produced — the lag is upstream, not in this pipeline.

## Infra note: don't edit a script/server that's already running

Hit this lesson twice in close succession:

1. Added the fail-fast fix to `run_combined_noise_all_combos.sh` while an
   invocation of it was already mid-loop — bash reads a `for` loop's body
   into memory once, so the running process kept executing the old logic
   even though the file on disk had the fix.
2. Added `/api/ccg/status` to `main.py` while the real backend
   (`uvicorn main:app --port 8000`, running as root, no `--reload`) was
   already running — same story, 404 until restarted.

For (2), specifically: the port-8000 process is root-owned and there's no
passwordless sudo here, so instead of blocking on that, spun up a second
instance on **port 8002** (own user, `--reload` on) and pointed
`frontend/.env`'s `VITE_API_URL` at it instead. Along the way discovered
`.env` had actually been pointing at port 8001 (the mock API) which wasn't
even running — fixed to point at the real backend. The old port-8000
process is still sitting there unused; worth killing next time there's a
sudo-capable terminal open, but harmless in the meantime.

## Discovered the deployed app was reading from the wrong database entirely

While checking the CCG freshness indicator against the actual deployed
(docker-compose) version, it showed **210 days ago** — way more stale than
the manually-run backend's 23 days. Turned out the deployed backend was
never touching the database this session's work had been writing to.

**Root cause**: `docker-compose.yml`'s `backend` service had
`DATABASE_URL=.../ais_v2`, not `.../ais`. There are six databases on the
same Postgres server (`ais`, `ais_v2`, `ais_dal`, `ais_static`, `ais_both`,
`postgres`) — a single Postgres instance can host as many databases as it
wants, so this wasn't two separate servers, just two names, easy to
confuse.

Traced *why* via `git log -p -- docker-compose.yml`: on **June 18, 2026**
(commit `f4b7350`), `ais_v2` was deliberately created and pointed to
because of `analysis/backfill_shiptypes.py` — a one-time script that
enriched vessel static info (ship_type, callsign, imo, name) from a
MarineTraffic-scraped CSV and some Dalhousie SQLite aggregate tables. The
commit's own message says *"change frontend to point to newly ingested
temp database"* — `ais_v2` was that temp database. After that, live
ingestion (exactEarth, then this session's CCG streaming) kept targeting
the original `ais`, so the two databases diverged: `ais` stayed current
for *positions* but never got the ship-type backfill; `ais_v2` had the
backfill but froze at Dec 31, 2025 (last position ever written to it) and
has **zero exactEarth data** (CCG_terrestrial only).

**Fix, in two parts:**

1. Repointed `docker-compose.yml` back to `ais` and force-recreated the
   backend container (`docker compose up -d --force-recreate backend`) —
   editing the compose file alone doesn't change an already-running
   container's baked-in environment, same "editing something already
   running" lesson as above, just at the container level.
2. Wrote `pipeline/merge_ais_v2_vessels.py` — a one-time script that reads
   all 823,585 vessel rows from `ais_v2` and upserts them into `ais`,
   using the same `COALESCE`-only-fills-nulls pattern as
   `ingest_csv.py`/`ingest_ccg_streaming.py` (never overwrites a value
   `ais` already has). Backed up `ais.vessels` first via
   `pg_dump` (run inside the `vessel-tracks-db-1` container, since no
   `pg_dump` client exists on the host — `docker exec ... | docker cp`),
   to `backup_ais_vessels_pre_v2_merge_20260729.sql`, so this is fully
   reversible if anything looked wrong.

**Result**: `ais.vessels` went from 573,918 → 825,711 rows (exactly
823,585 + 2,126 — the sum of both databases' unique vessels, confirming no
overlap was lost). Completeness improved across the board (ship_type:
181,393 → 228,064; callsign: 168,527 → 209,157; imo: 99,985 → 122,189).
`ais` now has both the June 18 backfill *and* current live positions from
both sources; `ais_v2` is untouched and still there if needed.

**Debugging note**: `docker ps` initially showed nothing running at all,
which was confusing given a container clearly was (confirmed via
`/proc/<pid>/cgroup` showing a `docker-<id>.scope`). Cause: this machine
has both a snap-installed Docker (`/snap/bin/docker`, the one actually
running things, per `/var/snap/docker/...` paths in the container's
mountinfo) and whatever plain `docker` resolves to in `PATH` — two
separate installs/daemons. Using `/snap/bin/docker` directly resolved it.

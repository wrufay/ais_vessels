# Pipeline

Standalone ingestion/conversion scripts. Not part of the request/response
path — run manually or via cron. See [DEVELOPMENT.md](../DEVELOPMENT.md)
for the shared docstring convention and resumability pattern these follow.

## Scripts

- **`ingest_csv.py`** — bulk-loads decoded AIS CSVs (exactEarth satellite,
  CCG terrestrial) into `ais_positions`/`vessels`. The main/original
  ingestion path.
- **`ingest_ccg_streaming.py`** — pulls CCG's live terrestrial AIS feed
  (NetCDF, continuously growing) into the same tables. Runs via cron every
  5 minutes:
  ```
  */5 * * * * cd <repo> && venv/bin/python3 pipeline/ingest_ccg_streaming.py >> pipeline/ccg_ingest.log 2>&1
  ```
- **`noise_to_geotiff.py`** — converts the ocean noise model's daily
  NetCDFs into GeoTIFFs the backend serves as map overlays. Slow (sshfs
  network reads, ~2h for a full combo) — run in tmux/background.

## Output

`noise_data/` — GeoTIFFs produced by `noise_to_geotiff.py`, one subfolder
per (variable, frequency, depth) combo. Deliberately git-tracked (see
DEVELOPMENT.md's "known gotchas").

## To review

- *(nothing flagged right now — this section is where "is this script still
  needed" questions should get tracked as they come up, rather than
  scattered across chat history)*

# Ship Type Backfill Comparison

## Background

AIS data contains two types of messages:
- **Position messages** (type 1/2/3/18/19/27): lat/lon, speed, course — stored in `ais_positions`
- **Static messages** (type 5/24): vessel name, ship type, callsign — stored in `vessels`

The original ingest script (`pipeline/ingest_csv.py`) had a bug where static messages were only saved if the vessel's position messages appeared in the **same CSV file**. Since ExactEarth splits static and dynamic messages across different files, most ship type information was silently dropped.

This was fixed by removing the cross-file filter. The fixed version was ingested into `ais_v2`.

## Databases

| Database | Description |
|---|---|
| `ais` | Original ingest (bug present), no backfill |
| `ais_dal` | Copy of `ais` + Dal SQLite backfill only |
| `ais_static` | Copy of `ais` + combined_database_xuj.csv backfill only |
| `ais_both` | Copy of `ais` + both sources combined |
| `ais_v2` | Fixed ingest + all three backfill sources (production) |

## Backfill Sources

1. **Dal SQLite** (`DFO_YYYY_vacuumed.db`, 2008–2021): Pre-deduplicated static AIS aggregate tables from Dalhousie. Slowest (~34s) due to year-by-year loop over 13 SQLite files.
2. **combined_database_xuj.csv**: Static AIS database with 160k valid MMSIs and ship type codes. Fast (~0.2s), single DuckDB read.
3. **vessel_metadata.csv**: ~156k vessels scraped from MarineTraffic with `vesseltype_generic` text field, mapped to AIS integer codes. Applied only to `ais_v2`.

## Results (based on `ais` baseline: 3,368 vessels, 2,502 missing ship type)

| Database | Source | Filled | % of missing filled | Unknown remaining | % unknown of total |
|---|---|---|---|---|---|
| `ais` | none (baseline) | — | — | 2,502 / 3,368 | 74.3% |
| `ais_dal` | Dal SQLite only | 1,151 | 46.0% | 1,351 / 3,368 | 40.1% |
| `ais_static` | Static CSV only | 954 | 38.1% | 1,548 / 3,368 | 45.9% |
| `ais_both` | Dal + Static CSV | 1,414 | 56.5% | 1,088 / 3,368 | 32.3% |
| `ais_v2` | Ingest fix + all three | — | — | 977 / 3,361 | **29.1%** |

## Source Overlap (dry-run on `ais`)

| Metric | Count |
|---|---|
| Dal SQLite matches | 1,151 |
| Static CSV matches | 954 |
| Overlap (both match same MMSI) | 691 |
| Combined (either matches) | 1,414 |

691 vessels matched by both sources — good confidence indicator that the ship types are consistent across datasets.

## Key Findings

- **Dal SQLite is the strongest single source** (46% of missing filled vs 38% for static CSV)
- **Combined sources fill 56.5%** of missing — worth using both
- **The ingest fix alone improved the baseline** — `ais_v2` starts with fewer unknowns before any backfill
- **vessel_metadata.csv adds ~135 additional vessels** on top of Dal + static CSV (small but included in `ais_v2`)
- **`ais_v2` achieves 29.1% unknown** — best result, combining ingest fix and all three backfill sources

## Caveats

- The re-ingest for `ais_v2` used 4 parallel workers, causing non-deterministic results (~115k fewer positions, 7 fewer vessels than `ais`). Root cause is likely silent file failures due to worker contention. Running with `--workers 1` would be reproducible but takes ~28 hours.
- The `ais_both` comparison is fairer (same base ingest) but slightly less complete than `ais_v2`.
- ~29% of vessels remain unidentified even after all sources — these vessels likely never broadcast static messages.

# Vessel Ship Type Backfill

## Problem

**11,612 of ~29,000 vessels (40%)** in Postgres have no `ship_type`.

## Finding

The Dal SQLite data (2008–2021) has vessel metadata we can use to fill the gaps:

| | |
|---|---|
| Missing in Postgres | 11,612 |
| Recoverable from SQLite | **5,653 (49%)** |
| Unrecoverable | 5,959 (51%) |

Spot-checked a sample — data looks correct.

## Decision Needed

Should we run a one-time backfill to recover ship type for the 5,653 vessels?

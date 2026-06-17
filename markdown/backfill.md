# Vessel Ship Type Backfill

## Problem

Of the **3,368 vessels displayed in the UI** (valid MMSI range 200M–799M, with position data), **636 are missing `ship_type`**.

```sql
-- 3,368 vessels with positions and valid MMSI
SELECT COUNT(DISTINCT mmsi) FROM ais_positions
WHERE mmsi BETWEEN 200000000 AND 799999999;

-- 636 of those missing ship_type
SELECT COUNT(DISTINCT v.mmsi) FROM vessels v
JOIN ais_positions p ON v.mmsi = p.mmsi
WHERE v.ship_type IS NULL AND v.mmsi BETWEEN 200000000 AND 799999999;
```

## Finding

The Dal SQLite data (2008–2021) has vessel metadata we can use to fill the gaps:

| | |
|---|---|
Two sources were checked: the Dal SQLite `static_YYYYMM_aggregate` tables (2008–2021) and a `vessel_metadata.csv` file from the same directory.

| | |
|---|---|
| Missing ship_type (displayed vessels) | 636 |
| In metadata CSV only | 30 |
| In aggregate tables only | 19 |
| In both | 328 |
| **Total recoverable (either source)** | **377 (59.3%)** |
| Unrecoverable | 259 (40.7%) |

Note: the metadata CSV has text vessel types (`vesseltype_generic`, `vesseltype_detailed`) rather than numeric AIS ship type codes — these would need to be mapped before backfilling.

Spot-checked a sample — data looks correct.

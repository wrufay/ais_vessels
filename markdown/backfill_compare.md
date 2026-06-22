# Backfill comparison findings

**Monday, June 22**

## Last week:

The original ingestion script dropped ship type data due to the split between static and dynamic AIS messages across different files.

_The fix:_ Remove lines filtering static records to those whose MMSI appeared in the position data from the same CSV file.

```python
loaded_mmsis = {row[0] for row in pos_rows}
ves_rows = [r for r in ves_rows if r[0] in loaded_mmsis]
```

After this change, I re-ran the ingestion script on a copy of the current `ais` database (`ais_v2`).

_Write how many vessels were recovered with the reingest alone._

However, 7 vessels displayed in the UI were lost in `ais_v2`. The likely cause for this is silent file failures by the parallel workers when running the ingestion script.

## Data sources (3)

**Dal SQLite** (`DFO_YYYY_vacuumed.db`, 2008–2021): Static AIS records from Dalhousie.

**combined_database_xuj.csv**: Static AIS database with ~160k MMSIs and ship type codes.

**vessel_metadata.csv**: ~156k vessels from MarineTraffic, mapped to AIS codes. Applied only to `ais_v2`. Found in the same directory as the Dal SQLite data.

## Databases

| Database     | Description                                             |
| ------------ | ------------------------------------------------------- |
| `ais`        | Initial ingest (bug present), no backfill               |
| `ais_dal`    | Copy of `ais` + Dal SQLite backfill only                |
| `ais_static` | Copy of `ais` + combined_database_xuj.csv backfill only |
| `ais_both`   | Copy of `ais` + both sources combined                   |
| `ais_v2`     | Fixed ingest + all three backfill sources (production)  |

## Results

The first four databases listed were used to strictly compare the ship type recovery of Dalhousie's SQLite data and the combined CSV file.

| Database     | Filled | % filled | Unknown remaining | Time taken |
| ------------ | ------ | -------- | ----------------- | ---------- |
| `ais_dal`    | 1,151  | 46.0%    | 1,351 / 3,368     | 33.8s      |
| `ais_static` | 954    | 38.1%    | 1,548 / 3,368     | 0.2s       |

**_197 more missing vessels_** from August 2025 were recovered from the **Dal SQLite data** than the CSV.

To add, the backfill using the Dal data took notably longer. This is because 13 years of SQLite tables are read one by one, whereas the CSV can be read in one call.

When used together (`analysis/backfill_both.py`, accounting for overlap), **56.5%** of the missing vessels were filled, leaving 43.5% still unknown.

| Database   | Filled | % filled | Unknown remaining | Time taken |
| ---------- | ------ | -------- | ----------------- | ---------- |
| `ais_both` | 1,414  | 56.5%    | 1,088 / 3,368     | 40.0s      |

## Conclusion

Of all the combinations tested this week, `ais_v2` (three backfill sources + new ingestion fix; missing 7 vessels) achieved the lowest unknown rate at 29.1%. This is the best result found so far, and the full breakdown table is also available to discuss. 

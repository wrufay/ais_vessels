# June 17, 2026

### Meeting notes
- Heatmap code is in MATLAB at `/home/shared/vesselDensityEstimation`
  - Input: decoded NetCDF files (dynamic AIS)
  - Sample output PNG is in the folder
  - Written for the existing decoded NC format — would need changes if switching to new data source
- Continue backfilling ship types from Dalhousie SQLite data, can compare against SeaWeb
- Took notes and sent meeting minutes

### Ingest fix
Removed bbox filter on vessel static metadata in `pipeline/ingest_csv.py`.

Before, vessel name/ship_type was only saved if the vessel had positions in the Scotian Shelf bbox **in the same CSV file**. This caused missing ship_types when static messages and positions were in different files.

Removed these lines:
```python
# Only keep vessels that have positions in the bbox
loaded_mmsis = {row[0] for row in pos_rows}
ves_rows = [r for r in ves_rows if r[0] in loaded_mmsis]
```

Next step: create `ais_v2` database, re-ingest exactEarth data, compare unknown vessel % vs original `ais` database.

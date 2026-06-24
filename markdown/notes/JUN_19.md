## TODOs

- [ ] Test `parse_timestamp` with CCG terrestrial data to verify timestamps are already ISO format
- [ ] When adding new data sources, check column name variants in `find_col` (pipeline/ingest_csv.py:101-114) and add any new aliases
- [ ] Verify that `SOG` column is truly unique to exactEarth and not present in CCG terrestrial data (pipeline/ingest_csv.py:122) — source detection depends on this
- [ ] Move hardcoded CHA/WEA region polygons and AMAR mooring locations out of `frontend/src/Map.tsx` and into backend API endpoints — frontend should fetch them instead of having them baked in
- [ ] Improve region analysis UX — loading state feels generic/AI-generated; rethink the results modal overall (layout, typography, how plots are presented, loading feedback)
- [x] Add bathymetry as a map layer — using NRCan WMS (maps-cartes.services.geo.ca), layer "Relief blend" (layer 1), already working in UI
- [ ] Convert bathymetry data to NetCDF for supervisor's modelling — two local files in Downloads: `NL_Bioregion_Compilation_Final_no_Olex_no_Flemish_Feb24_2023_100m.tif` (easier, direct GeoTIFF → NetCDF via rioxarray) and `GSC_Atlantic_bathymetric_compilation.gdb` (needs GDAL to extract raster first). GDAL not currently installed.

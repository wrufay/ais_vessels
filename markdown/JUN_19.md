## TODOs

- [ ] Test `parse_timestamp` with CCG terrestrial data to verify timestamps are already ISO format
- [ ] When adding new data sources, check column name variants in `find_col` (pipeline/ingest_csv.py:101-114) and add any new aliases
- [ ] Verify that `SOG` column is truly unique to exactEarth and not present in CCG terrestrial data (pipeline/ingest_csv.py:122) — source detection depends on this

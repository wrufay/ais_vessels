# June 15, 2026

### To-do:
- Look into the data from Dal, compare with the existing data inside Postgres to see if it's more complete and could solve our unknown vessel issue


### Notes and findings
- Each of the .db files are SQLite. We can query them in the same way we query from the CSV*
- Years 2022-2024 are not there in the directory (still uploading or just not there?)
- Potential solution:  Get all MMSIs from Postgres with null ship_type; look them up in the SQLite static tables (or the vessel metadata csv)



Results from running analysis/backfill_check.py

2008: no aggregate tables, skipping

2010: no aggregate tables, skipping

2011: no aggregate tables, skipping

2012: total 250

2013: total 480

2014: total 645

2015: total 848

2016: total 1457

2017: total 2909

2018: total 3721

2019: total 4753

2020: total 5365

2021: total 5653

final: 5,653 / 11,612 (48.7%)


### Backfill missing ship types with Dalhousie data

UPDATE vessels SET ship_type = <value> WHERE mmsi = <mmsi>

For each MMSI where ship_type is null, you look it up in the source and write the value in.


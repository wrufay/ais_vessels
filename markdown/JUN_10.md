# June 10, 2026

Notes from today's meeting.

## Presented

- August 2025 AIS ingestion results + Sydney Bight analysis

## Feedback / Ideas

- Current vessel tracking tool = useful for diagnosis
- Look into technicalities of generating the Sydney Bight analysis with shapefiles
- Can we allow users to generate these types of statistics and plots on the spot? (Currently fast due to data being in Postgres)
- Why Postgres? Look further into TimescaleDB as well
- Look into vessel traffic density
- Put start and finish markers on vessel tracks to show direction
- Revisit what we are doing with the connecting lines
- Consider port access
- Make sure the architecture is solid

## Follow Up

- Jinshan will send more information


---


Looking into allowing users to select a region and view vessel traffic + see statistics.

- Consider using PostGIS for faster spatial filtering — instead of pulling positions into Python and checking with Shapely, PostGIS does the polygon containment check inside Postgres directly, returning only matching rows 

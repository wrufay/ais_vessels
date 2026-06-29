# June 25, 2026

- Reading through the papers, taking notes and annotations (got distratced by side project ML but also made progress on the ideation of that too)

- Updated the convert to nc script - should understand code and rewrite/fix documentation (it's very comprehensive)

- Also put the new file at /home/shared/bathymetry/nl_bioregion_compilation_2023_v2.md
    - See if it's right etc.

- Prepare questions for tomorrow meeting and actually book the meeting too. Write meeting notes from Wednesday, prepare to update it for Friday



### actually did
- read stuff
- ok also added this error handling thing where if the backend is down for some reason and you can still run the frontend, there will be an error telling you the error message

### vessel-tracks dev updates

**error handling**
- frontend now shows a red banner with the actual status code (500, 502 etc.) when the backend is unreachable
- dismissable, clears automatically when backend recovers

**geotiff → netcdf conversion** (`pipeline/geotiff_to_netcdf.py`)
- converts Lambert Conformal Conic projected GeoTIFF to NetCDF
- adds 2D lon/lat arrays (WGS-84) derived from the projected x/y grid using pyproj
- processes in 500-row chunks to avoid OOM on large files (~376M cell grid)
- output at `pipeline/bathymetry.nc`
- verified: spot-checked all 4 corners, delta < 0.000002° vs independent pyproj computation

**region vessel viewing (in progress — not built yet)**

core idea: "analyse" and "view vessels" are two distinct features on a region:
- `Analyse` — existing stats/charts modal
- `View vessels` — new mode, no modal, map IS the output

what "view vessels" does:
- vessel panel opens automatically, header shows "Vessels in region" with ✕ to exit
- display mode toolbar in vessel panel (3 toggles): color by type | color by speed | uniform grey
- all positions inside the region render on the map with chosen coloring
- hover a dot on the map → highlights that vessel in the sidebar + shows full track
- hover a vessel in sidebar → highlights its full track on the map
- click a vessel in sidebar → loads full route (existing behavior)
- sidebar only shows vessels found in the region

ship type color scheme: needs to be defined and kept consistent between map dots and analysis plots (matplotlib) — separate task

current partial implementation:
- grey dots from region positions render correctly (positions come from analysis response, no extra API calls)
- sidebar filters to region vessels
- sidebar hover → full track highlight works
- route cache so re-hovering same vessel is instant
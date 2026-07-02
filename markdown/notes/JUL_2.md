# July 2, 2026

### vessel-tracks dev updates

**noise modelling layer (noise-layer branch)**

core idea: overlay daily modelled underwater noise (vessel noise, combined noise, wind noise) from `/mnt/shared_remote/{YYYYMM}/{YYYYMMDD}.nc` as a raster layer on the map.

**data format**
- source files: daily NetCDF4, 701×417 regular lon/lat grid (-69.5→-59.0°, 41.0→46.0°), 0.015° lon / ~0.012° lat spacing
- variables: `vessel_noise`, `combined_noise`, `wind_noise` (x, y, frequency, depth, time)
- 5 frequency bands (50, 100, 200, 500, 1000 Hz), 19 depth levels (10–500 m), 144 time steps/day (10 min intervals)
- cells at exactly 0 dB = outside model domain (land / no-data)

**conversion pipeline** (`pipeline/noise_to_geotiff.py`)
- reads remote NetCDF over sshfs, extracts one (variable, freq, depth) slice, averages over the day's 144 time steps
- writes a local single-band float32 GeoTIFF (EPSG:4326, deflate-compressed, NaN nodata for land cells)
- ~630 KB/file compressed; ~17s/file over sshfs network mount
- resumable: skips days that already exist unless `--overwrite` passed
- default: `vessel_noise`, freq=50Hz, depth=10m
- output: `pipeline/noise_data/vessel_noise_f50_d10/{date}.tif`
- `pipeline/noise_data/` is gitignored (generated files)

**backend** (`analysis/noise.py`, `main.py`)
- `GET /api/noise/overlay?date=YYYY-MM-DD` — reads local GeoTIFF via rasterio, Gaussian-smooths the grid (sigma=1.5, filling no-data with mean before smoothing to avoid edge bleed), applies `RdYlBu_r` colormap (red=loud, blue=quiet) normalized to 2nd–98th percentile of ocean cells, returns RGBA PNG with transparent no-data
- `GET /api/noise/extent` — returns static bbox
- added `libexpat1` apt dep to backend Dockerfile (rasterio wheel needs it, not present in python:3.12-slim)
- added `rasterio` to `requirements.txt`; `netCDF4` moved to `pipeline/requirements.txt`
- `pipeline/noise_data/` bind-mounted into docker backend container as read-only volume

**frontend** (`Map.tsx`)
- `ImageLayer` + `ImageStatic` source, extent `-69.5/41.0/-59.0/46.0` reprojected to EPSG:3857
- 50% opacity, hidden by default, toggle checkbox in Layers panel
- coastline-land bleed near edges is expected — model domain follows bathymetry contours, not the exact coastline

**known limitations / next steps**
- only 3 test days converted so far (2020-02-01 to 02-03); full backfill of ~450 days takes ~2h over sshfs
- date hardcoded to 2020-02-01 in frontend; needs a date picker to scrub through time
- only vessel_noise at 50Hz/10m converted; other variable/freq/depth combos need separate conversion runs

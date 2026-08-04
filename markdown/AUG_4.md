# Clipping noise GeoTIFFs to the iBoF boundary

## The ask

Supervisor asked whether `markdown/bounds.gdb` can be used to show noise
data only within that region — without touching the source NetCDFs.

## What's in bounds.gdb

An Esri File Geodatabase with one layer:

- **`iBoF_CriticalHabitat_BoundingBox`** — a single MultiPolygon Z feature,
  looks like the inner Bay of Fundy critical habitat boundary (right whale
  context, matches `Noise_Impact_Thresholds.xlsx` sitting in the home dir).
- CRS: Canada Albers Equal Area Conic (`ESRI:102001`), not lon/lat.
- Reprojected to EPSG:4326, its extent is roughly lon -68.2 to -63.4,
  lat 43.3 to 46.6 — sits well inside the noise grid's full extent
  (-69.5 to -59.0, 41.0 to 46.0), so there's real overlap to clip against.

Read it with `geopandas.read_file()` — needs the `pyogrio` engine since
`fiona` isn't installed in `venv`; pyogrio handles `.gdb` fine on its own.

## Why the NetCDF doesn't need to be touched

Clipping to a boundary is a **raster masking** operation — "set every
pixel outside this polygon to NaN." That only needs the already-produced
GeoTIFFs in `pipeline/noise_data/`, not the raw model output. The NetCDFs
feed `noise_to_geotiff.py`, which is a separate, slow (sshfs-bound) step;
none of that is involved here.

## The process

1. Load the polygon, reproject from Albers to EPSG:4326 to match the
   GeoTIFFs' CRS.
2. For each GeoTIFF, use `rasterio.mask.mask()` with that polygon —
   pixels outside get set to nodata (NaN), pixels inside keep their value.
3. Write out the masked result.

Rough shape:
```python
import geopandas as gpd
import rasterio
from rasterio.mask import mask

gdf = gpd.read_file("markdown/bounds.gdb", layer="iBoF_CriticalHabitat_BoundingBox")
gdf = gdf.to_crs("EPSG:4326")

with rasterio.open("pipeline/noise_data/combined_noise_f1000_d10/2020-02.tif") as src:
    clipped, transform = mask(src, gdf.geometry, crop=True, nodata=float("nan"))
    # write clipped + transform to a new .tif, same profile as src otherwise
```

## Two ways to actually apply it

- **Pre-generate clipped copies** — a masked `.tif` per combo/month, saved
  alongside the originals. Simple, no runtime cost, but doubles storage
  for whichever combos get clipped.
- **Clip on-the-fly in the backend** — if the UI gets a "show only iBoF
  region" toggle, clip at request time instead of pre-generating. No
  extra storage, small per-request compute cost.

Haven't picked between these yet — depends on whether this is meant to be
a permanent UI toggle or a one-off figure for the supervisor.

## Time cost

Not a re-run of the noise pipeline. Clipping is fast — reading a tif,
masking, writing it back is a couple seconds per file, nothing like the
~8 min/combo NetCDF conversion. Clipping all 97 combos x however many
months would be minutes total, not hours.

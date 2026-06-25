"""
geotiff_to_netcdf.py
====================
Converts a projected GeoTIFF (Lambert Conformal Conic, metres) to a NetCDF
file whose bathymetry variable carries both the original projected x/y
coordinates AND 2-D longitude/latitude arrays in WGS-84 degrees.

Why two coordinate systems?
  - x/y (metres) are kept because they are the native grid axes — every cell
    is exactly 100 m × 100 m, so spatial arithmetic (distances, areas) is
    simple and lossless in that space.
  - lon/lat are added so the data can be overlaid on a web map or matched
    against vessel positions, which are always in WGS-84 degrees.

Input projection (read automatically from the GeoTIFF but documented here
for reference and debugging):
  Projection  : Lambert Conformal Conic, 2 standard parallels
  Datum       : WGS 84  (EPSG:6326)
  Origin lat  : 46 °N
  Central lon : 60 °W
  Std parallel 1 : 48 °N
  Std parallel 2 : 52 °N
  False easting  : 0 m
  False northing : 0 m
  Units       : metres

Output NetCDF variables:
  bathymetry(band, y, x)  – depth values [metres, negative = below sea level]
  lon(y, x)               – WGS-84 longitude of every grid cell centre
  lat(y, x)               – WGS-84 latitude  of every grid cell centre
  x(x)                    – easting  in projected metres (1-D axis)
  y(y)                    – northing in projected metres (1-D axis)

Usage:
  python geotiff_to_netcdf.py <input.tif> <output.nc>

Dependencies:
  pip install rioxarray pyproj netCDF4
"""

import sys
import numpy as np
import rioxarray
from pyproj import Transformer
from xarray import DataArray


def convert(input_path: str, output_path: str) -> None:
    """Convert a Lambert-projected GeoTIFF to a lon/lat-aware NetCDF.

    Steps
    -----
    1. Open the GeoTIFF with rioxarray (masked=True turns nodata → NaN).
    2. Read the CRS embedded in the file — this is the authoritative source
       of projection parameters; we never hard-code them.
    3. Build a pyproj Transformer from that CRS to WGS-84 (EPSG:4326).
       always_xy=True means the transformer always expects (x, y) = (easting,
       northing) as input and returns (longitude, latitude) as output,
       regardless of the axis-order convention stored in the CRS definition.
    4. Create a 2-D meshgrid of every (x, y) cell-centre coordinate.
    5. Transform the whole grid to (lon, lat) in one vectorised call.
    6. Attach lon/lat as non-dimension coordinates on the DataArray so they
       travel with it into the NetCDF file.
    7. Write to NetCDF.
    """

    # ------------------------------------------------------------------
    # 1. Open the GeoTIFF
    # ------------------------------------------------------------------
    # masked=True: the GeoTIFF's nodata value (typically −9999 or similar)
    # is replaced by NaN so it does not pollute statistics or plots.
    da = rioxarray.open_rasterio(input_path, masked=True)
    # open_rasterio returns a DataArray for a normal GeoTIFF; a list of
    # Datasets is only returned for multi-group files (e.g. some HDF5/GRIB).
    if not isinstance(da, DataArray):
        raise TypeError(
            f"{input_path} opened as a multi-group file, not a single DataArray. "
            "Pass a standard single-band or multi-band GeoTIFF."
        )
    da.name = "bathymetry"

    # ------------------------------------------------------------------
    # 2. Read the CRS from the file
    # ------------------------------------------------------------------
    crs = da.rio.crs
    if crs is None:
        raise ValueError(
            f"No CRS found in {input_path}. "
            "The GeoTIFF must embed projection information."
        )
    print(f"Source CRS : {crs.to_string()}")

    # ------------------------------------------------------------------
    # 3. Build the coordinate transformer
    # ------------------------------------------------------------------
    # always_xy=True: guarantees (easting, northing) → (lon, lat) order,
    # which is what we want regardless of what the CRS spec says about axes.
    transformer = Transformer.from_crs(crs, "EPSG:4326", always_xy=True)

    # ------------------------------------------------------------------
    # 4. Build the 2-D coordinate grids in row chunks
    # ------------------------------------------------------------------
    # The full grid is ~376 million cells (23415 × 16055).  Allocating a
    # single meshgrid in float64 would require ~12 GB of RAM and kill the
    # process.  Instead we:
    #   • pre-allocate float32 output arrays (~3 GB total, 4× smaller)
    #   • iterate over CHUNK_ROWS rows at a time, building a small meshgrid
    #     per chunk, transforming it, and writing the result into the
    #     pre-allocated arrays before discarding the chunk.
    # Each chunk uses ≈ 4 arrays × CHUNK_ROWS × n_x × 4 bytes ≈ 250 MB.
    CHUNK_ROWS = 500

    nx = da.sizes["x"]
    ny = da.sizes["y"]
    x_vals = da.x.values          # 1-D, shape (nx,)
    y_vals = da.y.values          # 1-D, shape (ny,)

    print(
        f"Grid size  : {ny} rows × {nx} cols  ({ny * nx:,} cells)"
    )
    print(
        f"x range    : {x_vals.min():.0f} m  →  {x_vals.max():.0f} m"
    )
    print(
        f"y range    : {y_vals.min():.0f} m  →  {y_vals.max():.0f} m"
    )
    print(
        f"Processing in chunks of {CHUNK_ROWS} rows "
        f"({-(-ny // CHUNK_ROWS)} chunks) …"
    )

    lon2d = np.empty((ny, nx), dtype=np.float32)
    lat2d = np.empty((ny, nx), dtype=np.float32)

    # ------------------------------------------------------------------
    # 5. Project to WGS-84 chunk by chunk
    # ------------------------------------------------------------------
    for row_start in range(0, ny, CHUNK_ROWS):
        row_end = min(row_start + CHUNK_ROWS, ny)
        # meshgrid for this slice: shape (row_end-row_start, nx)
        xx_chunk, yy_chunk = np.meshgrid(x_vals, y_vals[row_start:row_end])
        lon_chunk, lat_chunk = transformer.transform(xx_chunk, yy_chunk)
        lon2d[row_start:row_end, :] = lon_chunk.astype(np.float32)
        lat2d[row_start:row_end, :] = lat_chunk.astype(np.float32)
        # explicitly free the chunk arrays before the next iteration
        del xx_chunk, yy_chunk, lon_chunk, lat_chunk
        if (row_start // CHUNK_ROWS) % 10 == 0:
            print(f"  row {row_end}/{ny}")

    print(
        f"lon range  : {lon2d.min():.4f} °  →  {lon2d.max():.4f} °"
    )
    print(
        f"lat range  : {lat2d.min():.4f} °  →  {lat2d.max():.4f} °"
    )

    # ------------------------------------------------------------------
    # 6. Attach lon/lat as non-dimension coordinates
    # ------------------------------------------------------------------
    # Non-dimension coordinates share the (y, x) dimensions but are not
    # the index axes themselves — they ride along as metadata.
    # xarray will write them as proper 2-D variables in the NetCDF file.
    da = da.assign_coords(
        lon=(["y", "x"], lon2d),
        lat=(["y", "x"], lat2d),
    )
    da["lon"].attrs = {
        "long_name": "longitude",
        "units": "degrees_east",
        "standard_name": "longitude",
    }
    da["lat"].attrs = {
        "long_name": "latitude",
        "units": "degrees_north",
        "standard_name": "latitude",
    }

    # ------------------------------------------------------------------
    # 7. Write to NetCDF
    # ------------------------------------------------------------------
    da.to_netcdf(output_path)
    print(f"Saved to   : {output_path}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python geotiff_to_netcdf.py <input.tif> <output.nc>")
        sys.exit(1)
    convert(sys.argv[1], sys.argv[2])

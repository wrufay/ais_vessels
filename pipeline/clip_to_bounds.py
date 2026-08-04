"""
clip_to_bounds.py
==================

Clips a noise GeoTIFF (produced by noise_to_geotiff.py) to the
iBoF_CriticalHabitat_BoundingBox polygon in markdown/bounds.gdb, setting
every pixel outside the polygon to NaN. Pure raster post-processing on an
already-generated .tif -- does not touch the source NetCDFs.

Usage
-----
  python clip_to_bounds.py --src pipeline/noise_data/combined_noise_f1000_d10/2020-02.tif \
                            --dst markdown/2020-02_clipped_iBoF.tif
"""

import argparse

import geopandas as gpd  # type: ignore
import numpy as np
import rasterio  # type: ignore
from rasterio.mask import mask  # type: ignore

BOUNDS_GDB = "markdown/bounds.gdb"
BOUNDS_LAYER = "iBoF_CriticalHabitat_BoundingBox"


def clip_one(src_path: str, dst_path: str) -> None:
    gdf = gpd.read_file(BOUNDS_GDB, layer=BOUNDS_LAYER)

    with rasterio.open(src_path) as src:
        gdf = gdf.to_crs(src.crs)
        clipped, transform = mask(src, gdf.geometry, crop=True, nodata=np.nan)
        profile = src.profile.copy()
        profile.update(
            height=clipped.shape[1],
            width=clipped.shape[2],
            transform=transform,
            nodata=np.nan,
        )

    with rasterio.open(dst_path, "w", **profile) as dst:
        dst.write(clipped)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--src", required=True, help="Input GeoTIFF path")
    parser.add_argument("--dst", required=True, help="Output (clipped) GeoTIFF path")
    args = parser.parse_args()

    clip_one(args.src, args.dst)

    with rasterio.open(args.dst) as check:
        arr = check.read(1)
        valid = int(np.sum(~np.isnan(arr)))
        print(f"Wrote {args.dst}")
        print(f"  shape: {arr.shape}")
        print(f"  valid pixels: {valid}/{arr.size}")
        if valid:
            print(f"  value range: {np.nanmin(arr):.1f} - {np.nanmax(arr):.1f} dB")
        print(f"  bounds: {check.bounds}")


if __name__ == "__main__":
    main()

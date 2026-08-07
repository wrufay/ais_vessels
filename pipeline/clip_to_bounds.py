"""
clip_to_bounds.py
==================

Clips noise GeoTIFFs (produced by noise_to_geotiff.py) to the
iBoF_CriticalHabitat_BoundingBox polygon in markdown/bounds.gdb, cropping
to the polygon's extent and setting every pixel outside it to NaN. Pure
raster post-processing on already-generated .tif files -- does not touch
the source NetCDFs.

Usage
-----
  # Single file
  python clip_to_bounds.py --src pipeline/noise_data/combined_noise_f1000_d10/2020-02.tif \
                            --dst noise-clipped-region/combined_noise_f1000_d10/2020-02.tif

  # Whole directory tree (mirrors src-dir's structure under dst-dir)
  python clip_to_bounds.py --src-dir pipeline/noise_data --dst-dir noise-clipped-region
"""

import argparse
import os

import geopandas as gpd  # type: ignore
import numpy as np
import rasterio  # type: ignore
from rasterio.mask import mask  # type: ignore

BOUNDS_GDB = "markdown/bounds.gdb"
BOUNDS_LAYER = "iBoF_CriticalHabitat_BoundingBox"


def load_bounds_geometries():
    """Load the clip polygon once; reproject per-file since source CRS could
    differ (in practice every GeoTIFF here is EPSG:4326)."""
    return gpd.read_file(BOUNDS_GDB, layer=BOUNDS_LAYER)


def clip_one(src_path: str, dst_path: str, gdf=None) -> tuple[int, int]:
    """Clip one GeoTIFF. Returns (valid_pixels, total_pixels)."""
    if gdf is None:
        gdf = load_bounds_geometries()

    with rasterio.open(src_path) as src:
        gdf_proj = gdf.to_crs(src.crs)
        clipped, transform = mask(src, gdf_proj.geometry, crop=True, nodata=np.nan)
        profile = src.profile.copy()
        profile.update(
            height=clipped.shape[1],
            width=clipped.shape[2],
            transform=transform,
            nodata=np.nan,
        )

    os.makedirs(os.path.dirname(dst_path), exist_ok=True)
    with rasterio.open(dst_path, "w", **profile) as dst:
        dst.write(clipped)

    return int(np.sum(~np.isnan(clipped))), int(clipped.size)


def clip_directory(src_dir: str, dst_dir: str) -> None:
    gdf = load_bounds_geometries()
    tif_paths = []
    for root, _dirs, files in os.walk(src_dir):
        for name in files:
            if name.endswith(".tif"):
                tif_paths.append(os.path.join(root, name))
    tif_paths.sort()

    print(f"Found {len(tif_paths)} GeoTIFFs under {src_dir}/")
    for i, src_path in enumerate(tif_paths, 1):
        rel = os.path.relpath(src_path, src_dir)
        dst_path = os.path.join(dst_dir, rel)
        valid, total = clip_one(src_path, dst_path, gdf=gdf)
        if i % 100 == 0 or i == len(tif_paths):
            print(f"  [{i}/{len(tif_paths)}] {rel} ({valid}/{total} valid pixels)")
    print(f"Done. {len(tif_paths)} files clipped into {dst_dir}/")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--src", help="Input GeoTIFF path (single-file mode)")
    parser.add_argument("--dst", help="Output GeoTIFF path (single-file mode)")
    parser.add_argument("--src-dir", help="Input directory to walk (batch mode)")
    parser.add_argument("--dst-dir", help="Output directory, mirrors --src-dir's structure (batch mode)")
    args = parser.parse_args()

    if args.src_dir or args.dst_dir:
        if not (args.src_dir and args.dst_dir):
            parser.error("--src-dir and --dst-dir must be given together")
        clip_directory(args.src_dir, args.dst_dir)
        return

    if not (args.src and args.dst):
        parser.error("either --src/--dst or --src-dir/--dst-dir is required")

    valid, total = clip_one(args.src, args.dst)
    with rasterio.open(args.dst) as check:
        print(f"Wrote {args.dst}")
        print(f"  shape: {check.shape}")
        print(f"  valid pixels: {valid}/{total}")
        print(f"  bounds: {check.bounds}")


if __name__ == "__main__":
    main()

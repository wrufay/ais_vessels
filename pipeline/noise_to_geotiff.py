"""
noise_to_geotiff.py
====================
Converts daily ocean noise modelling NetCDFs (mounted from a remote sshfs
share at /mnt/shared_remote) into local, single-band GeoTIFFs.

Why convert at all?
  The source files live on a network mount (sshfs) — slow, and not something
  a Docker container can rely on being present. Each file also carries a
  5-D variable (lon, lat, frequency, depth, time-of-day) when the map only
  ever needs one 2-D slice at a time. Converting once, locally, to a small
  georeferenced raster means the backend serves noise overlays from local
  disk instead of re-reading and re-slicing a remote NetCDF on every
  request.

What gets extracted:
  For each day, one (frequency, depth) slice of one variable is pulled out
  and averaged across the day's 144 time steps, producing a single 701x417
  grid. Cells at exactly 0 dB are outside the model's ocean domain (land /
  no-data) and are written as NaN (nodata) rather than a real value.

Output:
  <dst>/<variable>_f<freq>_d<depth>/<YYYY-MM-DD>.tif
  Single-band float32 GeoTIFF, EPSG:4326, deflate-compressed, NaN nodata.

Usage:
  python noise_to_geotiff.py
  python noise_to_geotiff.py --variable vessel_noise --freq 50 --depth 10
  python noise_to_geotiff.py --start 2020-02-01 --end 2020-02-29
  python noise_to_geotiff.py --overwrite

Dependencies:
  pip install netCDF4 rasterio numpy
"""

import argparse
import os
import re
import sys

import netCDF4 as nc  # type: ignore
import numpy as np
import rasterio  # type: ignore
from rasterio.transform import from_origin  # type: ignore

SRC_DIR = "/mnt/shared_remote"
DST_DIR = os.path.join(os.path.dirname(__file__), "noise_data")

DATE_RE = re.compile(r"^(\d{4})(\d{2})(\d{2})\.nc$")


def _nearest_index(values: np.ndarray, target: float) -> int:
    return int(np.argmin(np.abs(values - target)))


def find_daily_files(src_dir: str, start: str | None, end: str | None) -> list[tuple[str, str]]:
    """Return [(date, path), ...] sorted by date, filtered to [start, end]."""
    out = []
    for month_dir in sorted(os.listdir(src_dir)):
        month_path = os.path.join(src_dir, month_dir)
        if not re.fullmatch(r"\d{6}", month_dir) or not os.path.isdir(month_path):
            continue
        for fname in sorted(os.listdir(month_path)):
            m = DATE_RE.match(fname)
            if not m:
                continue
            date = f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
            if start and date < start:
                continue
            if end and date > end:
                continue
            out.append((date, os.path.join(month_path, fname)))
    return sorted(out)


def convert_one(src_path: str, dst_path: str, variable: str, freq: float, depth: float) -> None:
    """Read one day's NetCDF, slice + day-average, write a local GeoTIFF."""
    with nc.Dataset(src_path) as ds:
        lon = np.array(ds["longitude"][:])
        lat = np.array(ds["latitude"][:])
        fi = _nearest_index(np.array(ds["frequency"][:]), freq)
        di = _nearest_index(np.array(ds["depth"][:]), depth)
        arr = np.array(ds[variable][:, :, fi, di, :])  # (lon, lat, t)

    day_mean = np.nanmean(arr, axis=2)  # (lon, lat)
    grid = np.flipud(day_mean.T).astype(np.float32)  # north-up: (lat desc, lon asc)
    grid[grid <= 0] = np.nan  # outside model domain (land / no-data)

    dx = float(lon[1] - lon[0])
    dy = float(lat[1] - lat[0])
    west = float(lon.min()) - dx / 2
    north = float(lat.max()) + dy / 2
    transform = from_origin(west, north, dx, dy)

    os.makedirs(os.path.dirname(dst_path), exist_ok=True)
    with rasterio.open(
        dst_path,
        "w",
        driver="GTiff",
        height=grid.shape[0],
        width=grid.shape[1],
        count=1,
        dtype="float32",
        crs="EPSG:4326",
        transform=transform,
        nodata=np.nan,
        compress="deflate",
    ) as dst:
        dst.write(grid, 1)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--src", default=SRC_DIR, help="Root dir of YYYYMM/YYYYMMDD.nc files")
    parser.add_argument("--dst", default=DST_DIR, help="Local output dir for GeoTIFFs")
    parser.add_argument("--variable", default="vessel_noise", choices=["vessel_noise", "combined_noise", "wind_noise"])
    parser.add_argument("--freq", type=float, default=50, help="Frequency in Hz (nearest match)")
    parser.add_argument("--depth", type=float, default=10, help="Depth in m (nearest match)")
    parser.add_argument("--start", default=None, help="YYYY-MM-DD, inclusive")
    parser.add_argument("--end", default=None, help="YYYY-MM-DD, inclusive")
    parser.add_argument("--overwrite", action="store_true", help="Re-convert days that already have output")
    args = parser.parse_args()

    files = find_daily_files(args.src, args.start, args.end)
    if not files:
        print("No matching source files found.")
        sys.exit(1)

    out_subdir = os.path.join(args.dst, f"{args.variable}_f{int(args.freq)}_d{int(args.depth)}")
    print(f"Found {len(files)} daily files. Writing to {out_subdir}/")

    converted = skipped = 0
    for i, (date, src_path) in enumerate(files, 1):
        dst_path = os.path.join(out_subdir, f"{date}.tif")
        if os.path.exists(dst_path) and not args.overwrite:
            skipped += 1
            continue
        convert_one(src_path, dst_path, args.variable, args.freq, args.depth)
        converted += 1
        if i % 10 == 0 or i == len(files):
            print(f"  {i}/{len(files)} ({converted} converted, {skipped} skipped)")

    print(f"Done. {converted} converted, {skipped} already present.")


if __name__ == "__main__":
    main()

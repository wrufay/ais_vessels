"""
noise_to_geotiff.py
====================

This script converts daily ocean noise modelling NetCDFs located at /mnt/shared_remote/
into local, single-band GeoTIFFs that the FastAPI backend can serve as map overlay images.

Source data layout
------------------
  /mnt/shared_remote/
    202002/
      20200201.nc  
      20200202.nc
      ...
    202003/
      ...

Each .nc file covers one calendar day and has these dimensions and variables:

  Dimensions:
    x  = 701   (longitude axis, -69.5° → -59.0°, spacing 0.015°)
    y  = 417   (latitude  axis,  41.0° →  46.0°, spacing ~0.012°)
    f  = 5     (frequency bands: 50, 100, 200, 500, 1000 Hz)
    d  = 19    (depth levels: 10, 20, 30, ..., 150, 175, 200, 300, 500 m)
    t  = 144   (time steps: 10-minute intervals throughout the day)

  Variables:
    longitude(x)            – 1-D array of cell-centre longitudes
    latitude(y)             – 1-D array of cell-centre latitudes
    frequency(f)            – 1-D array of frequency values in Hz
    depth(d)                – 1-D array of depth values in metres
    time(t)                 – 1-D array (days since epoch, not used here)
    vessel_noise(x,y,f,d,t) – modelled vessel noise in dB re 1 µPa
    combined_noise(x,y,f,d,t) – vessel + wind noise combined
    wind_noise(x,y,f,t)    – wind-driven ambient noise (no depth dim)


What this script produces
--------------------------
For each day, one (variable, frequency, depth) combination is extracted,
averaged across the 144 time steps into a single daily-mean 2-D grid, and
written as a float32 GeoTIFF in EPSG:4326 with NaN for land/no-data cells.

Output: <dst>/<variable>_f<freq>_d<depth>/YYYY-MM-DD.tif


The script is resumable — it skips any day whose output file already exists,
so you can run it in batches or after interruption without reprocessing.

Usage examples
--------------
  # Convert everything with defaults (vessel_noise, 50 Hz, 10 m)
  python noise_to_geotiff.py

  # Convert a specific date range only
  python noise_to_geotiff.py --start 2020-02-01 --end 2020-02-29

  # Convert combined noise at 100 Hz / 50 m depth
  python noise_to_geotiff.py --variable combined_noise --freq 100 --depth 50

  # Produce monthly means instead of daily (outputs YYYY-MM.tif)
  python noise_to_geotiff.py --monthly

  # Force re-conversion of days that already have output
  python noise_to_geotiff.py --overwrite

  # Use a different source or output directory
  python noise_to_geotiff.py --src /other/mount --dst /data/noise_tifs

Performance note
----------------
Each source file requires reading ~337 MB of double-precision data over the
sshfs network mount (~17 s/file on this machine). Converting all ~450 days
takes roughly 2 hours. Run it in a screen/tmux session or as a background
job. Progress is printed per month with elapsed time.

Dependencies
------------
  pip install netCDF4 rasterio numpy
"""

import argparse
import os
import re
import sys
import time

import netCDF4 as nc  # type: ignore
import numpy as np
import rasterio  # type: ignore
from rasterio.transform import from_origin  # type: ignore

# Default source: the sshfs-mounted remote directory on this machine.
SRC_DIR = "/mnt/shared_remote"

# Default destination: a gitignored subdirectory of pipeline/ in this repo.
DST_DIR = os.path.join(os.path.dirname(__file__), "noise_data")

# Matches filenames like "20200201.nc" and captures year, month, day groups.
DATE_RE = re.compile(r"^(\d{4})(\d{2})(\d{2})\.nc$")


def _nearest_index(values: np.ndarray, target: float) -> int:
    """Return the index of the element in `values` closest to `target`.

    NetCDF stores a fixed set of frequency and depth levels (e.g. frequency = [50, 100, 200, 500, 1000] Hz)
    so a requested value is snapped to the nearest available one.
    """
    return int(np.argmin(np.abs(values - target)))


def find_daily_files(src_dir: str, start: str | None, end: str | None) -> list[tuple[str, str]]:
    """Scan src_dir and return a sorted list of (date, path) pairs.

    Scans all YYYYMM/ subdirectories for YYYYMMDD.nc files, returning those within
    the [start, end] date range if given (ISO strings, both inclusive)
    Anything not matching the expected naming pattern is skipped.


    Parameters
    ----------
    src_dir:
        Root directory containing YYYYMM/ month subdirectories.
    start:
        Earliest date to include, as "YYYY-MM-DD". None means no lower bound.
    end:
        Latest date to include, as "YYYY-MM-DD". None means no upper bound.

    Returns
    -------
    List of (date_str, full_path) tuples, sorted chronologically.
    """
    out = []
    for month_dir in sorted(os.listdir(src_dir)):
        month_path = os.path.join(src_dir, month_dir)
        # Skip anything that isn't a 6-digit YYYYMM directory.
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
    """Convert one day's NetCDF to a local GeoTIFF.

    Steps
    -----
    1. Open the NetCDF and slice the chosen variable at the requested
       frequency/depth level, giving a (701, 417, 144) array of the day's
       144 ten-minute time steps. (except for wind_noise, which has no depth dimension.)

    2. Mask land / no-data cells (stored as exactly 0.0 dB) to NaN. This is
       done BEFORE the next step, because 0 dB converts to a valid-looking
       pressure and would otherwise pollute the average.

    3. Average in linear pressure space, not in dB. Convert dB to pressure
       (SPL_linear = 10^(SPL_dB / 20)), take the mean over the 144 time steps,
       then convert back to dB (SPL_dB = 20 * log10(mean)). Averaging dB
       directly underweights loud events, so it must be done in linear space.

    4. Transpose to (lat, lon) = (417, 701) and flip vertically so the first
       row is the northernmost latitude (GeoTIFF convention) and cast to float32,
       which halves the file size.

    5. Compute the affine transform. rasterio's from_origin() takes the
       north-west corner of the top-left pixel (not its centre), so we shift
       the cell-centre coordinates outward by half a pixel in each direction.

    6. Write a single-band float32 GeoTIFF with deflate compression and NaN
       as the nodata value. 

    Parameters
    ----------
    src_path:
        Path to the source YYYYMMDD.nc file.
    dst_path:
        Path where the output GeoTIFF will be written. Parent directory is
        created if it does not exist.
    variable:
        NetCDF variable name: "vessel_noise", "combined_noise", or
        "wind_noise". Depth argument is ignored for wind_noise.
    freq:
        Target frequency in Hz - nearest available frequency band is used.
    depth:
        Target depth in metres - nearest available depth level is used.
    """
    with nc.Dataset(src_path) as ds:
        if variable not in ds.variables:
            print(f"    skipping {os.path.basename(src_path)} — '{variable}' not found", flush=True)
            return
        lon = np.array(ds["longitude"][:])   # shape (701,), degrees east
        lat = np.array(ds["latitude"][:])    # shape (417,), degrees north
        fi = _nearest_index(np.array(ds["frequency"][:]), freq)
        has_depth = ds[variable].ndim == 5  # wind_noise has no depth dimension
        if has_depth:
            di = _nearest_index(np.array(ds["depth"][:]), depth)
            arr = np.array(ds[variable][:, :, fi, di, :], dtype=np.float64)  # (701, 417, 144)
        else:
            arr = np.array(ds[variable][:, :, fi, :], dtype=np.float64)      # (701, 417, 144)

    # Mask land (0.0 dB) before converting: 0 dB → 1.0 µPa would otherwise
    # pass as a real quiet-ocean cell.
    arr[arr <= 0] = np.nan

    # Average in linear space, then back to dB (see Steps 2-3).
    linear = 10.0 ** (arr / 20.0)
    with np.errstate(invalid="ignore", divide="ignore"):  # all-NaN land cols
        day_mean_linear = np.nanmean(linear, axis=2)
        day_mean = 20.0 * np.log10(day_mean_linear)  # (701, 417), dB

    # North-up GeoTIFF orientation: (lon,lat) → (lat,lon), then flip N-S.
    grid = np.flipud(day_mean.T).astype(np.float32)  # (417, 701)

    # from_origin() wants the NW corner of the top-left pixel, so shift the
    # cell-centre coords out by half a pixel.
    dx = float(lon[1] - lon[0])
    dy = float(lat[1] - lat[0])
    west  = float(lon.min()) - dx / 2
    north = float(lat.max()) + dy / 2
    transform = from_origin(west, north, dx, dy)

    os.makedirs(os.path.dirname(dst_path), exist_ok=True)
    with rasterio.open(
        dst_path,
        "w",
        driver="GTiff",
        height=grid.shape[0],   # rows = latitude
        width=grid.shape[1],    # cols = longitude
        count=1,                # single band
        dtype="float32",
        crs="EPSG:4326",
        transform=transform,
        nodata=np.nan,
        compress="deflate",
    ) as dst:
        dst.write(grid, 1)


def convert_monthly(
    month_files: list[tuple[str, str]],
    dst_path: str,
    variable: str,
    freq: float,
    depth: float,
) -> None:
    """Average all daily files for one calendar month and write a GeoTIFF.

    Averaging is done in linear pressure space across all days × all 144
    time steps simultaneously, then converted back to dB. This avoids loading
    all days into memory at once by accumulating a running sum and valid-count
    array (each ~2.3 MB) instead of stacking the full (701, 417, 144×N) array
    (~9 GB for a 28-day month).

    Parameters
    ----------
    month_files:
        List of (date_str, src_path) pairs for all days in the month, sorted
        chronologically. Must all belong to the same calendar month.
    dst_path:
        Output path for the monthly GeoTIFF (e.g. .../2020-02.tif).
    variable, freq, depth:
        Same semantics as convert_one.
    """
    lon = lat = fi = di = None
    # Running accumulators in linear space; float64 to avoid precision loss
    # over ~4000 time steps (144 × ~28 days).
    linear_sum: np.ndarray | None = None
    valid_count: np.ndarray | None = None

    for _, src_path in month_files:
        with nc.Dataset(src_path) as ds:
            if variable not in ds.variables:
                print(f"    skipping {os.path.basename(src_path)} — '{variable}' not found", flush=True)
                continue
            if lon is None:
                lon = np.array(ds["longitude"][:])
                lat = np.array(ds["latitude"][:])
                fi = _nearest_index(np.array(ds["frequency"][:]), freq)
                has_depth = ds[variable].ndim == 5
                di = _nearest_index(np.array(ds["depth"][:]), depth) if has_depth else None
                shape = (len(lon), len(lat))
                linear_sum = np.zeros(shape, dtype=np.float64)
                valid_count = np.zeros(shape, dtype=np.int64)
            if di is not None:
                arr = np.array(ds[variable][:, :, fi, di, :], dtype=np.float64)
            else:
                arr = np.array(ds[variable][:, :, fi, :], dtype=np.float64)

        # Mask land (0.0 dB) before converting, then add this day into the
        # running sum/count (see convert_one).
        arr[arr <= 0] = np.nan
        linear = 10.0 ** (arr / 20.0)
        linear_sum += np.nansum(linear, axis=2)
        valid_count += np.sum(~np.isnan(linear), axis=2).astype(np.int64)

    # Mean over all days, back to dB; valid_count == 0 means land → NaN.
    with np.errstate(invalid="ignore", divide="ignore"):
        mean_linear = np.where(valid_count > 0, linear_sum / valid_count, np.nan)
        month_mean = 20.0 * np.log10(mean_linear)

    grid = np.flipud(month_mean.T).astype(np.float32)  # (417, 701), north-up

    dx = float(lon[1] - lon[0])
    dy = float(lat[1] - lat[0])
    west  = float(lon.min()) - dx / 2
    north = float(lat.max()) + dy / 2
    transform = from_origin(west, north, dx, dy)

    os.makedirs(os.path.dirname(dst_path), exist_ok=True)
    with rasterio.open(
        dst_path, "w", driver="GTiff",
        height=grid.shape[0], width=grid.shape[1],
        count=1, dtype="float32",
        crs="EPSG:4326", transform=transform,
        nodata=np.nan, compress="deflate",
    ) as dst:
        dst.write(grid, 1)


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--src", default=SRC_DIR,
                        help="Root directory containing YYYYMM/YYYYMMDD.nc files "
                             f"(default: {SRC_DIR})")
    parser.add_argument("--dst", default=DST_DIR,
                        help="Local output root for GeoTIFFs "
                             f"(default: {DST_DIR})")
    parser.add_argument("--variable", default="vessel_noise",
                        choices=["vessel_noise", "combined_noise", "wind_noise"],
                        help="NetCDF variable to extract (default: vessel_noise)")
    parser.add_argument("--freq", type=float, default=50,
                        help="Frequency band in Hz — nearest available level is used "
                             "(available: 50, 100, 200, 500, 1000; default: 50)")
    parser.add_argument("--depth", type=float, default=10,
                        help="Depth level in metres — nearest available level is used "
                             "(available: 10–500 m; default: 10)")
    parser.add_argument("--start", default=None,
                        help="First date to convert, inclusive, as YYYY-MM-DD")
    parser.add_argument("--end", default=None,
                        help="Last date to convert, inclusive, as YYYY-MM-DD")
    parser.add_argument("--overwrite", action="store_true",
                        help="Re-convert days/months whose output file already exists")
    parser.add_argument("--monthly", action="store_true",
                        help="Produce one GeoTIFF per calendar month (monthly mean) "
                             "instead of one per day")
    args = parser.parse_args()

    files = find_daily_files(args.src, args.start, args.end)
    if not files:
        print("No matching source files found.")
        sys.exit(1)

    out_subdir = os.path.join(args.dst, f"{args.variable}_f{int(args.freq)}_d{int(args.depth)}")

    if args.monthly:
        # Group daily files by YYYY-MM.
        months: dict[str, list[tuple[str, str]]] = {}
        for date, src_path in files:
            ym = date[:7]  # "YYYY-MM"
            months.setdefault(ym, []).append((date, src_path))

        print(f"Found {len(files)} daily files across {len(months)} months. Writing to {out_subdir}/")
        converted = skipped = 0
        for i, (ym, month_files) in enumerate(sorted(months.items()), 1):
            dst_path = os.path.join(out_subdir, f"{ym}.tif")
            if os.path.exists(dst_path) and not args.overwrite:
                skipped += 1
                print(f"  [{i}/{len(months)}] {ym} — skipped (already exists)")
                continue
            print(f"  [{i}/{len(months)}] {ym} — averaging {len(month_files)} days ...", flush=True)
            t0 = time.time()
            convert_monthly(month_files, dst_path, args.variable, args.freq, args.depth)
            elapsed = time.time() - t0
            print(f"  [{i}/{len(months)}] {ym} — done in {elapsed:.0f}s", flush=True)
            converted += 1
        print(f"Done. {converted} converted, {skipped} already present.")
    else:
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

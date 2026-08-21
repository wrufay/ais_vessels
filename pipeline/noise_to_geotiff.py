"""
This script converts daily ocean noise modelling NetCDFs into local,
single-band GeoTIFFs that the FastAPI backend serves as map overlay images.

Input:
Daily NetCDFs at /mnt/shared_remote/<YYYYMM>/<YYYYMMDD>.nc (sshfs-mounted).

Output:
<dst>/<variable>_f<freq>_d<depth>/YYYY-MM-DD.tif (or YYYY-MM.tif with
--monthly) 


Commands to run:
    python pipeline/noise_to_geotiff.py
    python pipeline/noise_to_geotiff.py --start 2020-02-01 --end 2020-02-29
    python pipeline/noise_to_geotiff.py --variable combined_noise --freq 100 --depth 50
    python pipeline/noise_to_geotiff.py --monthly
    python pipeline/noise_to_geotiff.py --overwrite
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

# Sanity ceiling, dB re 1 uPa -- real readings top out ~141 dB; glitched
# timesteps sometimes pin a whole grid block to 154-178 dB (found via
# 20200223.nc), which real depth-attenuated sound never does.
MAX_PLAUSIBLE_DB = 145.0


def _nearest_index(values: np.ndarray, target: float) -> int:
    """Return the index of the element in `values` closest to `target`.

    NetCDF stores a fixed set of frequency and depth levels (e.g. frequency = [50, 100, 200, 500, 1000] Hz)
    so a requested value is snapped to the nearest available one.
    """
    return int(np.argmin(np.abs(values - target)))


def find_daily_files(src_dir: str, start: str | None, end: str | None) -> list[tuple[str, str]]:
    """Scan src_dir and return a sorted list of (date, path) pairs.

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
            raw = ds[variable][:, :, fi, di, :]
        else:
            raw = ds[variable][:, :, fi, :]
        # Use filled() so netCDF masked values (e.g. wind_noise land cells
        # stored as NaN) become np.nan
        arr = np.ma.filled(raw, np.nan).astype(np.float64)  # (701, 417, 144)

    # Mask land (0 dB) BEFORE averaging -- masked after, it'd still skew the mean.
    arr[arr <= 0] = np.nan
    # Mask implausibly loud readings (see MAX_PLAUSIBLE_DB above)
    arr[arr > MAX_PLAUSIBLE_DB] = np.nan

    # Linear-space average, not dB -- dB is logarithmic, underweights loud events.
    linear = 10.0 ** (arr / 20.0)
    with np.errstate(invalid="ignore", divide="ignore"):  # all-NaN land cols
        day_mean_linear = np.nanmean(linear, axis=2)
        day_mean = 20.0 * np.log10(day_mean_linear)  # (701, 417), dB

    # North-up GeoTIFF orientation: (lon,lat) → (lat,lon), then flip N-S.
    grid = np.flipud(day_mean.T).astype(np.float32)  # (417, 701)

    # from_origin() wants the NW corner of the top-left pixel, shift the
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

    Linear-space average, then back to dB. Uses a running sum/count
    accumulator (~2.3 MB) instead of stacking every day (~9 GB/month).

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
            raw = ds[variable][:, :, fi, di, :] if di is not None else ds[variable][:, :, fi, :]
            arr = np.ma.filled(raw, np.nan).astype(np.float64)

        # Mask land (0.0 dB) and implausibly loud glitched readings
        arr[arr <= 0] = np.nan
        arr[arr > MAX_PLAUSIBLE_DB] = np.nan
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

    # This naming convention is mirrored independently in analysis/noise.py's
    # combo_dirname().
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

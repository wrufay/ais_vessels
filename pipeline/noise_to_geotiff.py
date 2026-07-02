"""
noise_to_geotiff.py
====================
Converts daily ocean noise modelling NetCDFs (mounted from a remote sshfs
share at /mnt/shared_remote) into local, single-band GeoTIFFs that the
FastAPI backend can serve as map overlay images.

Background — why convert at all?
---------------------------------
The source files live on a network-mounted filesystem (sshfs from a remote
HPC node). Reading from it is slow (~17 s/file) and unreliable — the mount
can disconnect, and Docker containers cannot access it without a fragile
bind-mount of a FUSE filesystem. Each source file is also a large 5-D array
(lon × lat × frequency × depth × time) whereas the map overlay only ever
needs a single 2-D slice. Converting once to a compact local GeoTIFF means:
  - the backend reads from local disk in milliseconds instead of ~17 s
  - the Docker container has no dependency on the remote mount
  - each output file is ~630 KB (deflate-compressed float32) vs ~337 MB
    for the full double-precision NetCDF array read over the network

Source data layout
------------------
  /mnt/shared_remote/
    202002/
      20200201.nc   ← one file per day
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

  No-data convention:
    Cells outside the acoustic model's ocean domain (i.e. on land or beyond
    the shelf-edge boundary) are stored as exactly 0.0 dB, not NaN. We
    convert these to NaN in the output GeoTIFF so downstream code can
    distinguish real low-noise values from masked land cells.

What this script produces
--------------------------
For each day, one (variable, frequency, depth) combination is extracted:
  1. The 144 time steps are averaged into a single daily-mean 2-D grid.
  2. The grid is transposed and flipped to north-up orientation for GeoTIFF
     convention (rows run south→north in the NetCDF, north→south in an image).
  3. Zero-valued cells (land / no-data) are set to NaN.
  4. A rasterio affine transform is computed from the cell-centre coordinates,
     converting from grid indices to EPSG:4326 lon/lat degrees. The transform
     uses the pixel-corner convention: the transform origin is the north-west
     corner of the top-left pixel, not its centre.
  5. The result is written as a single-band float32 GeoTIFF with deflate
     compression and NaN as the nodata value.

Output directory structure:
  <dst>/<variable>_f<freq>_d<depth>/
    2020-02-01.tif
    2020-02-02.tif
    ...

  Example: pipeline/noise_data/vessel_noise_f50_d10/2020-02-01.tif

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

  # Force re-conversion of days that already have output
  python noise_to_geotiff.py --overwrite

  # Use a different source or output directory
  python noise_to_geotiff.py --src /other/mount --dst /data/noise_tifs

Performance note
----------------
Each source file requires reading ~337 MB of double-precision data over the
sshfs network mount (~17 s/file on this machine). Converting all ~450 days
takes roughly 2 hours. Run it in a screen/tmux session or as a background
job. Progress is printed every 10 files.

Dependencies
------------
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

# Default source: the sshfs-mounted remote directory on this machine.
SRC_DIR = "/mnt/shared_remote"

# Default destination: a gitignored subdirectory of pipeline/ in this repo.
DST_DIR = os.path.join(os.path.dirname(__file__), "noise_data")

# Matches filenames like "20200201.nc" and captures year, month, day groups.
DATE_RE = re.compile(r"^(\d{4})(\d{2})(\d{2})\.nc$")


def _nearest_index(values: np.ndarray, target: float) -> int:
    """Return the index of the element in `values` closest to `target`.

    Used to find the frequency or depth level that best matches the requested
    value, since the NetCDF stores only a fixed set of discrete levels (e.g.
    frequency = [50, 100, 200, 500, 1000] Hz).
    """
    return int(np.argmin(np.abs(values - target)))


def find_daily_files(src_dir: str, start: str | None, end: str | None) -> list[tuple[str, str]]:
    """Walk src_dir and return a sorted list of (date, path) pairs.

    Scans all YYYYMM/ subdirectories for YYYYMMDD.nc files. Filters to the
    [start, end] date range if provided (ISO strings, both inclusive).
    Directories or files that don't match the expected naming pattern are
    silently skipped (e.g. loc/, slurmout/, size.2024.txt).

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
    1. Open the NetCDF and read the coordinate arrays (lon, lat, frequency,
       depth) to find the index of the requested freq/depth level.
    2. Slice the chosen variable at [all_lon, all_lat, freq_idx, depth_idx,
       all_time], giving a (701, 417, 144) array.
    3. Average over the time axis to get a single daily-mean (701, 417) grid.
    4. Transpose to (lat, lon) = (417, 701) and flip vertically so that the
       first row corresponds to the northernmost latitude — this is the
       standard image/GeoTIFF convention (north-up).
    5. Cast to float32 (source data is float64; halves the file size with no
       meaningful precision loss for dB values).
    6. Set cells at or below 0 dB to NaN. The acoustic model stores land cells
       and cells outside its domain as exactly 0.0, not as a conventional
       nodata value, so this threshold is the agreed-upon land mask.
    7. Compute the affine transform. rasterio's from_origin() takes the
       north-west corner of the top-left pixel (not its centre), so we shift
       the cell-centre coordinates outward by half a pixel in each direction.
    8. Write the GeoTIFF with deflate compression. Deflate works well here
       because the NaN no-data region (land) compresses very efficiently.

    Parameters
    ----------
    src_path:
        Path to the source YYYYMMDD.nc file.
    dst_path:
        Path where the output GeoTIFF will be written. Parent directory is
        created if it does not exist.
    variable:
        NetCDF variable name: "vessel_noise", "combined_noise", or
        "wind_noise". wind_noise has no depth dimension; the depth argument
        is ignored for it (the script currently only handles variables with
        both f and d dimensions — wind_noise would need a separate branch).
    freq:
        Target frequency in Hz. The nearest available frequency band is used.
    depth:
        Target depth in metres. The nearest available depth level is used.
    """
    with nc.Dataset(src_path) as ds:
        lon = np.array(ds["longitude"][:])   # shape (701,), degrees east
        lat = np.array(ds["latitude"][:])    # shape (417,), degrees north
        fi = _nearest_index(np.array(ds["frequency"][:]), freq)
        di = _nearest_index(np.array(ds["depth"][:]), depth)
        # Read only the needed freq/depth hyperslab across all lon, lat, time.
        # NetCDF4 fancy indexing reads just this slice from disk, not the
        # entire 5-D variable (~337 MB uncompressed). Even so, reading the
        # 144 time steps over sshfs takes ~17 s per file.
        arr = np.array(ds[variable][:, :, fi, di, :])  # (lon=701, lat=417, t=144)

    # Average the 144 ten-minute time steps into one daily-mean value per cell.
    day_mean = np.nanmean(arr, axis=2)  # (701, 417)

    # Transpose from (lon, lat) to (lat, lon) = (417, 701) so that axis 0
    # is latitude (rows) and axis 1 is longitude (columns), matching image
    # and GeoTIFF conventions. Then flip vertically: the NetCDF lat axis runs
    # south→north (lat[0]=41°, lat[-1]=46°), but GeoTIFF rows run north→south
    # so that pixel (0,0) is the north-west corner of the raster.
    grid = np.flipud(day_mean.T).astype(np.float32)  # (417, 701)

    # Land / no-data mask. The acoustic model stores cells outside its domain
    # as 0.0 dB rather than NaN. Setting these to NaN lets rasterio write a
    # proper nodata value, and lets the renderer skip these cells (transparent
    # in the PNG overlay).
    grid[grid <= 0] = np.nan

    # Build the affine transform. from_origin() expects the coordinates of the
    # north-west corner of the top-left pixel (pixel-corner convention), not
    # the cell centre. We shift outward by half a pixel:
    #   west  = lon_min - dx/2    (left edge of the leftmost column)
    #   north = lat_max + dy/2    (top edge of the topmost row)
    # from_origin(west, north, xsize, ysize) sets affine.e = -ysize internally,
    # so ysize should be the positive pixel height in degrees.
    dx = float(lon[1] - lon[0])    # ~0.015°
    dy = float(lat[1] - lat[0])    # ~0.01202°
    west  = float(lon.min()) - dx / 2
    north = float(lat.max()) + dy / 2
    transform = from_origin(west, north, dx, dy)

    os.makedirs(os.path.dirname(dst_path), exist_ok=True)
    with rasterio.open(
        dst_path,
        "w",
        driver="GTiff",
        height=grid.shape[0],   # 417 rows (latitude)
        width=grid.shape[1],    # 701 columns (longitude)
        count=1,                # single band
        dtype="float32",
        crs="EPSG:4326",        # geographic coordinates, WGS-84
        transform=transform,
        nodata=np.nan,
        compress="deflate",     # ~630 KB output vs ~1.2 MB uncompressed
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
                        help="Re-convert days whose output file already exists")
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

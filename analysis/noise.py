"""Renders local ocean noise GeoTIFFs as PNG map overlays -
one mean dB grid per (variable, frequency, depth, date).

Requires: GeoTIFFs already converted and sitting in NOISE_DATA_DIR
(pipeline/noise_data/ by default).

How to add new noise data
--------------------------
GeoTIFFs come from pipeline/noise_to_geotiff.py, which converts the raw
NetCDFs.

    python pipeline/noise_to_geotiff.py --variable combined_noise --freq 100 --depth 50

Output goes to NOISE_DATA_DIR/<variable>_f<freq>_d<depth>/YYYY-MM-DD.tif
(or YYYY-MM.tif with --monthly).
"""

import io
import os
import re

import matplotlib
import matplotlib.colors as mcolors
import numpy as np
import rasterio  # type: ignore
from PIL import Image
from scipy.ndimage import gaussian_filter  # type: ignore

NOISE_DATA_DIR = os.environ.get(
    "NOISE_DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "pipeline", "noise_data")
)

# Static grid extent
NOISE_EXTENT = {"min_lon": -69.5, "max_lon": -59.0, "min_lat": 41.0, "max_lat": 46.0}

NOISE_VARIABLES = {"combined_noise"}

_COMBO_DIRNAME_RE = re.compile(r"^(.+)_f(\d+)_d(\d+)$")


def _combo_prefix(variable: str, freq: float) -> str:
    """Folder-name prefix for a (variable, freq) pair, before the depth
    suffix — e.g. "combined_noise_f100_d"."""
    return f"{variable}_f{int(freq)}_d"


def combo_dirname(variable: str, freq: float, depth: float) -> str:
    """Folder name for one (variable, freq, depth) combo's GeoTIFFs, e.g.
    "combined_noise_f100_d50."
    """
    return f"{_combo_prefix(variable, freq)}{int(depth)}"


def parse_combo_dirname(name: str) -> tuple[str, int, int] | None:
    """Parse a combo folder name back into (variable, freq, depth), or
    None if it doesn't match the convention."""
    m = _COMBO_DIRNAME_RE.match(name)
    if not m:
        return None
    variable, freq, depth = m.groups()
    return variable, int(freq), int(depth)


def _load_grid(date: str, variable: str, freq: float, depth: float) -> np.ndarray:
    """Return the raster grid for one (date, variable, freq, depth) combo."""
    if variable not in NOISE_VARIABLES:
        raise ValueError(f"Unknown variable: {variable}")
    path = os.path.join(
        NOISE_DATA_DIR, combo_dirname(variable, freq, depth), f"{date}.tif"
    )
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    with rasterio.open(path) as ds:
        return ds.read(1)


def noise_range(
    date: str, variable: str = "combined_noise", freq: float = 50, depth: float = 10
) -> tuple[float, float]:
    """Return (vmin_dB, vmax_dB) — the 2nd/98th percentile of the grid.

    Always auto-computed (no override) — this is what the frontend calls
    on load to pre-fill the dB inputs before the user has customized
    anything. It is NOT what render_noise_overlay uses internally when a
    user-supplied vmin/vmax is passed to that function instead.
    """
    grid = _load_grid(date, variable, freq, depth)
    finite = grid[~np.isnan(grid)]
    if not finite.size:
        return 0.0, 1.0
    vmin, vmax = np.percentile(finite, [2, 98])
    return float(vmin), float(vmax)


def render_noise_overlay(
    date: str, variable: str = "combined_noise", freq: float = 50, depth: float = 10,
    vmin: float | None = None, vmax: float | None = None,
) -> bytes:
    """Return colormapped PNG bytes (RGBA, transparent no-data).

    `date` is "YYYY-MM-DD" for a daily overlay or "YYYY-MM" for a monthly one,
    matching the GeoTIFF filenames written by the pipeline.

    vmin/vmax set the dB values mapped to the two ends of the colour scale
    (RdYlBu_r colormap). Pass either/both explicitly to fix the scale; any
    left as None fall back to that image's own 2nd/98th percentile,
    computed after smoothing.
    """
    grid = _load_grid(date, variable, freq, depth)

    nodata = np.isnan(grid)
    # fill no-data with mean before smoothing to avoid edge bleed, then restore
    filled = np.where(nodata, float(np.nanmean(grid)), grid)
    smoothed = gaussian_filter(filled, sigma=1.5)
    smoothed[nodata] = np.nan

    if vmin is None or vmax is None:
        finite = smoothed[~nodata]
        auto_vmin, auto_vmax = np.percentile(finite, [2, 98]) if finite.size else (0.0, 1.0)
        if vmin is None:
            vmin = float(auto_vmin)
        if vmax is None:
            vmax = float(auto_vmax)

    norm = mcolors.Normalize(vmin=vmin, vmax=vmax, clip=True)
    rgba = matplotlib.colormaps["RdYlBu_r"](norm(np.nan_to_num(smoothed)), bytes=True)
    rgba[nodata, 3] = 0

    img = Image.fromarray(rgba, mode="RGBA")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()

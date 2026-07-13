"""Render local ocean noise modelling GeoTIFFs (produced by
pipeline/noise_to_geotiff.py) as PNG raster overlays for the map.

Each GeoTIFF is a mean dB grid — daily (YYYY-MM-DD.tif) or monthly
(YYYY-MM.tif) — for a single (variable, frequency, depth) combination, on a
fixed 701x417 EPSG:4326 grid. NaN cells are outside the model's ocean domain
(land / no-data).

The overlay is for visualisation only: the field is Gaussian-smoothed, then
colour-mapped via a min/max normalization (see render_noise_overlay). By
default that range is auto-computed per image (its own 2nd-98th percentile),
so colours are NOT comparable across overlays out of the box — pass explicit
vmin/vmax to fix the scale for cross-day/-month comparison, or to let a user
set it manually. That's wired up end-to-end via:

  GET /api/noise/overlay?date=...&vmin=<dB>&vmax=<dB>

exposed identically by main.py (real backend) and mock_api/main.py (mock),
and driven from the frontend by the two dB inputs under the noise layer's
colour bar in Map.tsx (state: noiseVminOverride / noiseVmaxOverride). Leaving
either query param off (or unset in the UI) falls back to the auto range.
"""

import io
import os

import matplotlib
import matplotlib.colors as mcolors
import numpy as np
import rasterio  # type: ignore
from PIL import Image
from scipy.ndimage import gaussian_filter  # type: ignore

NOISE_DATA_DIR = os.environ.get(
    "NOISE_DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "pipeline", "noise_data")
)

# Static grid extent, shared by every converted GeoTIFF in this dataset.
NOISE_EXTENT = {"min_lon": -69.5, "max_lon": -59.0, "min_lat": 41.0, "max_lat": 46.0}

NOISE_VARIABLES = {"vessel_noise", "combined_noise", "wind_noise"}


def _load_grid(date: str, variable: str, freq: float, depth: float) -> np.ndarray:
    if variable not in NOISE_VARIABLES:
        raise ValueError(f"Unknown variable: {variable}")
    path = os.path.join(
        NOISE_DATA_DIR, f"{variable}_f{int(freq)}_d{int(depth)}", f"{date}.tif"
    )
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    with rasterio.open(path) as ds:
        return ds.read(1)


def noise_range(
    date: str, variable: str = "vessel_noise", freq: float = 50, depth: float = 10
) -> tuple[float, float]:
    """Return (vmin_dB, vmax_dB) — the 2nd and 98th percentile of the grid.

    This is always auto-computed (no override) — it's what the frontend
    calls on load to pre-fill the dB inputs before the user has customized
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
    date: str, variable: str = "vessel_noise", freq: float = 50, depth: float = 10,
    vmin: float | None = None, vmax: float | None = None,
) -> bytes:
    """Return a colormapped PNG (RGBA, transparent no-data).

    `date` is "YYYY-MM-DD" for a daily overlay or "YYYY-MM" for a monthly one,
    matching the GeoTIFF filenames written by the pipeline.

    vmin/vmax set the dB values mapped to the two ends of the colour scale
    (RdYlBu_r colormap). Pass either/both explicitly to fix the scale (e.g.
    a user-chosen range, or a constant range for cross-day/-month
    comparison); any left as None fall back to that image's own 2nd/98th
    percentile, computed after smoothing.
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

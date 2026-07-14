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

Depth selection — more involved than it looks
-----------------------------------------------
The source NetCDFs have 19 depth levels (10-500m, see NOISE_DEPTHS below and
pipeline/noise_to_geotiff.py's docstring for the full source layout), but
converting even one (variable, frequency, depth) combination across the
whole dataset is a real multi-hour batch job (~2h / combo, per that script's
own performance note) — so on any given machine, only a small subset of the
19 x 5 possible (depth, frequency) combos per variable actually exist as
GeoTIFFs in NOISE_DATA_DIR at any time.

Because of that, a user-requested depth can't just be looked up directly —
it has to be resolved against whatever's actually been converted:

  1. resolve_depth(variable, freq, depth) scans NOISE_DATA_DIR's folder
     names (e.g. "vessel_noise_f50_d10") to find which depths are actually
     available for that (variable, freq), then snaps the request to the
     nearest one. This is a SEPARATE nearest-match step from the one in
     noise_to_geotiff.py — that script's _nearest_index() picks which of
     the 19 NetCDF levels to extract *during conversion*; resolve_depth()
     here picks which of the (usually much smaller) set of *already
     converted* depths to *serve*, at request time.
  2. Every public function below (_load_grid, noise_range,
     render_noise_overlay) returns the resolved depth alongside its normal
     result, specifically so callers surface what was ACTUALLY shown rather
     than silently implying an exact match. GET /api/noise/range includes
     it as "depth" in its JSON response (main.py and mock_api/main.py,
     identically); GET /api/noise/overlay doesn't need to, since the same
     inputs resolve to the same depth deterministically and the frontend
     already fetches /range alongside every overlay request.
  3. Map.tsx's depth control is a free-form number input (not a dropdown
     limited to what's converted) — typing any depth 10-500m is valid, and
     the UI shows "Nearest available: Xm" whenever the resolved depth
     (from /api/noise/range) differs from what was typed, rather than
     pretending the exact requested depth was used.

As of writing, only 10m has actually been converted (for all three
variables, at 50Hz) — see markdown/notes/JUL_14.md for the open question on
how many more depths are worth converting, and at what fidelity (exact vs.
nearest-available-with-labelling), which is a product/science call, not a
purely technical one.
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

# The 19 depth levels present in the source NetCDFs (see
# pipeline/noise_to_geotiff.py's docstring). Only some subset of these has
# actually been converted to GeoTIFF on any given machine — resolve_depth()
# snaps a request to whichever of these is actually servable.
NOISE_DEPTHS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 175, 200, 300, 500]


def _available_depths(variable: str, freq: float) -> list[int]:
    """Depths actually converted to GeoTIFF for this (variable, freq), by
    scanning NOISE_DATA_DIR subdirectory names — not all of NOISE_DEPTHS."""
    prefix = f"{variable}_f{int(freq)}_d"
    if not os.path.isdir(NOISE_DATA_DIR):
        return []
    depths = []
    for name in os.listdir(NOISE_DATA_DIR):
        if name.startswith(prefix) and name[len(prefix):].isdigit():
            depths.append(int(name[len(prefix):]))
    return sorted(depths)


def resolve_depth(variable: str, freq: float, depth: float) -> int:
    """Snap a requested depth (any of NOISE_DEPTHS, e.g. from a free-form
    user input) to the nearest one actually available as a converted
    GeoTIFF for this (variable, freq) — which may not be the same as the
    nearest entry in NOISE_DEPTHS itself, if that one hasn't been converted.
    """
    available = _available_depths(variable, freq)
    if not available:
        raise FileNotFoundError(f"No converted noise data for {variable} at {freq} Hz")
    return min(available, key=lambda d: abs(d - depth))


def _load_grid(date: str, variable: str, freq: float, depth: float) -> tuple[np.ndarray, int]:
    """Return (grid, resolved_depth) — resolved_depth is the actual depth
    used after snapping `depth` to the nearest one available (see
    resolve_depth), which callers should surface to the user rather than
    silently claiming to have served exactly what was requested."""
    if variable not in NOISE_VARIABLES:
        raise ValueError(f"Unknown variable: {variable}")
    resolved_depth = resolve_depth(variable, freq, depth)
    path = os.path.join(
        NOISE_DATA_DIR, f"{variable}_f{int(freq)}_d{resolved_depth}", f"{date}.tif"
    )
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    with rasterio.open(path) as ds:
        return ds.read(1), resolved_depth


def noise_range(
    date: str, variable: str = "vessel_noise", freq: float = 50, depth: float = 10
) -> tuple[float, float, int]:
    """Return (vmin_dB, vmax_dB, resolved_depth_m) — vmin/vmax are the 2nd
    and 98th percentile of the grid; resolved_depth_m is the depth actually
    used after snapping the requested `depth` to the nearest one available
    (see resolve_depth) — surface this to the user, don't assume it equals
    the requested depth.

    vmin/vmax here are always auto-computed (no override) — this is what the
    frontend calls on load to pre-fill the dB inputs before the user has
    customized anything. It is NOT what render_noise_overlay uses internally
    when a user-supplied vmin/vmax is passed to that function instead.
    """
    grid, resolved_depth = _load_grid(date, variable, freq, depth)
    finite = grid[~np.isnan(grid)]
    if not finite.size:
        return 0.0, 1.0, resolved_depth
    vmin, vmax = np.percentile(finite, [2, 98])
    return float(vmin), float(vmax), resolved_depth


def render_noise_overlay(
    date: str, variable: str = "vessel_noise", freq: float = 50, depth: float = 10,
    vmin: float | None = None, vmax: float | None = None,
) -> tuple[bytes, int]:
    """Return (colormapped PNG bytes (RGBA, transparent no-data), resolved_depth_m).

    `date` is "YYYY-MM-DD" for a daily overlay or "YYYY-MM" for a monthly one,
    matching the GeoTIFF filenames written by the pipeline.

    `depth` is snapped to the nearest one actually available as a converted
    GeoTIFF (see resolve_depth) — resolved_depth_m tells the caller what was
    actually used, which may differ from the requested `depth`.

    vmin/vmax set the dB values mapped to the two ends of the colour scale
    (RdYlBu_r colormap). Pass either/both explicitly to fix the scale (e.g.
    a user-chosen range, or a constant range for cross-day/-month
    comparison); any left as None fall back to that image's own 2nd/98th
    percentile, computed after smoothing.
    """
    grid, resolved_depth = _load_grid(date, variable, freq, depth)

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
    return buf.getvalue(), resolved_depth

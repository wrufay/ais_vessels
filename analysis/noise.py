"""Render local ocean noise modelling GeoTIFFs (produced by
pipeline/noise_to_geotiff.py) as PNG raster overlays for the map.

Each GeoTIFF is one day's mean dB grid for a single (variable, frequency,
depth) combination, on a fixed 701x417 EPSG:4326 grid. NaN cells are outside
the model's ocean domain (land / no-data).
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


def render_noise_overlay(
    date: str, variable: str = "vessel_noise", freq: float = 50, depth: float = 10
) -> bytes:
    """Return a colormapped PNG (RGBA, transparent no-data) for one day."""
    if variable not in NOISE_VARIABLES:
        raise ValueError(f"Unknown variable: {variable}")

    path = os.path.join(
        NOISE_DATA_DIR, f"{variable}_f{int(freq)}_d{int(depth)}", f"{date}.tif"
    )
    if not os.path.exists(path):
        raise FileNotFoundError(path)

    with rasterio.open(path) as ds:
        grid = ds.read(1)

    nodata = np.isnan(grid)
    # fill no-data with mean before smoothing to avoid edge bleed, then restore
    filled = np.where(nodata, float(np.nanmean(grid)), grid)
    smoothed = gaussian_filter(filled, sigma=1.5)
    smoothed[nodata] = np.nan

    finite = smoothed[~nodata]
    vmin, vmax = np.percentile(finite, [2, 98]) if finite.size else (0.0, 1.0)

    norm = mcolors.Normalize(vmin=vmin, vmax=vmax, clip=True)
    rgba = matplotlib.colormaps["RdYlBu_r"](norm(np.nan_to_num(smoothed)), bytes=True)
    rgba[nodata, 3] = 0

    img = Image.fromarray(rgba, mode="RGBA")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()

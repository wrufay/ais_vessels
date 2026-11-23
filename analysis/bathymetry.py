"""Water depth at a point, for the map's cursor readout.

Requires: the seabed depth files in /home/shared/bathymetry
(live/preview docker mounts it read-only), or else pipeline/bathymetry/ in
this repo (gitignored; a local copy for the test backend, which can only
see the working copy):
- nl_bioregion_compilation_2023.nc: main source, 100 m grid in a Lambert
  Conformal Conic projection, depths in whole metres.
- eastern_canada_3_isl_2015.nc: only where the NL file has no data (deep
  ocean beyond its edge, Saint-Pierre and Miquelon waters, western Gulf of
  Maine), 3 arc-second lat/lon grid.

Same sources and gap rule as pipeline/make_bathymetry_tiles.py, so the
readout agrees with the basemap tiles. Each lookup reads a few cells from the
memory-mapped files, never the whole file.
"""

import os
import threading

from pyproj import Transformer  # type: ignore
from scipy.io import netcdf_file  # type: ignore

BATHY_DIRS = [os.environ["BATHY_DIR"]] if os.environ.get("BATHY_DIR") else [
    "/home/shared/bathymetry",
    os.path.join(os.path.dirname(__file__), "..", "pipeline", "bathymetry"),
]
# Ocean basemap fill tiles made by pipeline/make_bathymetry_tiles.py
# (<dir>/<z>/<x>/<y>.webp); docker mounts them read-only.
BATHY_TILES_DIR = os.environ.get(
    "BATHY_TILES_DIR", os.path.join(os.path.dirname(__file__), "..", "pipeline", "bathy_tiles")
)
NL_FILE = "nl_bioregion_compilation_2023.nc"
EASTERN_FILE = "eastern_canada_3_isl_2015.nc"
NL_PROJ = "+proj=lcc +lat_0=46 +lon_0=-60 +lat_1=48 +lat_2=52 +datum=WGS84 +units=m"
NL_NODATA, EASTERN_LAND = -99999.0, -9999.0

# NL gaps narrower than this are just the two files' coastlines disagreeing,
# so the eastern file is not used there (cells of 100 m -> 3 cells).
GAP_MIN_CELLS = 3

_lock = threading.Lock()
_files: dict | None = None


def _load() -> dict:
    """Open both files once, on the first lookup that finds them (so files
    copied in while the backend runs are picked up). Raises
    FileNotFoundError if no folder in BATHY_DIRS has them."""
    global _files
    with _lock:
        if _files is None:
            folder = next((d for d in BATHY_DIRS if os.path.isfile(os.path.join(d, NL_FILE))), None)
            if folder is None:
                raise FileNotFoundError(f"{NL_FILE} not found in {BATHY_DIRS}")
            nl = netcdf_file(os.path.join(folder, NL_FILE), "r", mmap=True)
            ea = netcdf_file(os.path.join(folder, EASTERN_FILE), "r", mmap=True)
            _files = {
                "nl_z": nl.variables["bathymetry"],
                "nl_x": nl.variables["x"][:].copy(),
                "nl_y": nl.variables["y"][:].copy(),
                "nl_xy": Transformer.from_crs("EPSG:4326", NL_PROJ, always_xy=True),
                "ea_z": ea.variables["z"],
                "ea_x": ea.variables["x"][:].copy(),
                "ea_y": ea.variables["y"][:].copy(),
            }
        return _files


def _nearest(coords, value) -> int:
    return int(round((value - coords[0]) / (coords[1] - coords[0])))


def depth_at(lat: float, lon: float) -> int | None:
    """Water depth in whole metres (positive) at lat/lon, or None over land
    or outside both files."""
    f = _load()

    x, y = f["nl_xy"].transform(lon, lat)
    i, j = _nearest(f["nl_y"], y), _nearest(f["nl_x"], x)
    h, w = f["nl_z"].shape[-2:]
    if 0 <= i < h and 0 <= j < w:
        v = float(f["nl_z"][0, i, j])
        if v != NL_NODATA and v < 0:
            return max(1, round(-v))
        # Land or no data here. If the NL file has sea close by, this is its
        # coast (or an island): land, don't ask the eastern file.
        g = GAP_MIN_CELLS
        near = f["nl_z"][0, max(i - g, 0):i + g + 1, max(j - g, 0):j + g + 1]
        if ((near != NL_NODATA) & (near < 0)).any():
            return None

    i, j = _nearest(f["ea_y"], lat), _nearest(f["ea_x"], lon)
    h, w = f["ea_z"].shape
    if 0 <= i < h and 0 <= j < w:
        v = float(f["ea_z"][i, j])
        if v > EASTERN_LAND and v < 0:  # NaN fails both tests
            return max(1, round(-v))
    return None


def tile_path(z: int, x: int, y: int) -> str | None:
    """Path of one Ocean basemap fill tile, or None if there isn't one
    (land, outside the data, or a zoom we don't make)."""
    path = os.path.join(BATHY_TILES_DIR, str(z), str(x), f"{y}.webp")
    return path if os.path.isfile(path) else None

"""
This script turns the seabed depth files in /home/shared/bathymetry into map
tiles for the "Ocean / Bathymetry" basemap. Esri's Ocean map has no tiles
past zoom 10 over most of our offshore area, so zooming in only stretches
the zoom-10 tile; these tiles fill that gap at zoom 11-12 (the app stretches
zoom 12 further in, which is fine: the data has a point every ~100 m).

Look: Esri's own depth colour steps (measured from its zoom-10 tiles, see
DEPTH_BANDS) plus light hillshading, so the tiles sit next to real Esri tiles
without a visible change in style. Land and areas with no data are
transparent, so the Esri layer underneath shows through.

Input:
- nl_bioregion_compilation_2023.nc: main source. 100 m grid (Lambert
  Conformal Conic), 70.6W-47.7W, 40N-61.1N. Depths are rounded to whole
  metres, which shows as wavy terraces when zoomed in, so the data is
  smoothed lightly (SMOOTH_CELLS) first.
- eastern_canada_3_isl_2015.nc: fills gaps in the NL file (Saint-Pierre and
  Miquelon waters, western Gulf of Maine). 3 arc-second lat/lon grid,
  71W-42W, 41N-52N.

Output:
<dst>/<z>/<x>/<y>.webp, standard XYZ (Web Mercator) tile layout. Tiles with
no sea in them are not written.

Commands to run (needs numpy, scipy, pyproj, Pillow -- the backend image has
them, see the docker line below):
    python pipeline/make_bathymetry_tiles.py --count
    python pipeline/make_bathymetry_tiles.py
    python pipeline/make_bathymetry_tiles.py --bbox -62.2 44.2 -60.8 45.0
    python pipeline/make_bathymetry_tiles.py --zooms 11 12 --overwrite
    sg docker -c "docker run --rm --pull never \\
        -v /home/shared/bathymetry:/home/shared/bathymetry:ro \\
        -v $PWD:/work -w /work --entrypoint python vessel-tracks-backend \\
        pipeline/make_bathymetry_tiles.py"
"""

import argparse
import math
import os
import sys
import time

import numpy as np
from PIL import Image
from pyproj import Transformer
from scipy.io import netcdf_file
from scipy.ndimage import binary_dilation, binary_opening, gaussian_filter, map_coordinates

SRC_DIR = "/home/shared/bathymetry"
NL_FILE = "nl_bioregion_compilation_2023.nc"
EASTERN_FILE = "eastern_canada_3_isl_2015.nc"

# Default destination: a gitignored subdirectory of pipeline/ in this repo.
DST_DIR = os.path.join(os.path.dirname(__file__), "bathy_tiles")

# Area covered by the two files together (W, S, E, N).
FULL_BBOX = (-71.0, 40.0, -42.0, 61.2)

# The NL file's projection (from its spatial_ref attribute).
NL_PROJ = "+proj=lcc +lat_0=46 +lon_0=-60 +lat_1=48 +lat_2=52 +datum=WGS84 +units=m"

# Esri World Ocean Base colours by depth (m), measured on 2026-11-23 as the
# median colour of 70 Esri zoom-10 tiles across our area against the NL
# file's depth. Esri uses flat steps, not a smooth ramp. (lower depth, RGB)
DEPTH_BANDS = [
    (0, (203, 222, 239)),
    (30, (189, 215, 240)),
    (150, (180, 207, 234)),
    (400, (172, 202, 230)),
    (600, (166, 196, 224)),
    (1000, (158, 188, 222)),
    (2000, (152, 184, 220)),
    (3000, (143, 180, 222)),
    (3500, (137, 174, 219)),
    (4000, (125, 164, 212)),
    (5000, (114, 162, 210)),
]

SMOOTH_CELLS = 1.0   # Gaussian sigma in source grid cells (~100 m for NL)
GAP_MIN_M = 300      # near a coast (this close to land in both files) only the NL file is used
VERT_EXAG = 3.0      # hillshade: exaggerate slopes so the gentle shelf shows
SHADE_STRENGTH = 0.9 # hillshade: how much a slope lightens/darkens the colour
LIGHT_AZ, LIGHT_ALT = 315.0, 45.0  # light from the north-west, like Esri

TILE = 256
BLOCK = 4  # tiles are made 4x4 at a time, so each source window is read once
EARTH_M_PER_PX_Z0 = 156543.03392  # metres per pixel at zoom 0 on the equator


class Grid:
    """One depth file: positive depth in metres plus a 0/1 'has sea' mask,
    sampled at any lon/lat (bilinear), reading only the window it needs."""

    def __init__(self, nc, var, to_grid, nodata):
        self.z = nc.variables[var]
        self.ndim = len(self.z.shape)
        self.shape = self.z.shape[-2:]
        self.to_grid = to_grid
        self.nodata = nodata

    def sample(self, lon, lat):
        r, c = self.to_grid(lon, lat)
        h, w = self.shape
        pad = int(4 * SMOOTH_CELLS) + 2
        r0, r1 = max(int(np.floor(r.min())) - pad, 0), min(int(np.ceil(r.max())) + pad + 1, h)
        c0, c1 = max(int(np.floor(c.min())) - pad, 0), min(int(np.ceil(c.max())) + pad + 1, w)
        if r0 >= r1 or c0 >= c1:
            return np.zeros(lon.shape), np.zeros(lon.shape)
        win = self.z[0, r0:r1, c0:c1] if self.ndim == 3 else self.z[r0:r1, c0:c1]
        win = np.array(win, dtype="f8")
        sea = (win != self.nodata) & (win < 0) & np.isfinite(win)
        depth = np.where(sea, -win, 0.0)
        # Smooth only over sea cells (weighted), so the coast doesn't pull
        # depths towards 0.
        wsum = gaussian_filter(sea.astype("f8"), SMOOTH_CELLS)
        depth = gaussian_filter(depth, SMOOTH_CELLS) / np.maximum(wsum, 1e-6)
        depth[~sea] = 0.0
        # Outside the window (outside the file) counts as no data. Bilinear
        # depth near the coast mixes in the land zeros, so divide by the
        # share of sea to undo that.
        coords = [r - r0, c - c0]
        d = map_coordinates(depth, coords, order=1, mode="constant", cval=0.0)
        s = map_coordinates(sea.astype("f8"), coords, order=1, mode="constant", cval=0.0)
        d = np.where(s > 0, d / np.maximum(s, 1e-6), 0.0)
        return d, s


def open_sources(src_dir):
    nl_xy = Transformer.from_crs("EPSG:4326", NL_PROJ, always_xy=True)
    nl = netcdf_file(os.path.join(src_dir, NL_FILE), "r", mmap=True)  # opened once, read lazily
    nx, ny = nl.variables["x"][:].copy(), nl.variables["y"][:].copy()

    def nl_to_grid(lon, lat):
        x, y = nl_xy.transform(lon, lat)
        return (y - ny[0]) / (ny[1] - ny[0]), (x - nx[0]) / (nx[1] - nx[0])

    ea = netcdf_file(os.path.join(src_dir, EASTERN_FILE), "r", mmap=True)
    ex, ey = ea.variables["x"][:].copy(), ea.variables["y"][:].copy()

    def ea_to_grid(lon, lat):
        return (lat - ey[0]) / (ey[1] - ey[0]), (lon - ex[0]) / (ex[1] - ex[0])

    return Grid(nl, "bathymetry", nl_to_grid, -99999.0), Grid(ea, "z", ea_to_grid, -9999.0)


def tile_range(bbox, z):
    """Tile x/y ranges (inclusive) covering a W, S, E, N box at zoom z."""
    w, s, e, n = bbox
    def tx(lon): return int((lon + 180) / 360 * 2**z)
    def ty(lat):
        lat = math.radians(lat)
        return int((1 - math.log(math.tan(lat) + 1 / math.cos(lat)) / math.pi) / 2 * 2**z)
    return tx(w), tx(e), ty(n), ty(s)


def colourise(depth, sea, lat, z):
    """RGBA image: Esri depth colour steps x hillshade, alpha = share of sea."""
    edges = np.array([b[0] for b in DEPTH_BANDS])
    colours = np.array([b[1] for b in DEPTH_BANDS], dtype="f8")
    rgb = colours[np.clip(np.searchsorted(edges, depth, side="right") - 1, 0, len(edges) - 1)]

    # Hillshade on the seabed surface (elevation = -depth). Web Mercator
    # pixels are square on the ground; their size shrinks with cos(lat).
    px_m = EARTH_M_PER_PX_Z0 / 2**z * np.cos(np.radians(lat))[:, None]
    elev = -depth * VERT_EXAG
    dz_dx = np.gradient(elev, axis=1) / px_m
    dz_dy = -np.gradient(elev, axis=0) / px_m  # rows run south
    az, alt = math.radians(LIGHT_AZ), math.radians(LIGHT_ALT)
    light = np.array([math.cos(alt) * math.sin(az), math.cos(alt) * math.cos(az), math.sin(alt)])
    norm = np.sqrt(dz_dx**2 + dz_dy**2 + 1)
    shade = (-dz_dx * light[0] - dz_dy * light[1] + light[2]) / norm
    # A flat seabed keeps exactly the Esri colour; slopes lighten or darken.
    factor = 1 + SHADE_STRENGTH * (shade - light[2])
    rgb = np.clip(rgb * factor[..., None], 0, 255)

    alpha = np.clip(sea, 0, 1) * 255
    return np.dstack([rgb, alpha]).round().astype("uint8")


def make_block(sources, z, bx, by, x_max, y_max, dst, overwrite, quality):
    """Make up to BLOCK x BLOCK tiles starting at tile (bx, by). Returns
    (written, skipped_existing)."""
    nx_t, ny_t = min(BLOCK, x_max - bx + 1), min(BLOCK, y_max - by + 1)
    todo = [(bx + i, by + j) for i in range(nx_t) for j in range(ny_t)
            if overwrite or not os.path.exists(os.path.join(dst, str(z), str(bx + i), f"{by + j}.webp"))]
    if not todo:
        return 0, nx_t * ny_t

    # Pixel centres of the whole block plus a 1-pixel border, so hillshading
    # has neighbours at tile edges and no seams appear between tiles/blocks.
    n = TILE * 2**z
    gx = bx * TILE + np.arange(-1, nx_t * TILE + 1) + 0.5
    gy = by * TILE + np.arange(-1, ny_t * TILE + 1) + 0.5
    lon_1d = gx / n * 360 - 180
    lat_1d = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * gy / n))))
    lon, lat = np.meshgrid(lon_1d, lat_1d)

    nl, ea = sources
    depth, sea = nl.sample(lon, lat)
    # Where the NL file has no data over a wide area (its open-sea edge,
    # Saint-Pierre waters), use the eastern Canada file. Not along coasts
    # (NL sea, and land in the eastern file, within GAP_MIN_M): the two
    # files' coastlines disagree a little there. Not in the NL file's tiny
    # holes either. In both cases the files differ by a few metres, which
    # hillshading draws as dark specks. Pixels next to a wide gap that the
    # NL file covers only partly are blended, so no see-through line shows
    # where the two files meet.
    part = sea < 0.999
    if part.any():
        d2, s2 = np.zeros(sea.shape), np.zeros(sea.shape)
        d2[part], s2[part] = ea.sample(lon[part], lat[part])
        px_m = EARTH_M_PER_PX_Z0 / 2**z * math.cos(math.radians(lat_1d.mean()))
        r = max(1, round(GAP_MIN_M / px_m))
        coast = binary_dilation(sea > 0, iterations=r) & binary_dilation(part & (s2 < 0.5), iterations=r)
        wide_gap = binary_opening((sea == 0) & (s2 > 0) & ~coast, iterations=r)
        fill = part & (s2 > 0) & ~coast & binary_dilation(wide_gap, iterations=r + 2)
        depth[fill] = (depth[fill] * sea[fill] + d2[fill] * s2[fill]) / (sea[fill] + s2[fill])
        sea[fill] = np.maximum(sea[fill], s2[fill])
    if not (sea > 0).any():
        return 0, 0
    # Give land pixels next to the coast the nearby sea depth, so hillshading
    # doesn't see a cliff up to 0 m and draw a bright/dark rim along the coast.
    wet = (sea > 0).astype("f8")
    near = gaussian_filter(wet, 2)
    fill = gaussian_filter(depth * wet, 2) / np.maximum(near, 1e-6)
    depth = np.where((wet == 0) & (near > 0), fill, depth)

    rgba = colourise(depth, sea, lat_1d, z)[1:-1, 1:-1]
    written = 0
    for tx, ty in todo:
        i, j = (tx - bx) * TILE, (ty - by) * TILE
        tile = rgba[j:j + TILE, i:i + TILE]
        if not tile[..., 3].any():
            continue
        folder = os.path.join(dst, str(z), str(tx))
        os.makedirs(folder, exist_ok=True)
        Image.fromarray(tile, "RGBA").save(os.path.join(folder, f"{ty}.webp"), "WEBP", quality=quality, method=4)
        written += 1
    return written, nx_t * ny_t - len(todo)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--src", default=SRC_DIR, help="folder with the two .nc files")
    p.add_argument("--dst", default=DST_DIR, help="output folder for the tiles")
    p.add_argument("--zooms", type=int, nargs="+", default=[11, 12])
    p.add_argument("--bbox", type=float, nargs=4, metavar=("W", "S", "E", "N"), default=FULL_BBOX,
                   help="only make tiles in this lon/lat box (for samples)")
    p.add_argument("--quality", type=int, default=85, help="WebP quality (0-100)")
    p.add_argument("--overwrite", action="store_true", help="remake tiles that already exist")
    p.add_argument("--count", action="store_true", help="only print how many tiles the box has")
    args = p.parse_args()

    for z in args.zooms:
        x0, x1, y0, y1 = tile_range(args.bbox, z)
        print(f"zoom {z}: x {x0}-{x1}, y {y0}-{y1} ({(x1 - x0 + 1) * (y1 - y0 + 1)} tiles in the box, land/no-data ones are skipped)")
    if args.count:
        return

    sources = open_sources(args.src)
    for z in args.zooms:
        x0, x1, y0, y1 = tile_range(args.bbox, z)
        blocks = [(bx, by) for by in range(y0, y1 + 1, BLOCK) for bx in range(x0, x1 + 1, BLOCK)]
        t0, written, existing = time.time(), 0, 0
        for k, (bx, by) in enumerate(blocks, 1):
            w, e = make_block(sources, z, bx, by, x1, y1, args.dst, args.overwrite, args.quality)
            written, existing = written + w, existing + e
            if k % 20 == 0 or k == len(blocks):
                print(f"zoom {z}: block {k}/{len(blocks)}, {written} tiles written, "
                      f"{existing} already there, {time.time() - t0:.0f} s", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())

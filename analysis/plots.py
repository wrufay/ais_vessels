"""
This script generates plots used by the region analysis API endpoints.

Each function accepts query results as a pandas DataFrame and returns
a base64-encoded PNG string (ready to embed in a JSON response or <img> tag).

Functions:
    plot_vessel_types(daily_counts) — stacked bar chart of daily vessel counts by type
    plot_speed_overall(df)          — line chart of mean daily speed across all vessels
    plot_vessel_density(df, polygon, n_days) — map of time ships spent per area, for the Analyse pop-up
    render_vessel_density_overlay(df, polygon, n_days) — time ships spent per cell, as a see-through PNG to lay on the map
"""


import base64
import io
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd # type: ignore

# Maps vessel type label -> consistent hex color across all charts. Read from
# frontend/src/data/colors.json's "vessel" section
_COLORS_JSON = Path(__file__).resolve().parents[1] / "frontend" / "src" / "data" / "colors.json"
_raw_colors = json.loads(_COLORS_JSON.read_text())["vessel"]
TYPE_COLORS = {**_raw_colors, "search and rescue vessel": _raw_colors["search & rescue"]}
del TYPE_COLORS["search & rescue"]

# Draw order for stacked bars —> determines legend and layering order
ORDERED_TYPES = ["cargo", "tanker", "fishing", "passenger",
                 "search and rescue vessel", "other", "unknown"]

# AIS ship-type code ranges -> label. Shared by main.py and mock_api/main.py
TYPE_CATEGORIES = {
    "cargo":                    range(70, 80),
    "tanker":                   range(80, 90),
    "fishing":                  range(30, 31),
    "passenger":                range(60, 70),
    "search and rescue vessel": [51],
    "other":                    list(range(20, 30)) + list(range(31, 51)) +
                                list(range(52, 60)) + list(range(90, 100)),
}


def classify_ship_type(code):
    """AIS ship-type code -> label, via TYPE_CATEGORIES; "unknown" if unrecognized/missing."""
    try:
        c = int(code)
    except (TypeError, ValueError):
        return "unknown"
    for label, codes in TYPE_CATEGORIES.items():
        if c in codes:
            return label
    return "unknown"


def _to_b64(fig, dpi=120) -> str:
    """Renders a matplotlib figure to a base64-encoded PNG string and closes it."""
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=dpi, bbox_inches="tight")
    plt.close(fig)
    return base64.b64encode(buf.getvalue()).decode()


def plot_vessel_types(daily_counts: pd.DataFrame) -> str:
    """Returns a stacked bar chart of daily vessel counts by type as a base64 PNG.
    daily_counts: DataFrame indexed by date, one column per vessel type (e.g. "cargo", "tanker"),
              values are daily counts. Missing type columns are skipped."""

    fig, ax = plt.subplots(figsize=(12, 5))
    x = np.arange(len(daily_counts))
    bottom = np.zeros(len(daily_counts))

    for t in ORDERED_TYPES:
        if t not in daily_counts.columns:
            continue
        vals = daily_counts[t].values
        ax.bar(x, vals, bottom=bottom, label=t, color=TYPE_COLORS[t], width=0.8)
        bottom += vals

    labels = [d.strftime("%Y%b%d") for d in daily_counts.index]
    step = max(1, len(labels) // 15)
    ax.set_xticks(x[::step])
    ax.set_xticklabels(labels[::step], rotation=45, ha="right", fontsize=8)
    ax.set_ylabel("Total vessel number")
    ax.set_title("Vessel Traffic by Type")
    ax.legend(loc="upper left", fontsize=8, framealpha=0.9)
    ax.grid(axis="y", alpha=0.3)
    ax.set_xlim(-0.5, len(daily_counts) - 0.5)
    plt.tight_layout()
    return _to_b64(fig)


def plot_speed_overall(df: pd.DataFrame) -> str:
    """Returns a line chart of mean daily speed as a base64 PNG.
    df: DataFrame with columns "day" (date string) and "speed" (knots)."""

    df = df.copy()
    df["day"] = pd.to_datetime(df["day"])
    daily = df.groupby("day")["speed"].mean()

    fig, ax = plt.subplots(figsize=(12, 4))
    x = np.arange(len(daily))
    ax.plot(x, daily.values, color="#0072BD", marker="o", markersize=3, linewidth=1.5)

    labels = [d.strftime("%Y%b%d") for d in daily.index]
    step = max(1, len(labels) // 15)
    ax.set_xticks(x[::step])
    ax.set_xticklabels(labels[::step], rotation=45, ha="right", fontsize=8)
    ax.set_ylabel("Mean speed (knots)")
    ax.set_title("Mean Daily Speed — All Vessels")
    ax.grid(alpha=0.3)
    ax.set_xlim(-0.5, len(daily) - 0.5)
    plt.tight_layout()
    return _to_b64(fig)


# Two pings in a row from one ship are joined by a straight line when they are
# at most this far apart in time. Longer gaps (AIS off, in port, out of range)
# are left out, since where the ship was is unknown.
MAX_GAP_S = 60 * 60
STEP_S = 10  # the ship's position along each leg is taken every 10 s


def _ship_time_seconds(df: pd.DataFrame, lon_bins: np.ndarray, lat_bins: np.ndarray) -> np.ndarray:
    """Seconds ships spent in each grid cell. Rows are latitude (south
    first), columns longitude.

    Based on Xu's vessel density code (/home/shared/vesselDensityEstimation):
    each ship's pings are joined in time order and the time of each leg is
    shared out along the line between them. Unlike counting pings, this does
    not depend on how often ships report, so data from different AIS
    providers can be compared. Legs with an impossible speed are skipped:
    over 90 kn for gaps up to 10 min (Xu's 60 kn x 1.5), over 30 kn for
    longer gaps.
    """
    # Plain arrays of only the needed columns: copying the whole DataFrame
    # (Analyse also has text columns) doubles the memory for big regions
    mmsi = df["mmsi"].to_numpy()
    t = df["t"].to_numpy(float)
    order = np.lexsort((t, mmsi))  # by ship, then time
    mmsi, t = mmsi[order], t[order]
    first = np.r_[True, (mmsi[1:] != mmsi[:-1]) | (t[1:] != t[:-1])]  # drop repeated times
    order = order[first]
    mmsi, t = mmsi[first], t[first]
    lon = df["longitude"].to_numpy(float)[order]
    lat = df["latitude"].to_numpy(float)[order]
    del order, first

    dt = t[1:] - t[:-1]
    del t
    metres = np.hypot((lon[1:] - lon[:-1]) * 111320 * np.cos(np.radians(lat[:-1])),
                      (lat[1:] - lat[:-1]) * 110540)
    ok = (mmsi[1:] == mmsi[:-1]) & (dt > 0) & (dt <= MAX_GAP_S)
    del mmsi
    ok &= metres / np.where(dt > 0, dt, 1) / 0.5144 <= np.where(dt <= 600, 90, 30)
    legs = np.nonzero(ok)[0]
    del ok, metres
    steps = np.ceil(dt[legs] / STEP_S).astype(np.int64)

    secs = np.zeros((len(lon_bins) - 1, len(lat_bins) - 1))
    # Done in chunks of about 5 million positions to keep memory small
    cuts = np.searchsorted(np.cumsum(steps), np.arange(0, steps.sum() + 5_000_000, 5_000_000))
    for a, b in zip(cuts[:-1], cuts[1:]):
        leg, n = legs[a:b], steps[a:b]
        if len(leg) == 0:
            continue
        which = np.repeat(np.arange(len(leg)), n)  # leg of each position
        step = np.arange(n.sum()) - np.repeat(np.cumsum(n) - n, n)
        frac = (step + 0.5) / n[which]  # middle of each step along the leg
        i = leg[which]
        h, _, _ = np.histogram2d(
            lon[i] + frac * (lon[i + 1] - lon[i]),
            lat[i] + frac * (lat[i + 1] - lat[i]),
            bins=[lon_bins, lat_bins],
            weights=dt[i] / n[which],
        )
        secs += h
    return secs.T


def _vessel_density(df: pd.DataFrame, polygon, n_days: int):
    """Time ships spent in each cell of the region, in vessel-hours per km²
    per day. Rows are latitude (south first), columns longitude; cells
    outside the region or with no traffic are NaN.

    df: DataFrame with columns "mmsi", "t" (seconds since 1970), "longitude"
        and "latitude". Pings just outside the region let ships be followed
        in across its edge.
    polygon: the region (shapely geometry, lon/lat).
    n_days: number of days in the period.

    Returns (lon_bins, lat_bins, density, vmin, vmax), where vmin/vmax are
    the ends of a log colour scale stretched to this run's own traffic (5th
    to 99th percentile). Raises ValueError if there is too little data.
    """
    import shapely

    lon_min, lat_min, lon_max, lat_max = polygon.bounds
    # Cells about square on the ground: 0.001° (~110 m) of latitude for small
    # regions, up to 0.005° for big ones
    res_lat = max(0.001, min(0.005, min(lon_max - lon_min, lat_max - lat_min) / 400))
    res_lon = res_lat / np.cos(np.radians((lat_min + lat_max) / 2))
    lon_bins = np.arange(lon_min, lon_max + res_lon, res_lon)
    lat_bins = np.arange(lat_min, lat_max + res_lat, res_lat)

    secs = _ship_time_seconds(df, lon_bins, lat_bins)
    lon_c = (lon_bins[:-1] + lon_bins[1:]) / 2
    lat_c = (lat_bins[:-1] + lat_bins[1:]) / 2
    cell_km2 = (res_lon * 111.32 * np.cos(np.radians(lat_c)) * res_lat * 110.54)[:, None]
    density = secs / 3600 / cell_km2 / n_days
    density[density <= 0] = np.nan
    # Keep only cells whose centre is inside the region
    lon_grid, lat_grid = np.meshgrid(lon_c, lat_c)
    density[~shapely.contains_xy(polygon, lon_grid, lat_grid)] = np.nan
    if np.isnan(density).all():
        raise ValueError("Not enough position data for a density map.")

    vmin = np.nanpercentile(density, 5)
    vmax = np.nanpercentile(density, 99)
    if vmax <= vmin:  # e.g. one ship in a straight line: every cell the same
        vmax = vmin * 10
    return lon_bins, lat_bins, density, vmin, vmax


def plot_vessel_density(df: pd.DataFrame, polygon, n_days: int) -> str:
    """Returns a vessel traffic density map of a region as a base64 PNG, for
    the Analyse pop-up.

    Same numbers and colours as the map heat map (see _vessel_density), drawn
    on a map zoomed to the region with padding so it fills the frame. Uses
    10m Natural Earth coastlines for detail. Raises ValueError if there is
    too little data.
    """
    import cartopy.crs as ccrs
    import cartopy.feature as cfeature
    from matplotlib.colors import LogNorm

    lon_bins, lat_bins, density, vmin, vmax = _vessel_density(df, polygon, n_days)

    # Pad the extent so the region isn't edge-to-edge
    lon_min, lat_min, lon_max, lat_max = polygon.bounds
    pad_lon = max(0.3, (lon_max - lon_min) * 0.2)
    pad_lat = max(0.3, (lat_max - lat_min) * 0.2)

    proj = ccrs.PlateCarree()
    fig, ax = plt.subplots(figsize=(12, 8), subplot_kw={"projection": proj})
    ax.set_extent([lon_min - pad_lon, lon_max + pad_lon, lat_min - pad_lat, lat_max + pad_lat], crs=proj)

    land = cfeature.NaturalEarthFeature("physical", "land", "10m", facecolor="#b0b0b0")
    coast = cfeature.NaturalEarthFeature("physical", "coastline", "10m",
                                          edgecolor="#444444", facecolor="none")
    ax.add_feature(land, zorder=1)
    ax.add_feature(coast, linewidth=0.7, zorder=2)
    ax.add_feature(cfeature.BORDERS, linewidth=0.4, zorder=2)
    ax.gridlines(draw_labels=True, linewidth=0.4, color="gray", alpha=0.5, zorder=3)

    # imshow rather than pcolormesh: the grid can have millions of cells
    img = ax.imshow(
        density, origin="lower", interpolation="nearest",
        extent=[lon_bins[0], lon_bins[-1], lat_bins[0], lat_bins[-1]],
        cmap="YlOrRd", norm=LogNorm(vmin=vmin, vmax=vmax, clip=True),
        transform=proj, zorder=0,
    )
    fig.colorbar(img, ax=ax, label="Vessel hours per km² per day", shrink=0.75, pad=0.08)
    ax.set_title("Vessel Traffic Density", fontsize=14, pad=10)
    plt.tight_layout()
    return _to_b64(fig, dpi=180)


def render_vessel_density_overlay(df: pd.DataFrame, polygon, n_days: int) -> dict:
    """Returns the vessel traffic density of a region as a see-through PNG to
    lay on the map.

    df, polygon, n_days: as for _vessel_density.

    Cells outside the region or with no traffic are transparent. Returns
    {"image": base64 PNG, "extent": [lon_min, lat_min, lon_max, lat_max] of
    the image, "vmin"/"vmax": ends of the colour scale in vessel-hours per
    km² per day}. Raises ValueError if there is too little data.
    """
    from matplotlib.colors import LogNorm
    from PIL import Image

    lon_bins, lat_bins, density, vmin, vmax = _vessel_density(df, polygon, n_days)
    rgba = matplotlib.colormaps["YlOrRd"](LogNorm(vmin=vmin, vmax=vmax, clip=True)(density), bytes=True)
    rgba[np.isnan(density)] = 0  # transparent
    # Image rows go north to south, the grid rows go south to north
    img = Image.fromarray(np.flipud(rgba))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return {
        "image": base64.b64encode(buf.getvalue()).decode(),
        "extent": [float(lon_bins[0]), float(lat_bins[0]), float(lon_bins[-1]), float(lat_bins[-1])],
        "vmin": float(vmin),
        "vmax": float(vmax),
    }

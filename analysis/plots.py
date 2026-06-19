"""
This script generates plots used by the region analysis API endpoints.

Each function accepts query results as a pandas DataFrame and returns
a base64-encoded PNG string (ready to embed in a JSON response or <img> tag).

Functions:
    plot_vessel_types(daily_counts) — stacked bar chart of daily vessel counts by type
    plot_speed_overall(df)          — line chart of mean daily speed across all vessels
    plot_vessel_density(df)         — hexbin density map of vessel positions
"""


import base64
import io

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd # type: ignore

# Maps vessel type label -> consistent hex color across all charts
TYPE_COLORS = {
    "cargo":                    "#0072BD",
    "tanker":                   "#D95319",
    "fishing":                  "#EDB120",
    "passenger":                "#7E2F8E",
    "search and rescue vessel": "#77AC30",
    "other":                    "#4DBEEE",
    "unknown":                  "#A2142F",
}

# Draw order for stacked bars —> determines legend and layering order
ORDERED_TYPES = ["cargo", "tanker", "fishing", "passenger",
                 "search and rescue vessel", "other", "unknown"]


def _to_b64(fig) -> str:
    """Renders a matplotlib figure to a base64-encoded PNG string and closes it."""
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=120, bbox_inches="tight")
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


def plot_vessel_density(df: pd.DataFrame) -> str:
    """Returns a vessel traffic density map as a base64 PNG.

    df: DataFrame with columns "longitude" and "latitude".
    Density is computed as AIS pings per 0.05° grid cell, plotted over a
    cartopy coastline with land fill.
    """
    import cartopy.crs as ccrs
    import cartopy.feature as cfeature

    LON_MIN, LON_MAX = -69.0, -55.0
    LAT_MIN, LAT_MAX =  41.0,  47.0
    GRID_RES = 0.05  # degrees per cell

    lon_bins = np.arange(LON_MIN, LON_MAX + GRID_RES, GRID_RES)
    lat_bins = np.arange(LAT_MIN, LAT_MAX + GRID_RES, GRID_RES)

    counts, _, _ = np.histogram2d(
        df["longitude"], df["latitude"], bins=[lon_bins, lat_bins]
    )
    counts = counts.T  # shape: (lat, lon)
    counts[counts == 0] = np.nan  # hide empty cells

    proj = ccrs.PlateCarree()
    fig, ax = plt.subplots(figsize=(12, 7), subplot_kw={"projection": proj})
    ax.set_extent([LON_MIN, LON_MAX, LAT_MIN, LAT_MAX], crs=proj)

    ax.add_feature(cfeature.LAND, facecolor="#a8a8a8", zorder=1)
    ax.add_feature(cfeature.COASTLINE, linewidth=0.6, zorder=2)
    ax.add_feature(cfeature.BORDERS, linewidth=0.4, zorder=2)
    ax.gridlines(draw_labels=True, linewidth=0.4, color="gray", alpha=0.5, zorder=3)

    mesh = ax.pcolormesh(
        lon_bins, lat_bins, counts,
        cmap="YlOrRd", transform=proj, zorder=0
    )
    fig.colorbar(mesh, ax=ax, label="AIS pings", shrink=0.7)
    ax.set_title("Vessel Traffic Density")
    plt.tight_layout()
    return _to_b64(fig)

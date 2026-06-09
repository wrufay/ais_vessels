#!/usr/bin/env python3
"""
Sydney Bight WEA vessel traffic analysis — August 2025.

Generates a daily stacked bar chart of vessel types inside the Sydney Bight
wind energy area, matching the format requested by supervisor.

Usage:
    python analysis/sydney_bight.py
    python analysis/sydney_bight.py --out /path/to/output/dir
"""

import argparse
import os
from pathlib import Path

import geopandas as gpd
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import numpy as np
import pandas as pd
import psycopg2
from shapely.geometry import Point

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/ais"
)

SHAPEFILE = "/home/shared/WEA_shapefiles/Designated_WEAs_25_07_29.shp"

# Vessel type categories and their AIS ship type codes
TYPE_CATEGORIES = {
    "cargo":                  range(70, 80),
    "tanker":                 range(80, 90),
    "fishing":                range(30, 31),
    "passenger":              range(60, 70),
    "search and rescue vessel": [51],
    "other":                  list(range(20, 30)) + list(range(31, 51)) +
                              list(range(52, 60)) + list(range(90, 100)),
}

# Match MATLAB-style colors from the example
TYPE_COLORS = {
    "cargo":                    "#0072BD",
    "tanker":                   "#D95319",
    "fishing":                  "#EDB120",
    "passenger":                "#7E2F8E",
    "search and rescue vessel": "#77AC30",
    "other":                    "#4DBEEE",
    "unknown":                  "#A2142F",
}

ORDERED_TYPES = ["cargo", "tanker", "fishing", "passenger",
                 "search and rescue vessel", "other", "unknown"]


def classify_ship_type(code):
    try:
        c = int(code)
    except (TypeError, ValueError):
        return "unknown"
    for label, codes in TYPE_CATEGORIES.items():
        if c in codes:
            return label
    return "unknown"


def load_sydney_bight():
    gdf = gpd.read_file(SHAPEFILE)
    row = gdf[gdf["WEA"] == "Sydney Bight"]
    if row.empty:
        raise ValueError("Sydney Bight not found in shapefile")
    return row.geometry.iloc[0]


def query_positions(polygon):
    minx, miny, maxx, maxy = polygon.bounds
    conn = psycopg2.connect(DATABASE_URL)
    df = pd.read_sql("""
        SELECT
            p.mmsi,
            p.received_at,
            p.latitude,
            p.longitude,
            p.speed,
            v.ship_type
        FROM ais_positions p
        LEFT JOIN vessels v USING (mmsi)
        WHERE p.received_at >= '2025-08-01'
          AND p.received_at <  '2025-09-01'
          AND p.latitude  BETWEEN %(miny)s AND %(maxy)s
          AND p.longitude BETWEEN %(minx)s AND %(maxx)s
    """, conn, params={"miny": miny, "maxy": maxy, "minx": minx, "maxx": maxx})
    conn.close()
    return df


def filter_to_polygon(df, polygon):
    mask = df.apply(
        lambda r: polygon.contains(Point(r.longitude, r.latitude)), axis=1
    )
    return df[mask].copy()


def build_daily_counts(df):
    df["day"] = pd.to_datetime(df["received_at"]).dt.date
    df["type_label"] = df["ship_type"].apply(classify_ship_type)

    # Unique vessels per day per type
    daily = (
        df.groupby(["day", "type_label"])["mmsi"]
        .nunique()
        .unstack(fill_value=0)
        .reindex(columns=ORDERED_TYPES, fill_value=0)
    )
    daily.index = pd.to_datetime(daily.index)
    return daily


def build_daily_speed(df):
    df["day"] = pd.to_datetime(df["received_at"]).dt.date
    df["type_label"] = df["ship_type"].apply(classify_ship_type)

    # Mean speed per day per type
    daily = (
        df.groupby(["day", "type_label"])["speed"]
        .mean()
        .unstack()
        .reindex(columns=ORDERED_TYPES)
    )
    daily.index = pd.to_datetime(daily.index)
    return daily


def plot_stacked(daily, out_dir):
    fig, ax = plt.subplots(figsize=(14, 6))

    x = np.arange(len(daily))
    bottom = np.zeros(len(daily))

    for t in ORDERED_TYPES:
        if t not in daily.columns:
            continue
        vals = daily[t].values
        ax.bar(x, vals, bottom=bottom, label=t,
               color=TYPE_COLORS[t], width=0.8)
        bottom += vals

    # X-axis: date labels like 2025Aug01
    labels = [d.strftime("%Y%b%d") for d in daily.index]
    step = max(1, len(labels) // 15)  # show ~15 labels max
    ax.set_xticks(x[::step])
    ax.set_xticklabels(labels[::step], rotation=45, ha="right", fontsize=8)

    ax.set_ylabel("Total vessel number")
    ax.set_title("Sydney Bight WEA — Vessel Traffic by Type, August 2025")
    ax.legend(loc="upper left", fontsize=9, framealpha=0.9)
    ax.grid(axis="y", alpha=0.3)
    ax.set_xlim(-0.5, len(daily) - 0.5)

    plt.tight_layout()
    out = Path(out_dir) / "sydney_bight_vessel_types.png"
    plt.savefig(out, dpi=150)
    print(f"Saved: {out}")
    plt.close()


def plot_combined(daily_counts, daily_speed, out_dir):
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(14, 10), sharex=True)
    fig.suptitle("Sydney Bight WEA — Vessel Traffic, August 2025", fontsize=13)

    x = np.arange(len(daily_counts))
    labels = [d.strftime("%Y%b%d") for d in daily_counts.index]
    step = max(1, len(labels) // 15)

    # Top: stacked bar
    bottom = np.zeros(len(daily_counts))
    for t in ORDERED_TYPES:
        if t not in daily_counts.columns:
            continue
        vals = daily_counts[t].values
        ax1.bar(x, vals, bottom=bottom, label=t, color=TYPE_COLORS[t], width=0.8)
        bottom += vals
    ax1.set_ylabel("Total vessel number")
    ax1.legend(loc="upper left", fontsize=8, framealpha=0.9)
    ax1.grid(axis="y", alpha=0.3)

    # Bottom: speed lines
    for t in ORDERED_TYPES:
        if t not in daily_speed.columns:
            continue
        vals = daily_speed[t].values
        if np.all(np.isnan(vals)):
            continue
        ax2.plot(x, vals, label=t, color=TYPE_COLORS[t],
                 marker="o", markersize=3, linewidth=1.5)
    ax2.set_ylabel("Mean speed (knots)")
    ax2.legend(loc="upper left", fontsize=8, framealpha=0.9)
    ax2.grid(alpha=0.3)

    ax2.set_xticks(x[::step])
    ax2.set_xticklabels(labels[::step], rotation=45, ha="right", fontsize=8)
    ax2.set_xlim(-0.5, len(daily_counts) - 0.5)

    plt.tight_layout()
    out = Path(out_dir) / "sydney_bight_daily.png"
    plt.savefig(out, dpi=150)
    print(f"Saved: {out}")
    plt.close()


def plot_speed(daily_speed, out_dir):
    fig, ax = plt.subplots(figsize=(14, 6))

    x = np.arange(len(daily_speed))
    labels = [d.strftime("%Y%b%d") for d in daily_speed.index]
    step = max(1, len(labels) // 15)

    for t in ORDERED_TYPES:
        if t not in daily_speed.columns:
            continue
        vals = daily_speed[t].values
        if np.all(np.isnan(vals)):
            continue
        ax.plot(x, vals, label=t, color=TYPE_COLORS[t],
                marker="o", markersize=3, linewidth=1.5)

    ax.set_xticks(x[::step])
    ax.set_xticklabels(labels[::step], rotation=45, ha="right", fontsize=8)
    ax.set_ylabel("Mean speed (knots)")
    ax.set_title("Sydney Bight WEA — Mean Daily Speed by Vessel Type, August 2025")
    ax.legend(loc="upper left", fontsize=9, framealpha=0.9)
    ax.grid(alpha=0.3)
    ax.set_xlim(-0.5, len(daily_speed) - 0.5)

    plt.tight_layout()
    out = Path(out_dir) / "sydney_bight_speed.png"
    plt.savefig(out, dpi=150)
    print(f"Saved: {out}")
    plt.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="analysis", help="Output directory")
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    print("Loading Sydney Bight polygon...")
    polygon = load_sydney_bight()

    print("Querying positions from DB...")
    df = query_positions(polygon)
    print(f"  {len(df):,} positions in bounding box")

    print("Filtering to exact polygon...")
    df = filter_to_polygon(df, polygon)
    print(f"  {len(df):,} positions inside Sydney Bight")

    if df.empty:
        print("No data found inside Sydney Bight for August 2025.")
        return

    print("Building daily stats...")
    daily_counts = build_daily_counts(df)
    daily_speed  = build_daily_speed(df)

    csv_out = out_dir / "sydney_bight_stats.csv"
    daily_counts.to_csv(csv_out)
    print(f"Saved: {csv_out}")

    print("Generating plots...")
    plot_stacked(daily_counts, out_dir)
    plot_speed(daily_speed, out_dir)
    plot_combined(daily_counts, daily_speed, out_dir)
    print("Done.")


if __name__ == "__main__":
    main()

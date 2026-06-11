"""
Shared plotting functions for region analysis.
Returns base64-encoded PNG strings instead of saving files.
"""

import base64
import io

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

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


def _to_b64(fig) -> str:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=120, bbox_inches="tight")
    plt.close(fig)
    return base64.b64encode(buf.getvalue()).decode()


def plot_vessel_types(daily_counts: pd.DataFrame) -> str:
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

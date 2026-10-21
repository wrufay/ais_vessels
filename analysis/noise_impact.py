"""Compute regulatory noise-impact zones via ns_pile_driving_noise_mapping
(wrapped since it returns numpy/xarray/DataFrame, not HTTP-servable).

Site is fixed per SITES entry, no arbitrary-point mode. Requires the real
package (a gitignored clone of Wilfried's repo at <repo>/noise_impact_code,
or wherever NOISE_IMPACT_CODE_DIR points) + CSnap data at /home/shared --
no fallback if either is missing.
"""

import io
import math
import os
import shutil
import sys
import tempfile
import textwrap
import threading
import zipfile
from datetime import date, timedelta
from pathlib import Path

import geopandas as gpd  # type: ignore
import numpy as np  # type: ignore
import openpyxl  # type: ignore
import pandas as pd  # type: ignore
from shapely.geometry import Polygon, mapping  # type: ignore

NOISE_IMPACT_CODE_DIR = os.environ.get(
    "NOISE_IMPACT_CODE_DIR",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "noise_impact_code"),
)
sys.path.insert(0, NOISE_IMPACT_CODE_DIR)

from ns_pile_driving_noise_mapping import (  # noqa: E402 # type: ignore
    ExposureAssessmentParams, TLModelParams, NoiseLevelParams,
    HearingGroup, Impact, Metric,
)
from ns_pile_driving_noise_mapping.core import calculate_noise_impact  # noqa: E402 # type: ignore
from ns_pile_driving_noise_mapping.enums import Reference, SourceType  # noqa: E402 # type: ignore
import ns_pile_driving_noise_mapping.core as _npnm_core  # noqa: E402 # type: ignore


# Cache the multi-second CSnap TL-pickle load, keyed per-site. Monkeypatch
# (not a reimplementation) to stay decoupled from a package under active
# dev elsewhere -- fragile if it changes how it imports this function
# (silently falls back to uncached, not a crash).
_load_tl_model_output_uncached = _npnm_core.load_tl_model_output
_tl_model_cache: dict[tuple, dict] = {}
_tl_model_cache_lock = threading.Lock()


def _cached_load_tl_model_output(tl_model_params):
    key = (
        os.path.normpath(str(tl_model_params.data_folder)),
        tl_model_params.src_depth,
        tl_model_params.src_freq,
        tl_model_params.noise_date,
    )
    with _tl_model_cache_lock:
        cached = _tl_model_cache.get(key)
    if cached is not None:
        return cached
    result = _load_tl_model_output_uncached(tl_model_params)
    with _tl_model_cache_lock:
        _tl_model_cache[key] = result
    return result


_npnm_core.load_tl_model_output = _cached_load_tl_model_output


# Cache PolarFieldInterpolator too -- profiling found this, not the TL
# load, is the real cost (~4s of ~5s). Keyed on (src_lon, src_lat, azimuth).
_PolarFieldInterpolator_uncached = _npnm_core.PolarFieldInterpolator
_interpolator_cache: dict[tuple, object] = {}
_interpolator_cache_lock = threading.Lock()


def _cached_polar_field_interpolator(ds, src_lon, src_lat, *args, **kwargs):
    key = (
        float(src_lon),
        float(src_lat),
        tuple(np.asarray(ds.azimuth.values).tolist()),
        args,
        tuple(sorted(kwargs.items())),
    )
    with _interpolator_cache_lock:
        cached = _interpolator_cache.get(key)
    if cached is not None:
        return cached
    result = _PolarFieldInterpolator_uncached(ds, src_lon, src_lat, *args, **kwargs)
    with _interpolator_cache_lock:
        _interpolator_cache[key] = result
    return result


_npnm_core.PolarFieldInterpolator = _cached_polar_field_interpolator


# Each site is a transmission-loss model already run offline for a fixed
# source location/depth/frequency/date — see module docstring.
SITES = {
    "French Bank": dict(
        data_folder="/home/shared/pileDrivingSoundPropagation/testFrenchBank/output/modelRun/csnapOut/",
        src_freq=100, src_depth=135,
        src_lon=-61.477536, src_lat=44.6143972,
        noise_date=date(2020, 7, 15),
    ),
    "Sydney Bight": dict(
        data_folder="/home/shared/pileDrivingSoundPropagation/sydneyBight/output/modelRun/csnapOut/",
        src_freq=100, src_depth=45,
        src_lon=-59.82201388888889, src_lat=46.522622222222225,
        noise_date=date(2020, 7, 15),
    ),
}

# Custom (user-entered) thresholds -- see _run_custom. Zones from them come
# back with impact CUSTOM_IMPACT and the user's name as hearing group. The
# frontend's NoiseImpactParamsPanel mirrors the limits for its inline
# checks; these are the ones enforced.
CUSTOM_IMPACT = "Custom"
CUSTOM_DB_RANGE = (100.0, 300.0)
CUSTOM_NAME_MAX_LEN = 60

# What a custom row gets in the temporary workbook besides its metric and
# dB. The package only accepts its own enum names for hearing group and
# impact, so these are stand-ins: with IsWeighted = 0 the hearing group
# isn't used (it only picks a weighting curve) and impact is only a label,
# so the zone depends on nothing but the row's metric and dB. Reference
# and SourceType just have to pass build_threshold_filter_mask_str.
_CUSTOM_STANDIN_ROW = {
    "HearingGroup": HearingGroup.LF_CETACEANS.value,
    "Impact": Impact.TTS.value,
    "Reference": Reference.NMFS_2024.value,
    "SourceType": SourceType.IMPULSIVE.value,
    "IsWeighted": 0,
}


# Pile-driving noise mitigation systems and how much each lowers the noise
# (insertion loss, dB), as published ranges for peak SPL and for SEL --
# from DFO's "Insertion Loss Estimation for Pile Driving Noise Mitigation
# Systems" table (citing Nehls et al. 2016, Koschinski & Lüdemann 2013,
# Bellmann et al. 2020, IHC Vremac 2019, BSH 2023, Diederichs et al. 2014,
# Würsig et al. 2000). The user picks a value inside each range in the
# app; it's taken off the source levels before the model runs (see
# _validate_mitigation). current_sensitive: works less well in strong
# currents (bubble curtains), shown as a note in the app.
MITIGATION_SYSTEMS = {
    "single_bubble_curtain": dict(
        label="Single bubble curtain", il_peak_db=(5, 15), il_sel_db=(4, 12),
        current_sensitive=True,
    ),
    "double_bubble_curtain": dict(
        label="Double bubble curtain", il_peak_db=(10, 25), il_sel_db=(8, 20),
        current_sensitive=True,
    ),
    "hsd": dict(
        label="HSD resonator", il_peak_db=(5, 20), il_sel_db=(5, 15),
        current_sensitive=False,
    ),
    "ihc_nms": dict(
        label="IHC NMS shell-in-shell", il_peak_db=(10, 25), il_sel_db=(8, 20),
        current_sensitive=False,
    ),
}


def list_sites() -> dict:
    """Site metadata for the frontend dropdown — everything except the
    on-disk data_folder, which is a backend implementation detail."""
    return {
        name: {
            "src_lon": cfg["src_lon"],
            "src_lat": cfg["src_lat"],
            "src_depth": cfg["src_depth"],
            "src_freq": cfg["src_freq"],
            "noise_date": cfg["noise_date"].isoformat(),
        }
        for name, cfg in SITES.items()
    }


def list_options() -> dict:
    """Available hearing groups / impact types / metrics, straight from the
    package's enums — so the frontend never hardcodes a list that could
    drift from Noise_Impact_Thresholds.xlsx. `thresholds` is every
    hearing group/impact/metric combination that actually has a threshold,
    so the frontend can grey out the ones that don't. `mitigation_systems`
    is MITIGATION_SYSTEMS as a list, for the Source tab's dropdown."""
    return {
        "hearing_groups": [g.value for g in HearingGroup],
        "impact_types": [i.value for i in Impact],
        "metrics": [m.value for m in Metric],
        "thresholds": _list_thresholds(),
        "mitigation_systems": [
            {"key": key, **cfg} for key, cfg in MITIGATION_SYSTEMS.items()
        ],
    }


def _list_thresholds() -> list[dict]:
    """The workbook's Thresholds rows the package can actually run, i.e.
    those passing the same Reference/SourceType/enum checks as its own
    build_threshold_filter_mask_str (filters.py). A row with a value the
    enums don't know (e.g. a typo'd metric) is left out here exactly as the
    package would skip it at run time."""
    file_path = ExposureAssessmentParams._get_default_data_file_path()
    df = pd.read_excel(file_path, sheet_name="Thresholds")
    df = df[
        df["Reference"].isin([r.value for r in Reference])
        & df["SourceType"].isin([s.value for s in SourceType])
        & df["HearingGroup"].isin([g.value for g in HearingGroup])
        & df["Impact"].isin([i.value for i in Impact])
        & df["Metric"].isin([m.value for m in Metric])
    ]
    return [
        {"hearing_group": r.HearingGroup, "impact": r.Impact, "metric": r.Metric,
         "reference": r.Reference}
        for r in df.itertuples()
    ]


def list_parameter_info() -> dict:
    """Hover-tooltip text for hearing groups / impact types, straight from
    the thresholds workbook's own "Info" sheet -- so tooltip wording lives
    with the domain expert's source of truth (Noise_Impact_Thresholds.xlsx)
    instead of being duplicated in this codebase. Located the same way the
    package itself locates the workbook (ExposureAssessmentParams' own
    default file path), so this always matches whatever's at
    NOISE_IMPACT_CODE_DIR.

    Only the HearingGroup and Impact blocks are pulled out, since those are
    the only options this app lets you select.
    """
    blocks = _read_info_blocks("HearingGroup", "Impact")
    return {
        "hearing_groups": blocks["HearingGroup"],
        "impact_types": blocks["Impact"],
    }


def _read_info_blocks(*markers: str) -> dict[str, dict[str, str]]:
    """The named key -> description blocks from the workbook's "Info"
    sheet, which is a stack of labeled blocks (a "<Category>, Description"
    header row, then key -> description rows until a blank row)."""
    file_path = ExposureAssessmentParams._get_default_data_file_path()
    info_sheet = pd.read_excel(file_path, sheet_name="Info", header=None)

    def _block(marker: str) -> dict:
        start = info_sheet.index[info_sheet[0] == marker][0] + 1
        block = {}
        for key, desc in info_sheet.iloc[start:, :2].itertuples(index=False):
            if pd.isna(key):
                break
            block[str(key)] = str(desc)
        return block

    return {marker: _block(marker) for marker in markers}


def compute_impact(
    site: str,
    hearing_groups: list[str],
    impact_types: list[str],
    metrics: list[str],
    depth_range: tuple[float, float],
    spl_peak: float,
    sel_single_strike: float,
    n_strikes_per_pile: int,
    n_piles: int,
    assessment_period_hours: float,
    pairs: list[tuple[str, str]] | None = None,
    custom_thresholds: list[dict] | None = None,
    mitigation: dict | None = None,
) -> dict:
    """Run the impact model for one site and return JSON-serializable zones:

        {"source": {"lon": ..., "lat": ...},
         "mitigation": {"system", "label", "il_peak_db", "il_sel_db"} or None,
         "zones": [{"hearing_group", "impact", "metric", "threshold_db",
                     "area_km2", "geometry", "custom_index", "without"} , ...]}

    `geometry` is a GeoJSON Polygon, or None if the threshold was never
    exceeded anywhere. depth_range is negative metres below the surface,
    e.g. (-40.0, -0.01). TL load is cached per site (see above); the rest
    re-runs fresh every call. `pairs`, if given, limits the zones to those
    (hearing group, impact) pairs -- see _run_model. `custom_thresholds`
    ({"name", "metric", "threshold_db"} each) adds zones for the user's own
    thresholds, after the workbook ones; their `custom_index` numbers the
    distinct custom names in order (for the frontend's colours) and is None
    for workbook zones.

    `mitigation` ({"system", "il_peak_db", "il_sel_db"}, see
    _validate_mitigation) lowers the source levels before the run. The
    model then runs a second time without it, so each zone also carries
    `without`: the same zone's shape (area_km2, radius_km, radius_std_km,
    geometry) with no mitigation. `without` is None when no mitigation was
    picked.
    """
    mit = _validate_mitigation(mitigation)
    run_args = (
        site, hearing_groups, impact_types, metrics, depth_range,
        spl_peak, sel_single_strike, n_strikes_per_pile, n_piles,
        assessment_period_hours, pairs, custom_thresholds, mit,
    )
    result, tl_model_params, _ = _run_model(*run_args)
    without_zones = [None] * len(result["zone_data"])
    if mit:
        without, _, _ = _run_model(*run_args[:-1], None)
        same_rows = len(without["df_th"]) == len(result["df_th"]) and all(
            (a.HearingGroup, a.Impact, a.Metric) == (b.HearingGroup, b.Impact, b.Metric)
            for a, b in zip(without["df_th"].itertuples(), result["df_th"].itertuples())
        )
        if not same_rows:
            raise RuntimeError(
                "The runs with and without mitigation came back with different "
                "thresholds, so they can't be compared. Nothing was shown.")
        without_zones = [_zone_shape(zone) for zone in without["zone_data"]]

    custom_names: list[str] = []
    zones = []
    for zone, th_row, without_zone in zip(
        result["zone_data"], result["df_th"].itertuples(), without_zones
    ):
        custom_index = None
        if str(th_row.Impact) == CUSTOM_IMPACT:
            name = str(th_row.HearingGroup)
            if name not in custom_names:
                custom_names.append(name)
            custom_index = custom_names.index(name)
        zones.append({
            "hearing_group": str(th_row.HearingGroup),
            "impact": str(th_row.Impact),
            "metric": str(th_row.Metric),
            "threshold_db": float(th_row.Threshold_dB),
            **_zone_shape(zone),
            "custom_index": custom_index,
            "without": without_zone,
        })

    return {
        "source": {"lon": tl_model_params.src_lon, "lat": tl_model_params.src_lat},
        "mitigation": mit,
        "zones": zones,
    }


def _zone_shape(zone) -> dict:
    """A zone's size and outline for the API: area, mean±std radius and a
    GeoJSON Polygon (None if the threshold was never exceeded)."""
    geometry = None
    if _zone_exceeded(zone):
        coords = list(zip(zone["Longitude"].tolist(), zone["Latitude"].tolist()))
        geometry = mapping(Polygon(coords))
    return {
        "area_km2": float(zone["Area"]) / 1e6,
        # Mean±std of raw Distance, not area-derived (matches the
        # package's own create_map() legend, mapping.py:560-561).
        "radius_km": float(zone["Distance"].mean()) / 1000,
        "radius_std_km": float(zone["Distance"].std()) / 1000,
        "geometry": geometry,
    }


def _validate_mitigation(mitigation: dict | None) -> dict | None:
    """Checked copy of the picked mitigation, with its label added, or None
    for no mitigation. Each reduction must lie inside the system's
    published range in MITIGATION_SYSTEMS."""
    if not mitigation:
        return None
    system = mitigation["system"]
    if system not in MITIGATION_SYSTEMS:
        raise ValueError(f"Unknown noise mitigation system: {system}")
    cfg = MITIGATION_SYSTEMS[system]
    cleaned = {"system": system, "label": cfg["label"]}
    for key, what in (("il_peak_db", "peak"), ("il_sel_db", "SEL")):
        value = float(mitigation[key])
        lo, hi = cfg[key]
        if not lo <= value <= hi:
            raise ValueError(
                f"{cfg['label']}: the {what} reduction must be between {lo:g} and {hi:g} dB.")
        cleaned[key] = value
    return cleaned


# Download formats export_impact supports: key -> (README name, file
# extension). export_hazard_zones picks the format from the extension.
EXPORT_FORMATS = {
    "shp": ("Shapefile", ".shp"),
    "gpkg": ("GeoPackage", ".gpkg"),
}


def export_impact(
    site: str,
    hearing_groups: list[str],
    impact_types: list[str],
    metrics: list[str],
    depth_range: tuple[float, float],
    spl_peak: float,
    sel_single_strike: float,
    n_strikes_per_pile: int,
    n_piles: int,
    assessment_period_hours: float,
    fmt: str,
    pairs: list[tuple[str, str]] | None = None,
    custom_thresholds: list[dict] | None = None,
    mitigation: dict | None = None,
) -> tuple[str, bytes]:
    """Same run as compute_impact, saved with the package's own
    export_hazard_zones in one of EXPORT_FORMATS, returned as (zip
    filename, zip bytes). Either format is zipped with a README describing
    the scenario and the column names (none of which is stored in the
    file itself) -- and a Shapefile is several files (.shp/.shx/.dbf/.prj/
    .cpg) anyway.

    Only exceeded zones are exported: the package writes not-exceeded ones
    as zero-area polygons (every vertex at the source), which GIS tools
    flag as invalid -- and the app shows no shape for them either. The
    README lists them instead.

    With mitigation, only the zones with mitigation are exported (not the
    "without" ones the app also shows); the README names the system and
    its reductions.
    """
    if fmt not in EXPORT_FORMATS:
        raise ValueError(f"Unknown export format: {fmt}")
    format_name, ext = EXPORT_FORMATS[fmt]
    mit = _validate_mitigation(mitigation)

    result, _, noise_level_params = _run_model(
        site, hearing_groups, impact_types, metrics, depth_range, spl_peak,
        sel_single_strike, n_strikes_per_pile, n_piles, assessment_period_hours,
        pairs, custom_thresholds, mit,
    )

    keep = [i for i, zone in enumerate(result["zone_data"]) if _zone_exceeded(zone)]
    if not keep:
        raise ValueError("No threshold was exceeded, so there are no zones to export.")
    zone_data = [result["zone_data"][i] for i in keep]
    # reset_index: the package pairs zones with threshold rows by DataFrame
    # index (pd.concat in create_geodataframe), not by position.
    df_th = result["df_th"].iloc[keep].reset_index(drop=True)
    df_th_not_exceeded = result["df_th"].drop(index=result["df_th"].index[keep])

    name = f"noise-impact_{site.replace(' ', '-')}_{date.today().isoformat()}"
    with tempfile.TemporaryDirectory() as tmp:
        out_path = os.path.join(tmp, f"{name}{ext}")
        _npnm_core.export_hazard_zones(zone_data, df_th, out_path)
        # Column names as actually written (the package shortens them to
        # 10 characters for Shapefiles only), so the README can't drift
        # from the file if the package renames them.
        columns = [c for c in gpd.read_file(out_path, rows=0).columns if c != "geometry"]
        readme = _export_readme(
            format_name, site, depth_range, noise_level_params, zone_data, df_th,
            df_th_not_exceeded, columns, mit,
        )
        with open(os.path.join(tmp, f"{name}_README.txt"), "w", encoding="utf-8") as f:
            f.write(readme)
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for fname in sorted(os.listdir(tmp)):
                zf.write(os.path.join(tmp, fname), arcname=fname)
    # format in the zip name, so downloading both formats doesn't collide
    return f"{name}_{fmt}.zip", buf.getvalue()


def _run_model(
    site, hearing_groups, impact_types, metrics, depth_range, spl_peak,
    sel_single_strike, n_strikes_per_pile, n_piles, assessment_period_hours,
    pairs=None, custom_thresholds=None, mitigation=None,
):
    """Build the package's params from plain values and run
    calculate_noise_impact -- shared by compute_impact and
    export_impact so both always run the identical model.

    The package runs every hearing group x impact type combination. With
    `pairs` (the frontend's threshold grid picks), zones for combinations
    outside it are dropped afterwards -- e.g. picking LF Cetaceans TTS and
    Fish Mortality must not also return Fish TTS. An empty `pairs` (nothing
    picked in the grid) skips the workbook run, for custom thresholds only.

    Custom thresholds run separately (_run_custom) and their zones and
    threshold rows are appended after the workbook ones -- returned as one
    {"zone_data", "df_th"} result either way.

    `mitigation` (already checked by _validate_mitigation, or None) lowers
    SPL_peak and SEL_single_strike by its reductions. SEL_cum is worked out
    from SEL_single_strike, so it drops by the same amount. The returned
    noise_level_params hold the lowered values."""
    if site not in SITES:
        raise ValueError(f"Unknown site: {site}")
    custom = _validate_custom(custom_thresholds or [])

    tl_model_params = TLModelParams(model_name=site, **SITES[site])
    if mitigation:
        spl_peak -= mitigation["il_peak_db"]
        sel_single_strike -= mitigation["il_sel_db"]
    noise_level_params = NoiseLevelParams(
        SPL_peak=spl_peak,
        SEL_single_strike=sel_single_strike,
        n_strikes_per_pile=n_strikes_per_pile,
        n_piles=n_piles,
        assessment_period=timedelta(hours=assessment_period_hours),
    )

    parts = []
    if hearing_groups and impact_types and metrics and pairs != []:
        exposure_params = ExposureAssessmentParams(
            hearing_groups=hearing_groups,
            impact_types=impact_types,
            metrics=metrics,
            depth_range=depth_range,
        )
        result = calculate_noise_impact(exposure_params, tl_model_params, noise_level_params)
        if pairs is not None:
            wanted = {tuple(p) for p in pairs}
            keep = [
                i for i, th in enumerate(result["df_th"].itertuples())
                if (str(th.HearingGroup), str(th.Impact)) in wanted
            ]
            result = {
                **result,
                "zone_data": [result["zone_data"][i] for i in keep],
                "df_th": result["df_th"].iloc[keep].reset_index(drop=True),
            }
        parts.append(result)
    if custom:
        parts.append(_run_custom(custom, tl_model_params, noise_level_params, depth_range))
    if not parts:
        raise ValueError("Pick at least one threshold or add a custom threshold.")

    result = {
        "zone_data": [zone for part in parts for zone in part["zone_data"]],
        "df_th": pd.concat([part["df_th"] for part in parts], ignore_index=True),
    }
    return result, tl_model_params, noise_level_params


def _validate_custom(custom_thresholds: list[dict]) -> list[dict]:
    """Checked, cleaned copies of the custom thresholds (name stripped, dB
    as float). Names are unique per metric, like a hearing group in the
    workbook, so (name, Custom, metric) identifies one zone."""
    metrics = [m.value for m in Metric]
    lo, hi = CUSTOM_DB_RANGE
    seen = set()
    cleaned = []
    for ct in custom_thresholds:
        name = str(ct["name"]).strip()
        metric = ct["metric"]
        db = float(ct["threshold_db"])
        if not name:
            raise ValueError("A custom threshold needs a name.")
        if len(name) > CUSTOM_NAME_MAX_LEN:
            raise ValueError(
                f"Custom threshold name is longer than {CUSTOM_NAME_MAX_LEN} characters: {name}")
        if metric not in metrics:
            raise ValueError(f"Unknown metric for custom threshold {name}: {metric}")
        if not lo <= db <= hi:
            raise ValueError(
                f"Custom threshold {name}: enter a value between {lo:g} and {hi:g} dB.")
        if (name, metric) in seen:
            raise ValueError(f"{name} has more than one {metric} custom threshold.")
        seen.add((name, metric))
        cleaned.append({"name": name, "metric": metric, "threshold_db": db})
    return cleaned


def _run_custom(custom, tl_model_params, noise_level_params, depth_range) -> dict:
    """Run the model for custom thresholds only, as {"zone_data", "df_th"}
    with the user's names in df_th's HearingGroup column and CUSTOM_IMPACT
    as Impact.

    The package reads thresholds only from a workbook (ExposureAssessmentParams
    file_path), so this writes a temporary copy of the bundled one whose
    Thresholds sheet holds just the custom rows (_CUSTOM_STANDIN_ROW plus
    each one's metric and dB; IsWeighted 0, so compared with unweighted
    noise) and points file_path at it. The copy keeps every other sheet --
    the package reads the weighting parameters from it too. A run of its
    own, not rows added to the workbook run, so the stand-in hearing group
    and the custom metrics can't pull extra workbook zones in.

    The package keeps the sheet's row order, so zone i is custom threshold
    i; checked before renaming, so a change in the package fails loudly
    instead of putting a name on the wrong zone."""
    with tempfile.TemporaryDirectory() as tmp:
        file_path = Path(tmp) / "custom_thresholds.xlsx"
        shutil.copy(ExposureAssessmentParams._get_default_data_file_path(), file_path)
        workbook = openpyxl.load_workbook(file_path)
        sheet = workbook["Thresholds"]
        header = [cell.value for cell in sheet[1]]
        sheet.delete_rows(2, sheet.max_row)
        for ct in custom:
            row = {**_CUSTOM_STANDIN_ROW, "Metric": ct["metric"], "Threshold_dB": ct["threshold_db"]}
            sheet.append([row.get(column) for column in header])
        workbook.save(file_path)

        exposure_params = ExposureAssessmentParams(
            hearing_groups=[_CUSTOM_STANDIN_ROW["HearingGroup"]],
            impact_types=[_CUSTOM_STANDIN_ROW["Impact"]],
            metrics=list(dict.fromkeys(ct["metric"] for ct in custom)),
            depth_range=depth_range,
            file_path=file_path,
        )
        result = calculate_noise_impact(exposure_params, tl_model_params, noise_level_params)

    df_th = result["df_th"]
    returned = [(str(th.Metric), float(th.Threshold_dB)) for th in df_th.itertuples()]
    matches = len(returned) == len(custom) == len(result["zone_data"]) and all(
        metric == ct["metric"] and math.isclose(db, ct["threshold_db"])
        for (metric, db), ct in zip(returned, custom)
    )
    if not matches:
        raise RuntimeError(
            "Custom thresholds came back from the noise model in an unexpected "
            "form, so their zones can't be labelled safely. Nothing was shown.")

    df_th = df_th.copy()
    df_th["HearingGroup"] = [ct["name"] for ct in custom]
    df_th["Impact"] = CUSTOM_IMPACT
    return {"zone_data": result["zone_data"], "df_th": df_th}


def _zone_exceeded(zone) -> bool:
    """A zone whose threshold was never exceeded comes back with every
    boundary distance at 0 (i.e. collapsed onto the source)."""
    return float(zone["Distance"].max()) > 0


# What each exported column means, keyed by the names export_hazard_zones
# writes: full names in a GeoPackage, its shortened SHAPEFILE_FIELDNAMES in
# a Shapefile (10-character limit). Any column not listed here still shows
# up in the README, just without a description.
_AREA = "Zone area (m²)"
_RMIN = "Shortest distance from the pile to the zone edge (m)"
_RMAX = "Longest distance from the pile to the zone edge (m)"
_RMEAN = "Mean distance from the pile to the zone edge (m)"
_RSD = "Standard deviation of that distance across directions (m)"
_HGROUP = "Hearing group (see HEARING GROUPS)"
_TH = "Threshold the noise reaches or exceeds inside the zone (dB)"
_EXPHRS = ("Exposure period the threshold is defined for, in hours, from the "
           "thresholds table (empty if the threshold has none)")
_EXPORT_COLUMN_DESCRIPTIONS = {
    "Area_m2": _AREA,
    "MinRadius_m": _RMIN, "RMin_m": _RMIN,
    "MaxRadius_m": _RMAX, "RMax_m": _RMAX,
    "MeanRadius_m": _RMEAN, "RMean_m": _RMEAN,
    "RadiusSD_m": _RSD, "RSD_m": _RSD,
    "HearingGroup": _HGROUP, "HGroup": _HGROUP,
    "Threshold_dB": _TH, "Th_dB": _TH,
    "Impact": "Impact type (see IMPACT TYPES)",
    "Metric": "Noise metric the threshold applies to (see METRICS)",
    "HoursOfExposure": _EXPHRS, "ExpHrs": _EXPHRS,
    "IsWeighted": "Whether noise levels are weighted by the hearing group's "
                  "hearing sensitivity (see WEIGHTING)",
}


def _export_readme(
    format_name, site, depth_range, noise_level_params, zone_data, df_th,
    df_th_not_exceeded, columns, mitigation=None,
) -> str:
    """Plain-text README for the download zip: the scenario that produced
    the zones (none of which is stored in the file itself), the zones in
    the file and the thresholds that weren't exceeded, and what the column
    names and their values mean. Hearing group / impact / metric /
    weighting wording comes from the thresholds workbook's Info sheet, same
    as the app's tooltips."""
    cfg = SITES[site]
    info = _read_info_blocks("HearingGroup", "Impact", "Metric", "IsWeighted")
    # Custom thresholds aren't in the workbook's Info sheet.
    info["Impact"][CUSTOM_IMPACT] = (
        "User-defined threshold entered in the app, not from the thresholds "
        "workbook. Compared with noise without any hearing adjustment "
        "(weighting).")
    for th in df_th.itertuples():
        if str(th.Impact) == CUSTOM_IMPACT:
            info["HearingGroup"].setdefault(
                str(th.HearingGroup), "Name given to a user-defined threshold (impact type Custom)")
    lat, lon = cfg["src_lat"], cfg["src_lon"]
    shallow, deep = sorted(abs(d) for d in depth_range)

    def label(th) -> str:
        return (f"{th.HearingGroup} – {th.Impact} – {th.Metric} "
                f"(threshold {float(th.Threshold_dB):g} dB)")

    def section(title: str, rows: list[tuple[str, str]]) -> list[str]:
        width = max(len(k) for k, _ in rows) + 2
        out = [title]
        for key, value in rows:
            wrapped = textwrap.wrap(value, 78 - 2 - width) or [""]
            out.append(f"  {key.ljust(width)}{wrapped[0]}")
            out.extend(f"  {' ' * width}{line}" for line in wrapped[1:])
        return out + [""]

    def values_used(column: str, block: str) -> list[tuple[str, str]]:
        keys = dict.fromkeys(
            str(int(v)) if column == "IsWeighted" else str(v) for v in df_th[column]
        )
        return [(k, info[block].get(k, "")) for k in keys]

    lines = [
        f"NOISE IMPACT ZONES – {site.upper()}",
        "",
        *textwrap.wrap(
            f"Each shape in this {format_name} is the area around the pile where "
            "pile-driving noise reaches or exceeds the threshold for one "
            "hearing group, impact type and noise metric.", 78),
        "",
    ]
    # noise_level_params already hold the levels after mitigation.
    peak_note = sel_note = ""
    if mitigation:
        peak_note = (f" (after mitigation; "
                     f"{noise_level_params.SPL_peak + mitigation['il_peak_db']:g} without)")
        sel_note = (f" (after mitigation; "
                    f"{noise_level_params.SEL_single_strike + mitigation['il_sel_db']:g} without)")
    lines += section("SCENARIO", [
        ("Pile location", f"{abs(lat):.4f}° {'N' if lat >= 0 else 'S'}, "
                          f"{abs(lon):.4f}° {'E' if lon >= 0 else 'W'}"),
        ("Source depth", f"{cfg['src_depth']:g} m"),
        ("Sound frequency", f"{cfg['src_freq']:g} Hz"),
        ("Ocean conditions date", cfg["noise_date"].isoformat()),
        ("Water depths assessed", f"{shallow:g} to {deep:g} m below the surface"),
        ("Noise mitigation",
         f"{mitigation['label']}, lowering SPL peak by {mitigation['il_peak_db']:g} dB "
         f"and SEL by {mitigation['il_sel_db']:g} dB" if mitigation else "None"),
        ("SPL peak", f"{noise_level_params.SPL_peak:g} dB re 1 µPa{peak_note}"),
        ("SEL, single strike",
         f"{noise_level_params.SEL_single_strike:g} dB re 1 µPa²·s{sel_note}"),
        ("Strikes per pile", f"{noise_level_params.n_strikes_per_pile:g}"),
        ("Number of piles", f"{noise_level_params.n_piles:g}"),
        ("SEL, all strikes", f"{noise_level_params.SEL_cum:.1f} dB re 1 µPa²·s"),
    ])
    lines.append(f"ZONES IN THIS FILE ({len(zone_data)})")
    for zone, th in zip(zone_data, df_th.itertuples()):
        dist_km = zone["Distance"] / 1000
        lines.append(f"  {label(th)}")
        lines.append(f"      {float(zone['Area']) / 1e6:.2f} km², zone edge "
                     f"{dist_km.min():.2f}–{dist_km.max():.2f} km from the pile")
    lines.append("")
    if len(df_th_not_exceeded):
        lines.append("THRESHOLDS NOT EXCEEDED (no zone, so not in this file)")
        lines += [f"  {label(th)}" for th in df_th_not_exceeded.itertuples()]
        lines.append("")
    lines += section("COLUMNS", [(c, _EXPORT_COLUMN_DESCRIPTIONS.get(c, "")) for c in columns])
    lines += section("HEARING GROUPS", values_used("HearingGroup", "HearingGroup"))
    lines += section("IMPACT TYPES", values_used("Impact", "Impact"))
    lines += section("METRICS", values_used("Metric", "Metric"))
    lines += section("WEIGHTING", values_used("IsWeighted", "IsWeighted"))
    return "\n".join(lines).rstrip() + "\n"

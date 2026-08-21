"""Compute regulatory noise-impact zones via ns_pile_driving_noise_mapping
(wrapped since it returns numpy/xarray/DataFrame, not HTTP-servable).

Site is fixed per SITES entry, no arbitrary-point mode. Real CSnap data
(/home/shared) isn't present on e.g. a laptop, so this falls back to a
vendored package + synthetic fixtures (mock_api/); using_fixture_data
says which is active.
"""

import os
import sys
import threading
from datetime import date, timedelta

import numpy as np  # type: ignore
from shapely.geometry import Polygon, mapping  # type: ignore

_REAL_CODE_DIR = "/home/shared/noise_impact_code"
_VENDORED_CODE_DIR = os.path.join(os.path.dirname(__file__), "..", "mock_api", "vendor")

NOISE_IMPACT_CODE_DIR = os.environ.get("NOISE_IMPACT_CODE_DIR")
if not NOISE_IMPACT_CODE_DIR:
    NOISE_IMPACT_CODE_DIR = _REAL_CODE_DIR if os.path.isdir(_REAL_CODE_DIR) else _VENDORED_CODE_DIR
sys.path.insert(0, NOISE_IMPACT_CODE_DIR)

from ns_pile_driving_noise_mapping import (  # noqa: E402 # type: ignore
    ExposureAssessmentParams, TLModelParams, NoiseLevelParams,
    HearingGroup, Impact, Metric,
)
from ns_pile_driving_noise_mapping.core import calculate_noise_impact  # noqa: E402 # type: ignore
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


_FIXTURES_ROOT = os.path.join(os.path.dirname(__file__), "..", "mock_api", "noise_impact_fixtures")


def _data_folder(real_path: str, fixture_subdir: str) -> str:
    """Real CSnap data if this machine has it mounted, else the small
    synthetic fixture for the same site — see module docstring."""
    return real_path if os.path.isdir(real_path) else os.path.join(_FIXTURES_ROOT, fixture_subdir)


# Each site is a transmission-loss model already run offline for a fixed
# source location/depth/frequency/date — see module docstring.
SITES = {
    "French Bank": dict(
        data_folder=_data_folder(
            "/home/shared/pileDrivingSoundPropagation/testFrenchBank/output/modelRun/csnapOut/",
            "french_bank",
        ),
        src_freq=100, src_depth=135,
        src_lon=-61.477536, src_lat=44.6143972,
        noise_date=date(2020, 7, 15),
    ),
    "Sydney Bight": dict(
        data_folder=_data_folder(
            "/home/shared/pileDrivingSoundPropagation/sydneyBight/output/modelRun/csnapOut/",
            "sydney_bight",
        ),
        src_freq=100, src_depth=45,
        src_lon=-59.82201388888889, src_lat=46.522622222222225,
        noise_date=date(2020, 7, 15),
    ),
}


def _is_fixture(site: str) -> bool:
    return os.path.normpath(SITES[site]["data_folder"]).startswith(os.path.normpath(_FIXTURES_ROOT))


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
            "using_fixture_data": _is_fixture(name),
        }
        for name, cfg in SITES.items()
    }


def list_options() -> dict:
    """Available hearing groups / impact types / metrics, straight from the
    package's enums — so the frontend never hardcodes a list that could
    drift from Noise_Impact_Thresholds.xlsx."""
    return {
        "hearing_groups": [g.value for g in HearingGroup],
        "impact_types": [i.value for i in Impact],
        "metrics": [m.value for m in Metric],
    }


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
) -> dict:
    """Run the impact model for one site and return JSON-serializable zones:

        {"source": {"lon": ..., "lat": ...},
         "zones": [{"hearing_group", "impact", "metric", "threshold_db",
                     "area_km2", "geometry"} , ...]}

    `geometry` is a GeoJSON Polygon, or None if the threshold was never
    exceeded anywhere. depth_range is negative metres below the surface,
    e.g. (-40.0, -0.01). TL load is cached per site (see above); the rest
    re-runs fresh every call.
    """
    if site not in SITES:
        raise ValueError(f"Unknown site: {site}")

    tl_model_params = TLModelParams(model_name=site, **SITES[site])
    exposure_params = ExposureAssessmentParams(
        hearing_groups=hearing_groups,
        impact_types=impact_types,
        metrics=metrics,
        depth_range=depth_range,
    )
    noise_level_params = NoiseLevelParams(
        SPL_peak=spl_peak,
        SEL_single_strike=sel_single_strike,
        n_strikes_per_pile=n_strikes_per_pile,
        n_piles=n_piles,
        assessment_period=timedelta(hours=assessment_period_hours),
    )

    result = calculate_noise_impact(exposure_params, tl_model_params, noise_level_params)

    zones = []
    for zone, th_row in zip(result["zone_data"], result["df_th"].itertuples()):
        geometry = None
        if float(zone["Distance"].max()) > 0:
            coords = list(zip(zone["Longitude"].tolist(), zone["Latitude"].tolist()))
            geometry = mapping(Polygon(coords))
        zones.append({
            "hearing_group": str(th_row.HearingGroup),
            "impact": str(th_row.Impact),
            "metric": str(th_row.Metric),
            "threshold_db": float(th_row.Threshold_dB),
            "area_km2": float(zone["Area"]) / 1e6,
            # Mean±std of raw Distance, not area-derived (matches the
            # package's own create_map() legend, mapping.py:560-561).
            "radius_km": float(zone["Distance"].mean()) / 1000,
            "radius_std_km": float(zone["Distance"].std()) / 1000,
            "geometry": geometry,
        })

    return {
        "source": {"lon": tl_model_params.src_lon, "lat": tl_model_params.src_lat},
        "using_fixture_data": _is_fixture(site),
        "zones": zones,
    }

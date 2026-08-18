"""Generate small synthetic CSnap transmission-loss pickle files for local
dev/UI work when the real ~950MB precomputed dataset (/home/shared/
pileDrivingSoundPropagation, see analysis/noise_impact.py's SITES dict)
isn't available -- e.g. running the app on a laptop with no access to that
shared machine.

This is NOT real acoustic model output -- it's a simple cylindrical-
spreading-plus-absorption formula (TL = -(20*log10(r) + absorption*r), with
mild per-azimuth/per-depth variation so the resulting impact zones aren't
perfect circles) with the exact same file format and naming convention
real CSnap files use, just enough to make calculate_noise_impact() run
end-to-end and produce plausible-looking zones for UI development. Do not
use these numbers for anything resembling a real assessment.

Run:  venv/bin/python mock_api/seed_noise_impact_fixtures.py
Re-running overwrites the fixture directories from scratch.
"""

import pickle
from datetime import date
from pathlib import Path

import numpy as np

FIXTURES_ROOT = Path(__file__).parent / "noise_impact_fixtures"

# Mirrors analysis/noise_impact.py's SITES dict (src_depth/src_freq/date are
# what the CSnap filename convention encodes) -- keep in sync if that
# changes.
SITES = {
    "french_bank": dict(src_depth=135, src_freq=100, noise_date=date(2020, 7, 15)),
    "sydney_bight": dict(src_depth=45, src_freq=100, noise_date=date(2020, 7, 15)),
}

AZIMUTHS = np.arange(0, 361, 10)  # 0..360 inclusive, matching real data's closed-ring convention
N_DISTANCE = 60
MAX_DISTANCE_M = 50_000.0
N_DEPTH = 8
MAX_DEPTH_M = 200.0


def _synthetic_tl(distance_m: np.ndarray, depth_m: np.ndarray, azimuth_deg: float, seed: int) -> np.ndarray:
    """(n_depth, n_distance) array of negative-dB TL values -- see module
    docstring for the (non-scientific) formula."""
    rng = np.random.default_rng(seed)
    r = np.clip(distance_m, 1.0, None)
    spreading = 20 * np.log10(r)
    absorption = 0.0006 * r
    # Mild direction-dependent variation so the zone isn't a perfect circle.
    az_wobble = 3.0 * np.sin(np.radians(azimuth_deg) * 3) + rng.normal(0, 0.5)
    base_tl = -(spreading + absorption) + az_wobble
    # Mild depth dependence (slightly less loss at the source's own depth band).
    depth_factor = 1.0 + 0.05 * np.cos(np.linspace(0, np.pi, len(depth_m)))
    return (base_tl[None, :] * depth_factor[:, None]).astype("float32")


def generate_site(name: str, src_depth: int, src_freq: int, noise_date: date) -> None:
    out_dir = FIXTURES_ROOT / name
    out_dir.mkdir(parents=True, exist_ok=True)
    for f in out_dir.glob("*.pik"):
        f.unlink()

    distance = np.linspace(0, MAX_DISTANCE_M, N_DISTANCE, dtype="float32")
    depth = np.linspace(0, MAX_DEPTH_M, N_DEPTH, dtype="float32")
    date_str = noise_date.strftime("%Y%m%d")

    for az in AZIMUTHS:
        tl = _synthetic_tl(distance, depth, float(az), seed=hash((name, int(az))) % (2**32))
        title = f"Synthetic fixture ({name}, az={az})"
        payload = (title, MAX_DEPTH_M, float(src_depth), float(src_freq), tl, distance, N_DEPTH)
        filename = f"csnapOut_{src_depth:04d}m_{src_freq:04d}Hz_{az:03d}_{date_str}.pik"
        with open(out_dir / filename, "wb") as fh:
            pickle.dump(payload, fh)

    print(f"{name}: wrote {len(AZIMUTHS)} files to {out_dir}")


if __name__ == "__main__":
    for site_name, cfg in SITES.items():
        generate_site(site_name, **cfg)

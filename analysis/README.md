# Analysis

Shared logic imported by both `main.py` and `mock_api/main.py`, so behavior
is identical regardless of which backend is running.

## Files

- **`noise.py`** — loads noise GeoTIFFs, renders map overlays, resolves
  requested (variable, frequency, depth) to whatever's actually been
  converted (`resolve_depth`).
- **`plots.py`** — region-stats plotting (vessel types, speed, density) for
  the region analysis panel.
- **`noise_impact.py`** — wraps the `ns_pile_driving_noise_mapping` package
  to compute pile-driving noise-impact zones per site/hearing-group/
  impact-type/metric. Auto-falls-back to a vendored copy of the package
  plus small synthetic fixture data when the real package and its ~950MB
  CSnap dataset (normally at `/home/shared`) aren't present on this
  machine — see `mock_api/README.md` for the fixture setup and the
  `using_fixture_data` flag this exposes to the frontend.

## To review

- *(nothing flagged right now)*

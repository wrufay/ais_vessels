# Analysis

Shared logic imported by both `main.py` and `mock_api/main.py`, so behavior
is identical regardless of which backend is running.

## Files

- **`noise.py`** — loads noise GeoTIFFs, renders map overlays, resolves
  requested (variable, frequency, depth) to whatever's actually been
  converted (`resolve_depth`).
- **`plots.py`** — region-stats plotting (vessel types, speed, density) for
  the region analysis panel.

## To review

- *(nothing flagged right now)*

# How to ingest data for wind noise and vessel noise (alone)

## 1. Run the pipeline

`pipeline/run_combined_noise_all_combos.sh` is the exact playbook to copy
— it already loops over all 19 depths x 5 freqs, is resumable (skips any
combo whose output already exists), and stops on the first real failure
instead of silently doing nothing for the rest. Copy it to something like
`run_vessel_noise_all_combos.sh` and swap `--variable combined_noise` →
`--variable vessel_noise`. Run it the same way `pipeline-noise-conversion-job`
memory describes: in a `tmux` session (SSH connections drop, this takes
hours), e.g.

```bash
tmux new -s vessel-noise-convert
cd /home/fwu/Desktop/projects/vessel-tracks   # or wherever this repo ends up living
pipeline/run_vessel_noise_all_combos.sh
# detach: Ctrl+b, then d
# reattach later: tmux attach -t vessel-noise-convert
```

**Time cost** One combo (~450 days of source data) takes roughly 2
hours. 95 combos x ~2h ≈ 190 hours (~8 days) run serially. 

**`wind_noise` is structurally different** — its source NetCDF has no
depth dimension at all (`wind_noise(x,y,f,t)`, see `noise_to_geotiff.py`'s
docstring), so there's only 5 freq combos to convert, and
`--depth` is ignored for it.

## 2. Check whether ingestion is actually complete

Confirm against what the app itself would see:

```bash
curl http://localhost:8000/api/noise/available
```

For `vessel_noise` to be considered "fully in," you want the same 19
depths x 5 freqs `combined_noise` currently shows. For `wind_noise`,
5 freq entries (depth doesn't apply).

## 3. Code changes to re-add a variable once its data is actually complete

Once (and only once) a variable has full coverage, make these changes:

- **`analysis/noise.py`** — add the variable back to `NOISE_VARIABLES`.

- **`frontend/src/components/LayersPanel.tsx`** — add the `<option>` back
  to the variable `<select>` (around where `combined_noise`'s option is).


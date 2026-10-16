#!/bin/bash
# Runs noise_to_geotiff.py once per frequency for wind_noise, monthly mode,
# covering all 5 frequencies. wind_noise has no depth dimension, so unlike
# run_combined_noise_all_combos.sh there is no depth loop: --depth is ignored
# and output folders are always named wind_noise_f<freq>_d10 (the --depth
# default). Relies on noise_to_geotiff.py's built-in resumability (skips
# months whose output already exists) so this loop is itself safe to
# interrupt/resume.
#
# wind_noise_f50_d10 was a trial made 2026-07-28, before the 145 dB glitch
# mask and the 0 dB averaging fix. Neither changes wind output (wind_noise
# tops out ~68 dB and is never 0), so this loop can safely skip it.
#
# Run from the repo root:  nohup pipeline/run_wind_noise_all_combos.sh > pipeline/wind_noise_run.log 2>&1 &

set -u
cd "$(dirname "$0")/.."

FREQS=(50 100 200 500 1000)

total=${#FREQS[@]}
i=0
start=$(date +%s)

for f in "${FREQS[@]}"; do
  i=$((i + 1))
  echo "=== combo $i/$total: wind_noise, freq=${f}Hz ==="
  venv/bin/python3 pipeline/noise_to_geotiff.py \
    --variable wind_noise --freq "$f" --monthly
  # Stop on the first real failure instead of silently running through the
  # rest (see run_combined_noise_all_combos.sh, 2026-07-21).
  status=$?
  if [ "$status" -ne 0 ]; then
    echo "=== combo $i/$total FAILED (exit $status) -- stopping so this doesn't run through the rest of the combos doing nothing. Fix the issue and rerun this script; already-converted combos are skipped automatically. ==="
    exit "$status"
  fi
  elapsed=$(( $(date +%s) - start ))
  echo "=== combo $i/$total done. elapsed so far: ${elapsed}s (~$((elapsed / 3600))h) ==="
done

echo "All $total combos complete."

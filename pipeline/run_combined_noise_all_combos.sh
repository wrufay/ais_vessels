#!/bin/bash
# Runs the original noise_to_geotiff.py once per (freq, depth) combo for
# combined_noise, monthly mode, covering all 19 depths x 5 frequencies (95
# combos total). Does NOT modify noise_to_geotiff.py -- just invokes it
# repeatedly, relying on its own built-in resumability (skips months whose
# output already exists) so this loop is itself safe to interrupt/resume.
#
# Run from the repo root:  nohup pipeline/run_combined_noise_all_combos.sh > pipeline/combined_noise_run.log 2>&1 &

set -u
cd "$(dirname "$0")/.."

FREQS=(50 100 200 500 1000)
DEPTHS=(10 20 30 40 50 60 70 80 90 100 110 120 130 140 150 175 200 300 500)

total=$(( ${#FREQS[@]} * ${#DEPTHS[@]} ))
i=0
start=$(date +%s)

for f in "${FREQS[@]}"; do
  for d in "${DEPTHS[@]}"; do
    i=$((i + 1))
    echo "=== combo $i/$total: combined_noise, freq=${f}Hz, depth=${d}m ==="
    venv/bin/python3 pipeline/noise_to_geotiff.py \
      --variable combined_noise --freq "$f" --depth "$d" --monthly
    # Bash doesn't stop a `for` loop just because a command inside it
    # failed -- without this explicit check it would silently plow through
    # every remaining combo doing nothing (this is exactly what happened
    # 2026-07-21 when /mnt/shared_remote dropped mid-run: combos 38-95 all
    # "ran" and the script printed "All 95 combos complete" despite none of
    # them actually converting anything).
    status=$?
    if [ "$status" -ne 0 ]; then
      echo "=== combo $i/$total FAILED (exit $status) -- stopping so this doesn't run through the rest of the combos doing nothing. Fix the issue and rerun this script; already-converted combos are skipped automatically. ==="
      exit "$status"
    fi
    elapsed=$(( $(date +%s) - start ))
    echo "=== combo $i/$total done. elapsed so far: ${elapsed}s (~$((elapsed / 3600))h) ==="
  done
done

echo "All $total combos complete."

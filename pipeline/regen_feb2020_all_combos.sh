#!/bin/bash
# Regenerates the 2020-02 monthly GeoTIFF for every (variable, freq, depth)
# combo that currently has one, now that noise_to_geotiff.py masks
# implausibly loud glitched readings (see MAX_PLAUSIBLE_DB) before
# averaging. 20200223.nc timestep 70 pinned a huge chunk of the grid to a
# depth-invariant 154-178 dB reading, which the old linear-space monthly
# average let dominate the whole month at every pixel it touched.
#
# Discovers combos by scanning existing noise_data/*_f*_d*/2020-02.tif
# directories rather than hardcoding the freq/depth lists, so it covers
# vessel_noise and wind_noise combos too, not just combined_noise.
#
# Before overwriting each combo's 2020-02.tif, backs up the pre-fix version
# to noise_data_feb2020_pre_fix/<combo>/2020-02.tif so the contaminated and
# fixed outputs can be compared side by side.
#
# Run from the repo root:  nohup pipeline/regen_feb2020_all_combos.sh > pipeline/regen_feb2020_run.log 2>&1 &

set -u
cd "$(dirname "$0")/.."

BACKUP_DIR="pipeline/noise_data_feb2020_pre_fix"

mapfile -t COMBOS < <(
  for d in pipeline/noise_data/*_f*_d*; do
    [ -f "$d/2020-02.tif" ] || continue
    basename "$d"
  done | sort
)

total=${#COMBOS[@]}
i=0
start=$(date +%s)

for combo in "${COMBOS[@]}"; do
  i=$((i + 1))
  # combo looks like "combined_noise_f1000_d10" -- split off the trailing
  # _f<freq>_d<depth> to recover variable, freq, depth.
  if [[ "$combo" =~ ^(.+)_f([0-9]+)_d([0-9]+)$ ]]; then
    variable="${BASH_REMATCH[1]}"
    freq="${BASH_REMATCH[2]}"
    depth="${BASH_REMATCH[3]}"
  else
    echo "=== skipping unrecognized combo dir name: $combo ==="
    continue
  fi

  echo "=== combo $i/$total: $variable, freq=${freq}Hz, depth=${depth}m ==="

  mkdir -p "$BACKUP_DIR/$combo"
  cp "pipeline/noise_data/$combo/2020-02.tif" "$BACKUP_DIR/$combo/2020-02.tif"

  venv/bin/python3 pipeline/noise_to_geotiff.py \
    --variable "$variable" --freq "$freq" --depth "$depth" \
    --monthly --start 2020-02-01 --end 2020-02-29 --overwrite
  status=$?
  if [ "$status" -ne 0 ]; then
    echo "=== combo $i/$total FAILED (exit $status) -- stopping so this doesn't run through the rest of the combos doing nothing. Fix the issue and rerun this script; already-converted combos will just be redone (cheap relative to the whole run). ==="
    exit "$status"
  fi
  elapsed=$(( $(date +%s) - start ))
  echo "=== combo $i/$total done. elapsed so far: ${elapsed}s (~$((elapsed / 3600))h) ==="
done

echo "All $total combos re-averaged for 2020-02."

# Fail-fast on combo failure

**File changed:** `pipeline/run_combined_noise_all_combos.sh`

**Problem:** the shared_remote sshfs mount dropped mid-run. Each subsequent
combo's `noise_to_geotiff.py` call crashed immediately (mount gone), but the
wrapper script didn't check the exit code — it just kept looping through
all remaining combos, doing nothing, until it printed "All 95 combos
complete." That message was a false all-clear; most of those combos never
actually converted anything.

**Fix:** after each `noise_to_geotiff.py` call, check `$?`. If it's
non-zero, print `combo X/95 FAILED (exit N)` and `exit` immediately instead
of continuing the loop.

**What happens now when a combo fails:** the whole script stops right away
at the first failure, instead of silently running to a fake "complete."
Fix whatever broke (e.g. remount `/mnt/shared_remote`), then just rerun the
same script — it's still resumable, so already-converted combos are
skipped and it picks back up from the failure point.

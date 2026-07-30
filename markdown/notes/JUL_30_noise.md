# Feb 2020 noise map looks broken — why

**Data issue**: `/mnt/shared_remote/202002/20200223.nc`, timestep 70 (one
10-min window that day), reports a huge chunk of the map (east of ~61.4°W,
all depths) at the exact same noise value regardless of depth. Real sound
fades with depth — identical values at every depth means it's a glitched
reading, not a real loud event.

**Code issue**: `pipeline/noise_to_geotiff.py`'s monthly averaging
converts dB to linear scale before averaging (so real loud events aren't
washed out) but has no upper-bound check — it only drops `0 dB` (land).
Converting dB to linear is exponential, so this one glitched reading
(154+ dB) becomes ~100x louder than normal in the math, letting 1 bad
reading out of 4,176 dominate the whole month's average for every
location it touched.

**Result**: each day's file looks fine; the monthly file doesn't, because
that's where the one bad reading gets blown up instead of averaged out.

**Fix**: add a sanity cap (drop implausibly high readings, like `0 dB` is
already dropped) before the linear averaging step, then regenerate Feb
2020.

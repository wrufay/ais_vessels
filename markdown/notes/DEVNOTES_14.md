# July 14th, 2026

## Feature: user-selectable noise depth

Added the ability to pick which depth level the noise overlay shows, instead of it being fixed to whatever was converted.

**How it works:**
- The source NetCDFs have 19 depth levels (10–500m), but only a subset get converted to GeoTIFF on any given machine (each (variable, frequency, depth) combo is a real multi-hour batch job — see `pipeline/noise_to_geotiff.py`).
- `analysis/noise.py` now has `resolve_depth(variable, freq, depth)`, which snaps a requested depth to the nearest one that's actually been converted (scans `NOISE_DATA_DIR` folder names). `_load_grid`, `noise_range`, and `render_noise_overlay` all return the resolved depth alongside their normal results.
- `main.py` and `mock_api/main.py` — `/api/noise/range` now includes `"depth"` (the resolved value) in its JSON response. `/api/noise/overlay` is unchanged externally (still a plain PNG), since the resolved depth is deterministic from the same inputs and doesn't need to travel with the image.
- `Map.tsx` — the depth control is now an always-visible free-form number input (10–500m) instead of a dropdown that only showed up when 2+ depths were already converted. Shows "Nearest available: Xm" underneath when the resolved depth differs from what was typed.

Code side is done and correct regardless of how much data ends up converted — verified via the real backend (`localhost:8002`, run locally against the real Postgres/noise data, not the deployed Docker container) and the mock API.

## Open question — blocked on supervisor input

Currently only one depth (10m) has actually been converted to GeoTIFF for `vessel_noise`/`combined_noise`/`wind_noise` at 50Hz, so right now every request snaps back to 10m regardless of what's typed — the snapping logic works, there's just nothing else to snap *to* yet.

Was about to kick off converting a small spread of additional depths (e.g. 50m/100m/200m, ~2h each) so different inputs would show genuinely different data. Paused before running it — supervisor apparently wants the depth **not to be an approximation**: "user needs to pick the depth," not have it silently snapped to a nearby converted one. That's a real tension with the sparse-spread-plus-nearest-neighbor approach we'd been planning, since with the practical difficulty of converting all 19 depths (~38h just for `vessel_noise` at one frequency), some form of approximation is likely a given.

**Need to clarify with supervisor before converting anything further:**
- Does he want all 19 depth levels genuinely available (accepting the ~38h/variable cost), or is a sparser set with clear "nearest available" labeling acceptable?
- If sparse is fine, which depths matter most for the analysis he has in mind?

Nothing is blocked on this for the code itself — only on deciding how much additional data to convert.

---

## Reference: everything about the GeoTIFF/NetCDF pipeline

Background notes so the architecture conversation tomorrow doesn't require re-deriving all of this. Every claim below has a file:line pointer — check it if in doubt.

### The data chain, end to end

```
NetCDF (raw, remote, huge)  →  GeoTIFF (converted, local, small)  →  PNG (rendered per-request)
   /mnt/shared_remote          pipeline/noise_data/                  served by the API
   read by the pipeline        read by analysis/noise.py             sent to the browser
   script only                 for both real + mock APIs
```

Nothing is colored until the very last step. Both the NetCDF and the GeoTIFF are pure numeric data — see the "how coloring actually works" thread from earlier today (also worth a read if this comes up tomorrow: `analysis/noise.py:9-22` explains the colour-scale side of things).

### 1. NetCDF — the source data

Lives on a remote mount (`/mnt/shared_remote`, sshfs to `xuj@142.2.84.76:/nfs/vs425-8/ssmodel/mapping_on_node`). One `.nc` file = one calendar day.

Dimensions, straight from the docstring (`pipeline/noise_to_geotiff.py:20-25`):

| dim | size | meaning |
|---|---|---|
| `x` | 701 | longitude, -69.5° → -59.0° |
| `y` | 417 | latitude, 41.0° → 46.0° |
| `f` | **5** | frequency bands: 50, 100, 200, 500, 1000 Hz |
| `d` | **19** | depth levels: 10, 20, 30, ..., 150, 175, 200, 300, 500 m |
| `t` | 144 | time steps, 10-min intervals through the day |

Variables (`pipeline/noise_to_geotiff.py:27-35`): `vessel_noise(x,y,f,d,t)`, `combined_noise(x,y,f,d,t)` — both have the full depth dimension — and `wind_noise(x,y,f,t)`, which has **no depth dimension at all** (wind noise doesn't vary by depth the same way).

Scale of the source data, confirmed by directly checking the mount today:
- **443 `.nc` files** total (Feb 2020 – Apr 2021, 17 months) — `ls /mnt/shared_remote/*/`
- Each file is **~73.8 GB** on disk — `ls -la /mnt/shared_remote/202002/20200201.nc`
- **~32 TB total** for the whole mount — `du -sh /mnt/shared_remote` (reported 28T)

This is why nobody's converted "everything" already — the source itself is enormous, and per-file reads are slow even though NetCDF supports partial/chunked reads (see next section).

### 2. The conversion script — `pipeline/noise_to_geotiff.py`

This is the *only* thing that touches the raw NetCDF. Two entry points:

- **`convert_one()`** (`pipeline/noise_to_geotiff.py:152`) — one day → one daily GeoTIFF. Opens the NetCDF, slices out the requested `(variable, freq, depth)` from the 144 time steps, masks land cells (0.0 dB, `:213-215`), **averages in linear pressure space, not dB directly** (`:217-221` — `linear = 10 ** (dB/20)`, mean, then back to dB; averaging dB directly would underweight loud events), writes a single-band float32 GeoTIFF.
- **`convert_monthly()`** (`pipeline/noise_to_geotiff.py:251`) — same idea but accumulates a running sum/count across every day in the month before converting back to dB once, to avoid holding the whole month in memory at once.
- **`main()`** (`pipeline/noise_to_geotiff.py:330`) — CLI. One run = one `(variable, freq, depth)` combination, for a date range. `--monthly` flag switches daily→monthly output.

**Performance, straight from the script's own docstring** (`pipeline/noise_to_geotiff.py:71-75`):
> "Each source file requires reading ~337 MB of double-precision data over the sshfs network mount (~17 s/file on this machine). Converting all ~450 days takes roughly 2 hours."

So: **~17s per single daily file**, **~2h to cover the full date range for one combo** (450 × 17s ≈ 2.1h, checks out). A single **monthly** file (~28-31 days averaged) is ~28-31 × 17s ≈ **8-9 minutes** — cheaper than the full 2h range, but still not instant.

**The core structural issue** (why this is "more complex than it seems"): every combo is converted independently — `convert_one`/`convert_monthly` open and read the NetCDF from scratch every single time they're called, even for a day that's already been read for a *different* depth or frequency. There's no sharing of work across combos in the current script. This is the main lever for the optimization idea discussed today — read each day's file once, pull out every needed (freq, depth) slice in that one pass, instead of re-opening the same file per combo.

**Currently converted** (checked via `find pipeline/noise_data -name "*.tif"` and `ls pipeline/noise_data/*/`):
- Only **one** combo per variable: 50 Hz, 10m depth.
- `vessel_noise_f50_d10/`: 18 files (3 daily test files `2020-02-0{1,2,3}.tif` + 15 monthly `2020-02.tif` ... `2021-04.tif`)
- `combined_noise_f50_d10/` and `wind_noise_f50_d10/`: 15 files each (monthly only)
- **48 GeoTIFFs total, 37MB combined** on disk (`du -sh pipeline/noise_data/`) — tiny, because each is a single compressed 2D band, versus the source's full 5D cube.
- Estimated data actually pulled from the remote to produce these: ~48 × 337MB ≈ **16GB** transferred so far, out of the ~32TB available.

### 3. The full-coverage cost (why this matters for tomorrow)

Converting **every** combination — all 19 depths × all 5 frequencies, per variable, at the current unoptimized/serial rate:

| scope | combos | time (serial, ~2h/combo) |
|---|---|---|
| one variable, full grid (e.g. `vessel_noise` alone) | 19 × 5 = 95 | ~8.4 days |
| `vessel_noise` + `combined_noise` (both have depth) | 190 | ~17 days (~2.5 weeks) |
| + `wind_noise` (no depth dim, just 5 freq combos) | +5 | +~10.6 hours |
| **all three variables, everything** | 195 | **~17.5 days** |

Math: 195 combos × ~2.125h/combo (450 days × 17s) ≈ 414 hours ≈ 17.3 days. This is *why* "a few days" (an earlier draft estimate) was inaccurate — it's closer to 2-2.5 weeks unoptimized, for full coverage across all variables.

Supervisor said it's fine to take the time needed for this — but optimizing the script first (shared reads across combos + parallelizing across days/months) is still worth doing regardless of the time budget, since there's no real downside and it could turn "weeks" into "a few days."

### 4. The serving layer — `analysis/noise.py`

This is what actually turns an already-converted GeoTIFF into what the browser sees. Shared by both `main.py` (real backend) and `mock_api/main.py` (mock) — one function change here covers both automatically.

- **`NOISE_DEPTHS`** (`analysis/noise.py:88`) — the 19 known depth levels, for reference/UI bounds. Not the same as what's actually converted.
- **`_available_depths(variable, freq)`** (`analysis/noise.py:91`) — scans `NOISE_DATA_DIR` folder names (e.g. `vessel_noise_f50_d10`) to find what's *actually* been converted for a given (variable, freq).
- **`resolve_depth(variable, freq, depth)`** (`analysis/noise.py:104`) — snaps a requested depth to the nearest one in `_available_depths()`. This is a **separate** nearest-match step from `_nearest_index()` in the pipeline script (`pipeline/noise_to_geotiff.py:103`) — that one picks which of the 19 NetCDF levels to *extract during conversion*; this one picks which *already-converted* depth to *serve* at request time. Easy to conflate, genuinely two different problems.
- **`_load_grid()`** (`analysis/noise.py:116`) — reads the actual GeoTIFF pixel data, using the resolved (not requested) depth for the file path.
- **`noise_range()`** (`analysis/noise.py:133`) and **`render_noise_overlay()`** (`analysis/noise.py:155`) — both call `_load_grid` and return the resolved depth alongside their normal output, so callers can be honest about what was actually shown.

### 5. The APIs — `main.py` / `mock_api/main.py`

Both expose identical endpoints (`get_noise_range` around `main.py:300` / `mock_api/main.py:265`, `get_noise_overlay` around `main.py:321` / `mock_api/main.py:284`). `/api/noise/range` returns `{vmin, vmax, depth}` — that `depth` field is the resolved one. `/api/noise/overlay` returns a raw PNG (no metadata attached — the resolved depth is deterministic from the same inputs, so the frontend gets it from the `/range` call it already makes alongside every overlay fetch).

### 6. The frontend — `Map.tsx`

- `noiseDepth` state (`frontend/src/Map.tsx:220`) — what the user typed, may not equal what's shown.
- The depth `<input>` itself (~`frontend/src/Map.tsx:1752` area) — free-form number, 10-500m, always visible (used to be a `<select>` gated behind having 2+ converted depths — removed that gate since it made the control disappear entirely given only 1 depth exists right now).
- "Nearest available: Xm" note — only shows when `noiseRange.depth !== noiseDepth`, i.e. when the server had to snap to something other than what was typed.
- Separate, pre-existing logic (`frontend/src/Map.tsx:709-716`) auto-corrects `noiseFreq`/`noiseDepth` to a valid option whenever the **variable** changes (e.g. switching to `wind_noise`, which has no depth) — unrelated to the snapping feature, just makes sure the UI doesn't get stuck on a nonsensical combination when switching variables.

### 7. Open architecture question (tomorrow's discussion)

Supervisor floated: could the conversion itself be triggered *from the app*, rather than run manually via the CLI script? Real option, but not free:

- A single new (freq, depth) combo takes ~2h (or ~8-9 min for just one month) — **way too long for a normal request/response**. Would need to run as a background job with some kind of status/progress the UI can poll, not something that blocks a click.
- Changes the shape of the whole solution: a batch script run once by us vs. real background-job infrastructure (queue, worker, progress tracking, probably access control since it's an expensive operation).

Questions to walk in with:
1. **Batch upfront vs. on-demand-in-app** — pick a fixed scope now and convert it as a script, or build the "convert this" trigger as a real feature?
2. **Scope if batch** — genuinely all 195 combos, or a defensible subset? (Table above has the real costs.)
3. **If on-demand-in-app** — who's allowed to trigger it, and how do they know when it's done?

Nothing here blocks current functionality — the depth-selection code already works correctly today regardless of how this gets resolved; it's purely a question of how much data ends up available to select from, and how that data gets produced going forward.

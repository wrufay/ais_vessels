# July 3, 2026

### vessel-tracks dev updates

**noise-layer branch — unit conversion fix + full backfill**

---

## 1. Unit conversion fix (`pipeline/noise_to_geotiff.py`)

The original pipeline averaged the 144 daily time steps directly in dB space — physically incorrect. SPL is defined as:

```
SPL_dB = 20 * log10(SPL_linear / 1 µPa)
```

So averaging in dB is averaging the log of pressure, not pressure itself. Loud events get underweighted. The correct approach is:

1. Convert dB → linear pressure (µPa): `SPL_linear = 10^(SPL_dB / 20)`
2. Average in linear space
3. Convert back: `SPL_dB = 20 * log10(mean_linear)`

**Changes made to `convert_one`:**

- Land/no-data cells (stored as exactly `0.0 dB`) are now masked to `NaN` **before** converting to linear. (Previously masked after averaging. Masking after is wrong because `10^(0/20) = 1.0 µPa` — a land cell looks like a valid quiet ocean cell in linear space.)
- Array is cast to `float64` before conversion to avoid precision loss.
- `np.errstate(invalid="ignore", divide="ignore")` wraps the nanmean and log10 calls to suppress the expected "mean of empty slice" RuntimeWarning for all-NaN land columns.

**Before (wrong):**
```python
day_mean = np.nanmean(arr, axis=2)  # averaging dB values directly
grid[grid <= 0] = np.nan            # masking after the fact
```

**After (correct):**
```python
arr[arr <= 0] = np.nan                          # mask land before converting
linear = 10.0 ** (arr / 20.0)                  # dB → µPa
with np.errstate(invalid="ignore", divide="ignore"):
    day_mean_linear = np.nanmean(linear, axis=2)
    day_mean = 20.0 * np.log10(day_mean_linear) # back to dB
```

---

## 2. Monthly mean support (`pipeline/noise_to_geotiff.py`)

Added `convert_monthly()` function and `--monthly` CLI flag.

**How it works:**
- Groups all daily files by `YYYY-MM`
- For each month, reads each daily NetCDF one at a time and accumulates a running sum + valid count in linear pressure space — never loads more than one day into memory at once (avoids ~9 GB peak memory for a 28-day month)
- Divides sum by count at the end, converts back to dB
- Writes one GeoTIFF per month: `<variable>_f<freq>_d<depth>/YYYY-MM.tif`

**Usage:**
```bash
python pipeline/noise_to_geotiff.py --monthly --variable vessel_noise
python pipeline/noise_to_geotiff.py --monthly --variable combined_noise
python pipeline/noise_to_geotiff.py --monthly --variable wind_noise
```

Also added `--overwrite` support and per-month timing output (with `flush=True` so progress prints immediately instead of buffering).

---

## 3. `wind_noise` depth dimension fix

`wind_noise` has shape `(701, 417, 5, 144)` — no depth dimension — while `vessel_noise` and `combined_noise` are `(701, 417, 5, 19, 144)`. The original script would crash on `wind_noise` because it always indexed `[:, :, fi, di, :]`.

Fix: check `ds[variable].ndim == 5` to detect whether depth exists, and slice accordingly:

```python
has_depth = ds[variable].ndim == 5
if has_depth:
    arr = np.array(ds[variable][:, :, fi, di, :], dtype=np.float64)
else:
    arr = np.array(ds[variable][:, :, fi, :], dtype=np.float64)
```

Applied in both `convert_one` and `convert_monthly`.

---

## 4. Full backfill

Kicked off three parallel tmux jobs to ingest all ~450 days for all three variables:

```bash
# run each in a separate tmux pane (Ctrl+B then % to split)
python pipeline/noise_to_geotiff.py --monthly --variable vessel_noise 2>&1 | tee pipeline/vessel_noise.log
python pipeline/noise_to_geotiff.py --monthly --variable combined_noise 2>&1 | tee pipeline/combined_noise.log
python pipeline/noise_to_geotiff.py --monthly --variable wind_noise 2>&1 | tee pipeline/wind_noise.log
```

Output goes to `pipeline/noise_data/<variable>_f50_d10/YYYY-MM.tif`. Progress visible via:

```bash
tail pipeline/vessel_noise.log
ls pipeline/noise_data/vessel_noise_f50_d10/ | wc -l
```

---

## 5. Visual comparison: dB averaging vs linear averaging

To verify the unit conversion actually changes the output, we temporarily swapped in an old-style (dB-averaged) TIF for `2020-02-01` and compared it on the map.

**Generate old-style TIF and swap in:**
```bash
# (done via inline Python script — generates 2020-02-01_dbtmp.tif,
#  backs up current file as 2020-02-01_new_backup.tif,
#  overwrites 2020-02-01.tif with the dB-averaged version)
```

**Swap back to correct (linear-averaged) version:**
```bash
cp pipeline/noise_data/vessel_noise_f50_d10/2020-02-01_new_backup.tif \
   pipeline/noise_data/vessel_noise_f50_d10/2020-02-01.tif
```

Note: the backend reads the TIF file directly from disk — no rebuild needed when swapping files. The git commit is irrelevant; only the file on disk matters.

---

## 6. Frontend improvements

- **Basemap switcher** (Customize panel): ESRI World Street Map, World Imagery, Ocean/Bathymetry, Topo, Light Gray, Dark Gray, National Geographic. Default: World Imagery. Switching updates the OL tile source in real time, no rebuild.
- **Layer opacity sliders** (Layers panel): bathymetry and noise layers each get an opacity slider that appears when the layer is enabled.
- **Dot customization** (Customize panel): mooring dots, vessel tracks, and region vessels each have a collapsible `▶` section with size + opacity controls. The header shows a live preview dot reflecting current settings. Values are editable as a number input or via slider.
- **Point count per vessel**: vessel list now shows "X pts in range" for every vessel in the selected timeframe (backend query updated to return `COUNT(*)` per vessel). When a vessel is selected and its track is subsampled, the text changes to "showing X / Y pts".

---

## 7. Product idea — dataset upload & comparison tool

**Context:** supervisor has been assigning manual dataset comparison work (coverage, completeness, MMSI overlap between AIS sources). Idea: turn the app into a lightweight tool that makes this reproducible without code.

**Core concept:**
- Users upload AIS data files (CSV, Exact Earth, etc.) via a drag/drop interface
- Backend parses and ingests into TimescaleDB
- All existing map and analysis features work on the uploaded data
- Multiple datasets can coexist — users can switch between them or compare side by side

**Feature set (rough):**
- Upload endpoint (`UploadFile` in FastAPI, background ingestion job)
- Dataset list: name, source, row count, date range, upload date
- Live ingestion progress: "ingesting... 142,000 / 800,000 rows"
- Delete dataset
- Switch active dataset on the map

**Deployment context:**
- No cloud needed — runs entirely on the DFO machine in Docker
- Internal tool, accessible over VPN/local network
- Light auth (e.g. just a name/username, no passwords) could be added to namespace uploads per person if multiple team members use it simultaneously, but not strictly necessary for a shared workspace model

**Why this is useful:**
- Reproduces comparisons that are currently done manually in Python/Jupyter
- Comparison metrics: temporal coverage, spatial coverage, MMSI overlap, position density, gap analysis per vessel
- Anyone on the team can run a comparison without writing code

**Status:** idea only — needs discussion with supervisor to confirm scope and end goal before building.

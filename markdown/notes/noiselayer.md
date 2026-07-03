# Noise Layer — Tweaking Guide

This guide covers the two files you'll touch most often when adjusting how the noise overlay looks or what data it shows.

---

## Pipeline overview (quick recap)

```
/mnt/shared_remote/YYYYMM/YYYYMMDD.nc   ← raw NetCDF on sshfs
        ↓  pipeline/noise_to_geotiff.py
pipeline/noise_data/<variable>_f<freq>_d<depth>/YYYY-MM-DD.tif   ← local GeoTIFF
        ↓  analysis/noise.py  (backend)
GET /api/noise/overlay?date=...   ← colormapped RGBA PNG served to the map
```

Changes to the **conversion script** require re-running it and optionally `--overwrite`.
Changes to **noise.py** only require rebuilding the Docker backend (`docker compose up -d --build backend`).

---

## 1. Changing what data is converted

### Variable

Edit the `--variable` flag when running the pipeline script. Three options:

| Flag value | What it is |
|---|---|
| `vessel_noise` | Modelled noise from ships only (default) |
| `combined_noise` | Vessel noise + wind noise combined |
| `wind_noise` | Ambient wind-driven noise only |

```bash
python pipeline/noise_to_geotiff.py --variable combined_noise
```

The output lands in `pipeline/noise_data/combined_noise_f50_d10/`.

### Frequency band

Five discrete options in the source data: **50, 100, 200, 500, 1000 Hz**. The script picks the nearest available band, so any value rounds to the closest one.

```bash
python pipeline/noise_to_geotiff.py --freq 100
```

Lower frequencies (50–100 Hz) are dominated by shipping noise. Higher frequencies (500–1000 Hz) pick up more wind and biological sources.

### Depth

Nineteen discrete levels: **10, 20, 30, 40, 50, 75, 100, 125, 150, 175, 200, 300, 500 m**. Again, nearest-neighbour selection.

```bash
python pipeline/noise_to_geotiff.py --depth 50
```

Shallow (10 m) shows the noise field near the surface. Deeper levels show propagation into the water column.

### Date range

```bash
# Full backfill (~450 days, ~2 hours over sshfs — run in tmux)
python pipeline/noise_to_geotiff.py

# One specific month
python pipeline/noise_to_geotiff.py --start 2020-03-01 --end 2020-03-31

# Force re-convert already-existing files
python pipeline/noise_to_geotiff.py --start 2020-02-01 --end 2020-02-03 --overwrite
```

---

## 2. Changing smoothing

Gaussian smoothing is applied in `analysis/noise.py` at render time. The relevant line:

```python
smoothed = gaussian_filter(filled, sigma=1.5)
```

`sigma` controls the blur radius in grid cells (~0.015° lon × 0.012° lat per cell).

| sigma | Effect |
|---|---|
| `0` | No smoothing — raw model output, blocky at zoom |
| `1.0` | Light smoothing |
| `1.5` | Current default — gentle gradients |
| `3.0` | Heavy smoothing — loses fine structure |
| `5.0+` | Very blurred, large-scale patterns only |

After changing sigma, rebuild the backend:
```bash
docker compose up -d --build backend
```

No re-conversion needed — smoothing is applied at render time, not baked into the GeoTIFFs.

---

## 3. Changing the colormap

In `analysis/noise.py`:

```python
rgba = matplotlib.colormaps["RdYlBu_r"](norm(np.nan_to_num(smoothed)), bytes=True)
```

Replace `"RdYlBu_r"` with any [matplotlib colormap name](https://matplotlib.org/stable/gallery/color/colormap_reference.html). Good options for SPL / acoustic data:

| Name | Description |
|---|---|
| `RdYlBu_r` | Current — blue=quiet, red=loud. Standard for SPL maps |
| `viridis` | Perceptually uniform, colourblind-safe |
| `plasma` | Vivid, perceptually uniform |
| `hot` | Black→red→yellow→white — thermal feel |
| `coolwarm` | Blue→white→red, diverging around a midpoint |
| `turbo` | Rainbow but perceptually ordered |

The `_r` suffix reverses any colormap (e.g. `viridis_r` = high values are dark).

Rebuild backend after changing.

---

## 4. Changing the colour range (normalization)

Currently the colour scale is stretched to the **2nd–98th percentile** of ocean cells each day:

```python
vmin, vmax = np.percentile(finite, [2, 98]) if finite.size else (0.0, 1.0)
norm = mcolors.Normalize(vmin=vmin, vmax=vmax, clip=True)
```

This auto-scales per day, so the full colour range is always used regardless of absolute dB values.

### Option A — Fixed absolute range

Pin the colormap to specific dB values so that different days/variables are directly comparable:

```python
vmin, vmax = 80.0, 130.0   # dB re 1 µPa — typical vessel noise range
norm = mcolors.Normalize(vmin=vmin, vmax=vmax, clip=True)
```

Values outside the range are clipped to the endpoint colours.

### Option B — Tighter percentile clip (more contrast)

```python
vmin, vmax = np.percentile(finite, [5, 95])   # ignore more outliers
```

### Option C — Midpoint-anchored diverging scale

Useful if you want to highlight areas above/below a reference noise level (e.g. 100 dB):

```python
midpoint = 100.0
half = max(abs(finite.max() - midpoint), abs(midpoint - finite.min()))
norm = mcolors.Normalize(vmin=midpoint - half, vmax=midpoint + half, clip=True)
```

Pair with `coolwarm` or `RdBu_r` for a diverging look.

---

## 5. Changing opacity

In `frontend/src/Map.tsx`, the noise layer is added at 50% opacity:

```typescript
const noiseLayer = new ImageLayer({
  ...
  opacity: 0.5,
  ...
});
```

Change `0.5` to any value between `0.0` (invisible) and `1.0` (fully opaque). This is a frontend-only change — no backend rebuild needed, but Vite will hot-reload automatically.

---

## 6. Changing the date shown

Also in `Map.tsx`, the date is hardcoded:

```typescript
url: `${API}/api/noise/overlay?date=2020-02-01`,
```

Change `2020-02-01` to any date that has been converted (i.e. a `.tif` file exists in `pipeline/noise_data/vessel_noise_f50_d10/`). A date picker wired to this URL is the logical next step.

---

## 7. Wiring a different variable/freq/depth to the frontend

The backend endpoint accepts all three as query params:

```
GET /api/noise/overlay?date=2020-02-01&variable=combined_noise&freq=100&depth=50
```

So in `Map.tsx` you can just extend the URL string. The corresponding GeoTIFF must already exist in `pipeline/noise_data/combined_noise_f100_d50/`.

---

## Cheat sheet

| What to change | Where | Rebuild? |
|---|---|---|
| Variable / frequency / depth | `noise_to_geotiff.py` CLI flags | Re-run script + rebuild backend |
| Smoothing sigma | `analysis/noise.py` line 48 | Rebuild backend only |
| Colormap | `analysis/noise.py` line 55 | Rebuild backend only |
| Colour range (vmin/vmax) | `analysis/noise.py` lines 52–53 | Rebuild backend only |
| Opacity | `Map.tsx` `opacity:` field | No — hot reload |
| Date shown | `Map.tsx` URL string | No — hot reload |

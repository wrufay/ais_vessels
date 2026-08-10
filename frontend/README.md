# Frontend

React + TypeScript + Vite, Tailwind CSS v3, OpenLayers for the map. See
[DEVELOPMENT.md](../DEVELOPMENT.md) for state-ownership and dark-mode
conventions.

## Structure

- **`src/Map.tsx`** — the main stateful component. Owns most app state
  (panels, filters, basemap, theme).
- **`src/components/*.tsx`** — mostly controlled children, receiving state
  and handlers as props from `Map.tsx` rather than managing their own (e.g.
  `IconBar.tsx` receives `isDark`/`toggleTheme`, doesn't call `useTheme()`
  itself).
- **`src/utils/mapStyles.ts`** — turns app state into what's actually drawn
  on the map: OpenLayers style objects, WebGL style expressions, and small
  helpers like `classifyType()`/`formatTime()`.
- **`src/data/`** — static data the app ships with, not fetched from the
  backend:
  - **`colors.json`** — every colour used anywhere in the app, in one
    place, split into 4 groups (vessel type, region type, speed, and
    track/default colours). Change a value here once and it updates
    everywhere that colour appears — see the comment at the top of
    `vesselTypeColors.ts` for exactly which buttons/legends/dots each
    group controls. It's also read directly by the Python backend
    (`analysis/plots.py`) so the analysis chart colours can't drift out of
    sync with the map.
  - **`vesselTypeColors.ts`** — re-exports `colors.json`'s "vessel" section
    as `TYPE_COLORS`, the name the rest of the app already imports.
  - **`cha_regions.json`** / **`wea_regions.json`** — real GeoJSON geometry
    for the preset Critical Habitat / Wind Energy region shapes (editable
    in QGIS, geojson.io, etc.), wired into the app's shape by `regions.ts`.
  - **`moorings.ts`** — hardcoded AMAR mooring deployment records. Not
    geometry, so it's plain TypeScript instead of JSON like the region
    files — see the comment at the top of the file for how to add one.
- **`src/useTheme.ts`** — dark mode hook (OS preference + manual override,
  see DEVELOPMENT.md).
- **`src/tour/`** — the guided app-tour feature.

## Style conventions

- **Text colour**: `slate-600` for body text.
- **Interactive feedback**: `scale-95` for active state — used for sidebar
  buttons, closing buttons.
- **Fonts**:
  - `font-stack-headline` (sans stack) — headers and sub-header description
    text
  - `geologica` — labels and tags
  - `inter` — body text
- **Dark mode**: every color utility gets a matching `dark:` variant
  (`text-slate-600 dark:text-slate-300`, `bg-white dark:bg-slate-900`,
  etc.) — see DEVELOPMENT.md. Native form controls (`<input type="date">`)
  also need `[color-scheme:light] dark:[color-scheme:dark]`, not just
  `dark:bg-*`.

## To review

- *(nothing flagged right now)*

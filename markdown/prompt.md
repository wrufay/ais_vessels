# Prompt for Claude Code: Guided App Tour

I want to build a guided tour feature for my app, similar in spirit to NOAA's Passive Acoustic Data Viewer tour (I'll describe the reference pattern below — I don't have a live demo to show you, so follow this spec closely).

## Reference pattern (for context, not to copy verbatim)

The NOAA tool has a "Tour" button in its top nav. Clicking it starts a step-by-step walkthrough: a numbered callout box (with a step-count badge) points at a specific UI element, dims/blurs the rest of the screen, and explains what that element does. Users move forward/backward via arrow buttons or arrow keys, with a dot-based progress indicator along the bottom of the callout, and can exit anytime via Escape or an X button. Transitions between steps should be smooth (fade/slide), not abrupt jumps.

## Entry point

Add a "Tour" button in the icon bar, styled identically to the existing "Measure" button (same size, shape, icon style, spacing conventions) — placed directly above it in the icon bar.

The tour is **manual-start only** — it should NOT auto-start for first-time users. It only begins when the user clicks the Tour button.

## Interaction requirements

- **Keyboard navigation**: arrow keys to go forward/back, Escape to exit at any time.
- **Click navigation**: Next/Back buttons in the callout, plus a close (X) button.
- **Dot progress indicator** along the bottom of each callout, matching total step count, with the current step highlighted. **Each dot must be clickable and jump directly to that specific step** — not just a passive progress display.
- **Spotlight effect**: darken/blur the background, but the highlighted target element itself should stay visible/interactive-looking above the overlay (like a cutout), not just a plain dark screen with a floating box.
- **Smooth transitions** between steps — fade and/or slide, not instant jumps.
- Build this as a **generic "highlight any element" system**, not something coupled only to side-panel sections. Some tour steps point at side-panel content, but at least one step (see "Regions: Analyze flow" below) needs to highlight buttons in the **left icon bar**, unrelated to the side panel. The highlighting/targeting mechanism should work for any DOM element via ref or selector, not be hardcoded per-panel.

## Tour flow structure

The tour goes through each button in the icon bar in sequence. For each button, the pattern is:
1. **One step** highlighting the icon-bar button itself, explaining what it does.
2. **Open/highlight the corresponding side panel** it triggers.
3. **A few more steps** walking through the key functional sections of that panel, using the exact wording specified below.

## Exact content per section

**1. Vessel Tracks** — highlight these three sections, in order:
- Date and MMSI search: *"Select the date range you want to view vessels from. Use search bar to find a specific MMSI or vessel name"*
- Vessel list: *"Scroll through the vessels found in that date range and click on one to display its track on the map."* followed by a **visual line break**, then *"Use FILTER and SORT BY to refine the list."* — this must render as an actual line break in the UI, not a literal `\n` character.
- Size: *"Adjust size and opacity of the visible points here, found at the bottom of each corresponding panel."*

**2. Moorings** — highlight these two sections:
- Upload CSV and template: *"AMAR moorings displayed by default. Download a template CSV file and upload your own to view on the map."*
- List: *"Moorings in the selected time range will show up here."*

**3. Regions** — highlight these three sections:
- Customize: *"Draw a region on the map or upload a shapefile. These get added to the list, which you can view anytime."*
- List: *"See pre-defined CHA and WEA, plus your own uploaded or drawn regions. Toggle display on the map."*
- Analyze flow: *"Clicking on the map region selects it, and allows you to analyze the region to view statistics, or see a simplified representation of all the traffic in the region."* — for this step, highlight the relevant buttons in the **left icon bar** (not the side panel).

**4. Map** — highlight these two sections:
- Layers: *"Toggle bathymetry and noise data map layers. Use each one's adjustment feature to customize the overlay."*
- Base map: *"Change which base map is used."*

## Architecture requirements

- **Do not** add this logic directly into the existing `map.tsx` file — it's already large. Build this as its own set of organized, composable components (e.g., a `Tour` folder/module: the overlay/spotlight component, the callout component, a step-config data structure, navigation controls, etc.).
- Content (step text, target elements, ordering) should be **easily editable** — ideally as a clean, centralized config (e.g., an array of step objects) separate from the rendering logic, so text/sizing/styling changes don't require touching multiple files.
- **Styling**: mostly Tailwind utility classes. Common/repeated styles (e.g., the spotlight overlay effect) can go in the CSS file if that's cleaner than repeating Tailwind classes everywhere, but Tailwind should be the default.
- **Keep it lean** — no redundant or unnecessary code, no over-engineering. Simple Next/Back buttons, dot indicator, blur/darken on highlight. Don't gold-plate this.

## Documentation

When done, create a new markdown file at `markdown/notes/JUL_20.md` (inside the existing notes folder) documenting exactly what was built and why — the component structure, key decisions (e.g., why the highlight system is generic, how the step config is structured, how clickable dot navigation works), and anything worth knowing if I want to extend or edit this later.
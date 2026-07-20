# Guided App Tour

Manual-start, click-through walkthrough of the app's main features. Lives in
`frontend/src/tour/`, decoupled from `Map.tsx`.

## Entry point

A "Tour" button in `IconBar.tsx`, styled identically to (and placed directly
above) the existing "Measure" button. Clicking it sets `tourActive = true` in
`Map.tsx`. It never auto-starts.

## Component structure

```
frontend/src/tour/
  types.ts      — TourStep interface
  steps.tsx     — createTourSteps(actions): TourStep[] — all step content, in order
  Tour.tsx       — orchestrator: step index, keyboard nav, measuring, portal
  TourOverlay.tsx — dark/blurred backdrop with a clip-path cutout + spotlight ring
  TourCallout.tsx — the callout box: title, body, dot indicator, Back/Next/X
```

`Tour` is mounted once near the bottom of `Map.tsx`'s JSX and portals its
output (`createPortal`) straight to `document.body`, so it renders above
everything regardless of where in the tree it's mounted.

## Why the highlight system is generic

The spec explicitly calls for "highlight any element," not something coupled
to side-panel sections — the Regions "Analyze flow" step needs to highlight
buttons in the **left icon bar**, unrelated to any panel.

So targeting works through a plain key → DOM element registry, not per-panel
logic:

- `Map.tsx` owns `tourTargetsRef = useRef<Record<string, HTMLElement | null>>({})`
  and a `registerTarget(key)` factory that returns a ref callback:
  `ref={registerTarget("vesselSearch")}`.
- Any element, anywhere in the tree — a side-panel `<div>`, an icon-bar
  button wrapper — can opt in just by attaching that ref callback. `IconBar`
  receives `registerTarget` as a prop and uses it the same way internally.
- Two elements (`mooringListElRef`, `regionListElRef`) already had a stable
  ref for drag-resize measurement, so `getTourTarget(key)` special-cases
  those two keys to reuse the existing ref instead of double-registering.
- Each `TourStep.target` is just one of these string keys (or `null` for the
  centered, spotlight-less intro step). `Tour.tsx` calls
  `getTarget(step.target)` and measures `getBoundingClientRect()` on
  whatever comes back — it has no idea whether that element is inside a
  side panel, the icon bar, or anywhere else.

This means adding a new tour step anywhere in the app is: attach a ref
somewhere, add one object to the `steps.tsx` array. No changes to the
highlight/overlay/callout machinery are ever needed.

## Step config — the thing you'll actually want to edit

All step content lives in `frontend/src/tour/steps.tsx`, as one ordered
array returned by `createTourSteps(actions)`. Each entry:

```ts
{
  id: "tracks-search",       // stable key, also used as React key (re-triggers the fade/slide-in on change)
  target: "vesselSearch",    // registry key resolved to a DOM element, or null for no spotlight
  title: "Date & search",
  body: "…",                 // string or JSX (see the vessel-list step for a real line break)
  onEnter: actions.openVesselPanel, // optional side effect run when this step becomes active
}
```

To reorder, reword, or retarget a step, this is the only file to touch —
rendering logic in `Tour.tsx`/`TourOverlay.tsx`/`TourCallout.tsx` never
needs to change for a content edit.

`createTourSteps` takes an `actions` object (`openVesselPanel`,
`openMooringPanel`, `openRegionPanel`, `openMapPanel`) built once in
`Map.tsx` via `useMemo`, since opening a panel means calling `Map.tsx`'s own
`setShowXPanel` state setters — the tour module itself has no idea these
panels exist, it just calls whatever function each step's `onEnter` names.

**No dedicated "here's the panel" step.** Originally each section had an
extra step that just highlighted the whole side panel after opening it.
That step was removed — the tour now goes straight from the icon-bar button
to the first real feature inside that panel, with the panel-opening
`onEnter` moved onto that first content step instead (e.g. `tracks-search`'s
`onEnter` opens the vessel panel; there's no separate `tracks-panel` step
anymore).

Flow, in order: **intro** (centered, no spotlight, explains Esc/X/arrow-key
controls) → **Vessel Tracks** (button → search → list → size) →
**Moorings** (button → upload → list) → **Regions** (button → customize →
list → analyze-flow, which spotlights the icon-bar Analyse/All
traffic/Clear group, not a side panel) → **Map** (button → layers →
basemap). 15 steps total.

## Spotlight / cutout effect

`TourOverlay.tsx` draws one full-screen `fixed` div with:

```css
background: rgba(15, 23, 42, 0.55);
backdrop-filter: blur(2px);
```

and a `clip-path: polygon(evenodd, <full-viewport-rect>, <target-rect>)` —
an outer rectangle (the whole viewport) plus an inner rectangle (the target,
padded 6px), combined with the `evenodd` fill rule so the inner rectangle is
punched out as a hole. Browsers also clip **hit-testing** at `clip-path`
boundaries, so the cutout area isn't just visually clear — clicks inside it
pass straight through to the real element underneath. That's what makes the
target look "interactive," without any extra pointer-events wiring.

A second small `fixed` div (`.tour-spotlight-ring`, no fill, just a
box-shadow ring in the app's powder-blue accent) sits exactly on the cutout
boundary as a visible highlight border, with `pointer-events: none` so it
never blocks clicks either.

Both the overlay's `clip-path` and the ring's position/size are declared
with a CSS `transition` (`index.css`), so moving from one step's target to
the next glides rather than jumps — no JS animation needed. This only works
smoothly because every clip-path has the same number of polygon points
(10) every time.

## Positioning & re-measuring

`Tour.tsx` measures the current target with `getBoundingClientRect()`:

- once immediately when the step changes,
- once again after 320ms — because `onEnter` may have just opened a side
  panel, and `SidePanel.tsx`'s slide-in transition is 300ms
  (`duration-300`); this catches the target's final resting position,
- and on every window `resize`.

No continuous polling loop — this is deliberately the minimum needed for
correctness for a short-lived tour UI, not a general-purpose live-tracking
system.

`TourCallout.tsx` positions itself below the target if there's room, else
above, and clamps horizontally to stay on-screen; falls back to centered
when there's no target (the intro step).

## Navigation

- **Keyboard**: `ArrowRight`/`ArrowDown` → next, `ArrowLeft`/`ArrowUp` →
  back, `Escape` → close. Global `keydown` listener, only attached while
  the tour is active.
- **Click**: Back/Next buttons; Next becomes "Done" (closes the tour) on
  the last step.
- **Dot indicator**: one dot per step, current step widened/filled. Every
  dot is its own `<button onClick={() => onDotClick(i)}>` — clicking any
  dot jumps directly to that step, it's not just a progress display.
- **Close**: X button or Escape, either calls the same `onClose`.

## Styling notes

- Fade/slide-in reuses the app's existing `animate-slide-up`
  Tailwind keyframe (`tailwind.config.js`) — no new keyframes were added,
  since one already matched what the spec asked for.
- Per explicit follow-up feedback: the callout modal and the spotlight
  cutout/ring are square (no `rounded-*` classes) — only the fully-round
  pill buttons (Back, Next, dot indicators) and the Tour/Measure icon-bar
  buttons keep `rounded-full`, matching the rest of the app's convention of
  rounding only pill-shaped controls, not containers.
- Colors reuse the existing palette from `index.css`'s comment block:
  `#3d5a80` (dusk blue) for primary actions/badges, `#98c1d9` (powder blue)
  for the spotlight ring — both already used elsewhere for focus states and
  active buttons.

## Extending this later

- **New step**: attach `registerTarget("someKey")` (or the `innerRef` prop
  on `SidePanel`) to the element you want to highlight, then add one object
  to the array in `steps.tsx` at the position you want it to appear.
- **New panel-opening action**: add it to the `TourActions` interface and
  the `actions` object built in `Map.tsx`, same pattern as the four
  existing `openXPanel` functions.
- **Skip the spotlight entirely** for a step (e.g. another intro-style
  slide): set `target: null`.

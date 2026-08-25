// Shared style constants for noise-impact zones, used by the map layer
// (Map.tsx), the results list (ImpactsPanel.tsx), and the on-map legend
// (NoiseImpactLegend.tsx) -- kept in one place so all three always agree
// on what each colour/linestyle/shade means. Colour (zoneColor) encodes
// hearing group -- matching the supervisor's own reference-plot
// convention of a distinct palette per hearing group, not per impact
// type -- shade within that colour encodes metric, and dash pattern
// (IMPACT_DASH) still encodes impact type, mirroring the matplotlib
// linestyles ns_pile_driving_noise_mapping's own Impact enum assigns per
// member (TTS dotted -> Mortality solid, see enums.py) so a zone drawn
// here reads the same way it would in that package's own reference
// plots.
//
// Nine hearing groups sit past the point a categorical palette can stay
// safely distinguishable if every zone were shown at once under color
// vision deficiency (this app's own default behaviour only shows one
// zone per hearing-group/impact-type pair at a time -- see handleRun in
// useNoiseImpact.ts -- which keeps the realistic on-screen count well
// under nine). Hue alone is never the only identifier: every place a
// zone's colour appears (results list, legend, this map layer) sits next
// to its hearing-group/impact/metric name as text.
//
// ~20% darker than a plain-canvas-picked palette would be (each RGB
// channel x0.8) -- the bathymetry WMS layer is a busy, mid-toned
// basemap, and undarkened colors washed out against it (same finding
// that originally motivated darkening the old impact-keyed palette).
export const HEARING_GROUP_COLORS: Record<string, string> = {
  "LF Cetaceans": "#2260ab",
  "HF Cetaceans": "#bc532a",
  "VHF Cetaceans": "#168c62",
  "Phocids Underwater": "#be8100",
  "Fish - No Swim Bladder": "#ba6283",
  "Fish - Non-Auditory Swim Bladder": "#006900",
  "Fish - Auditory Swim Bladder": "#3b2e86",
  "Fish - Eggs and Larvae": "#b63a3a",
  "Sea Turtles": "#563f80",
};

// SEL_cum (cumulative exposure) renders as a further-darkened shade of
// its hearing group's colour; SPL_peak (instantaneous) renders at the
// base HEARING_GROUP_COLORS tone. Only visibly matters when both metrics
// are shown for the same hearing group at once, which requires
// overriding the "Advanced parameters" default of one metric per group
// (see useNoiseImpact.ts's handleRun).
const SEL_CUM_SHADE_FACTOR = 0.7;

function darken(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const channel = (shift: number) =>
    Math.max(0, Math.min(255, Math.round(((n >> shift) & 0xff) * factor)));
  return `#${((channel(16) << 16) | (channel(8) << 8) | channel(0))
    .toString(16)
    .padStart(6, "0")}`;
}

export function zoneColor(hearingGroup: string, metric: string): string {
  const base = HEARING_GROUP_COLORS[hearingGroup] ?? "#888888";
  return metric === "SEL_cum" ? darken(base, SEL_CUM_SHADE_FACTOR) : base;
}

export const IMPACT_DASH: Record<string, number[] | undefined> = {
  TTS: [2, 4],
  "AUD INJ": [8, 4],
  "REC INJ": [8, 4, 2, 4],
  Mortality: undefined,
};

// Draw more severe (typically smaller, nested) zones on top of less severe
// (larger) ones regardless of feature add order.
export const IMPACT_ZINDEX: Record<string, number> = {
  TTS: 1,
  "AUD INJ": 2,
  "REC INJ": 3,
  Mortality: 4,
};

// A zone that's genuinely just a few metres across rounds to "0.0" at
// normal decimal precision -- reads as "no zone" (nothing here) even
// though one really does exist, just a tiny one. Shown as "<1" instead so
// a real, if tiny, result never looks identical to zero. Used for area/
// diameter/radius wherever they're displayed (ImpactsPanel, NoiseImpactLegend).
export function formatKmOrTiny(value: number, decimals = 1): string {
  const roundsToZero = value < 0.5 / 10 ** decimals;
  return roundsToZero ? "<1" : value.toFixed(decimals);
}

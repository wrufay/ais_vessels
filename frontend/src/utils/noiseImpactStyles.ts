// Shared style constants for noise-impact zones, used by the map layer
// (Map.tsx), the results list (ImpactsPanel.tsx), and the on-map legend
// (NoiseImpactLegend.tsx) -- kept in one place so all three always agree
// on what each colour/linestyle means. Colour is an app convention
// (severity escalation, not from the source model); dash pattern mirrors
// the matplotlib linestyles ns_pile_driving_noise_mapping's own Impact
// enum assigns per member (TTS dotted -> Mortality solid, see
// enums.py) so a zone drawn here reads the same way it would in that
// package's own reference plots.

// ~20% darker than the app's base palette (same hue, each RGB channel
// x0.8) -- the bathymetry WMS layer is a busy, mid-toned basemap, and the
// original colors (picked against a plain light/dark canvas) washed out
// against it. Only affects this feature: IMPACT_COLORS isn't used
// anywhere outside noise-impact (map layer, results list, legend all
// import from here), so darkening it in place keeps all three in sync
// automatically instead of needing a separate "dark mode" variant.
export const IMPACT_COLORS: Record<string, string> = {
  TTS: "#314866",
  "AUD INJ": "#be7c00",
  "REC INJ": "#a25202",
  Mortality: "#8b1a0e",
};

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

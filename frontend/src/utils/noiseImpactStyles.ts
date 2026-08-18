// Shared style constants for noise-impact zones, used by the map layer
// (Map.tsx), the results list (ImpactsPanel.tsx), and the on-map legend
// (NoiseImpactLegend.tsx) -- kept in one place so all three always agree
// on what each colour/linestyle means. Colour is an app convention
// (severity escalation, not from the source model); dash pattern mirrors
// the matplotlib linestyles ns_pile_driving_noise_mapping's own Impact
// enum assigns per member (TTS dotted -> Mortality solid, see
// enums.py) so a zone drawn here reads the same way it would in that
// package's own reference plots.

export const IMPACT_COLORS: Record<string, string> = {
  TTS: "#3d5a80",
  "AUD INJ": "#ee9b00",
  "REC INJ": "#ca6702",
  Mortality: "#ae2012",
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

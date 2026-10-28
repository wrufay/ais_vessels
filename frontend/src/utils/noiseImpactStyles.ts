// Shared style constants for noise-impact zones, used by the map layer
// (Map.tsx), the results list (ImpactsPanel.tsx), and the on-map legend
// (NoiseImpactLegend.tsx) -- kept in one place so all three always agree
// on what each colour/linestyle/shade means. Colour (zoneColor) encodes
// hearing group -- matching the supervisor's own reference-plot
// convention of a distinct palette per hearing group -- shade within that
// colour encodes how serious the impact is (light TTS -> dark Mortality),
// and dash pattern (IMPACT_DASH) also encodes impact type, mirroring the
// matplotlib linestyles ns_pile_driving_noise_mapping's own Impact enum
// assigns per member (TTS dotted -> Mortality solid, see enums.py). Metric
// (SEL_cum vs SPL_peak) has no look of its own on the map; it is named in
// the legend text instead.
//
// Nine hearing groups is more than any palette can keep apart for every
// reader with colour vision deficiency, so hue is never the only
// identifier: every place a zone's colour appears (results list, legend,
// this map layer) sits next to its hearing-group/impact/metric name as
// text. The hues below were picked with an OKLab colour-difference check
// so each stays clearly apart from the others in its own family
// (cetaceans, fish) for normal and red-green colour-blind vision, with no
// blues (the bathymetry basemap is blue). Shades are the middle colour
// moved +0.10 / -0.12 in OKLab lightness.
type Shades = { tts: string; injury: string; mortality: string };
export const HEARING_GROUP_COLORS: Record<string, Shades> = {
  "LF Cetaceans": { tts: "#ea4e47", injury: "#c62828", mortality: "#9c0000" }, // red
  "HF Cetaceans": { tts: "#d252ba", injury: "#b0309a", mortality: "#880075" }, // magenta
  "VHF Cetaceans": { tts: "#eab73e", injury: "#c99700", mortality: "#a37200" }, // gold
  "Phocids Underwater": { tts: "#3aa899", injury: "#00897b", mortality: "#006559" }, // teal
  "Fish - No Swim Bladder": { tts: "#986ae6", injury: "#7b4bc4", mortality: "#5a239c" }, // violet
  "Fish - Non-Auditory Swim Bladder": { tts: "#ac7749", injury: "#8d5a2b", mortality: "#693800" }, // brown
  "Fish - Auditory Swim Bladder": { tts: "#88c03a", injury: "#6aa000", mortality: "#487b00" }, // lime
  "Fish - Eggs and Larvae": { tts: "#8c498c", injury: "#6d2c6e", mortality: "#4a054b" }, // plum
  "Sea Turtles": { tts: "#585858", injury: "#3d3d3d", mortality: "#1f1f1f" }, // dark grey
};

// Custom (user-entered) thresholds, one colour per distinct custom name
// (the zone's custom_index, which a name keeps while it is listed -- see
// NoiseImpactCustomThreshold's color_index), cycling if there are more
// than six -- picked as the colours furthest from every
// HEARING_GROUP_COLORS shade, so a custom zone never looks like a workbook
// one. Custom impacts have no seriousness, so they don't shade.
const CUSTOM_COLORS = ["#000000", "#2f5bd3", "#f48fb1", "#5fd3a0", "#1e3a8a", "#b0b0b0"];

export function zoneColor(
  hearingGroup: string,
  impact: string,
  customIndex: number | null = null
): string {
  if (customIndex !== null) return CUSTOM_COLORS[customIndex % CUSTOM_COLORS.length];
  const shades = HEARING_GROUP_COLORS[hearingGroup];
  if (!shades) return "#888888";
  if (impact === "TTS") return shades.tts;
  if (impact === "Mortality") return shades.mortality;
  return shades.injury; // AUD INJ / REC INJ (a group never has both)
}

// Thin black edge under the Designated WEA outline drawn with the
// noise-impact results (0.5 px each side), so the orange line stands
// apart from the zone lines, which sit on a white edge instead.
export const WEA_EDGE_COLOR = "#000000";

export const IMPACT_DASH: Record<string, number[] | undefined> = {
  TTS: [2, 4],
  "AUD INJ": [8, 4],
  "REC INJ": [8, 4, 2, 4],
  Mortality: undefined,
};

// Short hearing-group names for the zone name shown above the cursor
// lat/lon on the map, which has room for one short line per zone. "Fish"
// is dropped from the swim bladder groups (only fish have one).
const SHORT_HEARING_GROUP: Record<string, string> = {
  "LF Cetaceans": "LF cetaceans",
  "HF Cetaceans": "HF cetaceans",
  "VHF Cetaceans": "VHF cetaceans",
  "Phocids Underwater": "Phocids",
  "Fish - No Swim Bladder": "No swim bladder",
  "Fish - Non-Auditory Swim Bladder": "Non-aud. swim bladder",
  "Fish - Auditory Swim Bladder": "Aud. swim bladder",
  "Fish - Eggs and Larvae": "Fish eggs & larvae",
  "Sea Turtles": "Sea turtles",
};

// e.g. "REC INJ — Non-aud. swim bladder (SEL) · without". A custom
// threshold shows only the name the user typed (its impact is "Custom").
export function zoneShortLabel(
  hearingGroup: string,
  impact: string,
  metric: string,
  isCustom: boolean,
  isWithout: boolean
): string {
  const m = metric.startsWith("SEL") ? "SEL" : "SPL";
  const name = isCustom
    ? `${hearingGroup} (${m})`
    : `${impact} — ${SHORT_HEARING_GROUP[hearingGroup] ?? hearingGroup} (${m})`;
  return isWithout ? `${name} · without` : name;
}

// A zone that's genuinely just a few metres across rounds to "0.0" at
// normal decimal precision -- reads as "no zone" (nothing here) even
// though one really does exist, just a tiny one. Shown as "<1" instead so
// a real, if tiny, result never looks identical to zero. Used for area/
// diameter/radius wherever they're displayed (ImpactsPanel, NoiseImpactLegend).
export function formatKmOrTiny(value: number, decimals = 1): string {
  const roundsToZero = value < 0.5 / 10 ** decimals;
  return roundsToZero ? "<1" : value.toFixed(decimals);
}

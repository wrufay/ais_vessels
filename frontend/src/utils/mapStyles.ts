import type { FeatureLike } from "ol/Feature";
import { Style, Stroke, Fill, Icon } from "ol/style";
import { TYPE_COLORS } from "../data/vesselTypeColors";
import sharedColors from "../data/colors.json";

const REGION_COLORS: Record<string, string> = sharedColors.region;

export function classifyType(code: string | number | null): string {
  const c = typeof code === "number" ? code : parseInt(String(code ?? ""), 10);
  if (Number.isNaN(c))
    return String(code ?? "").trim() ? String(code).toLowerCase() : "unknown";
  if (c >= 70 && c < 80) return "cargo";
  if (c >= 80 && c < 90) return "tanker";
  if (c === 30) return "fishing";
  if (c >= 60 && c < 70) return "passenger";
  if (c === 51) return "search & rescue";
  if (
    (c >= 20 && c < 30) ||
    (c >= 31 && c < 51) ||
    (c >= 52 && c < 60) ||
    (c >= 90 && c < 100)
  )
    return "other";
  return "unknown";
}

export function formatTime(epochSeconds: number): string {
  return (
    new Date(epochSeconds * 1000).toISOString().replace("T", " ").slice(0, 19) +
    " UTC"
  );
}

export const EMPTY_STYLE = new Style({});

// Single source of truth for the fast/mid/slow speed-based color scheme --
// previously duplicated independently across ROUTE_WEBGL_STYLE,
// REGION_WEBGL_STYLE, and makeFeatureStyle(), which risked drifting out of
// sync if one was updated without the others. Thresholds are knots. Values
// live in colors.json alongside the vessel/region palettes.
export const SPEED_STYLE = sharedColors.speed;

// "All traffic" flat grey (mode 0 -- no type/speed coloring applied)
export const TRACK_DEFAULT_COLOR = sharedColors.track.default;

// type_num encoding used in the WebGL region track layer style (0 = unknown)
export const TYPE_NUM: Record<string, number> = {
  cargo: 1, tanker: 2, fishing: 3, passenger: 4, "search & rescue": 5, other: 6,
};

// WebGL style for the selected vessel route layer (pointType: 0=normal, 1=start, 2=end)
export const ROUTE_WEBGL_VARIABLES = { dotSize: 5, dotOpacity: 1.0 };
export const ROUTE_WEBGL_STYLE = {
  "circle-radius": [
    "case",
    ["==", ["get", "pointType"], 1], ["*", ["var", "dotSize"], 1.4],
    ["==", ["get", "pointType"], 2], ["*", ["var", "dotSize"], 1.4],
    ["var", "dotSize"],
  ],
  "circle-fill-color": [
    "case",
    ["==", ["get", "pointType"], 1], "#98c1d9",
    ["==", ["get", "pointType"], 2], "#ee6c4d",
    ["case", [">", ["get", "sog"], SPEED_STYLE.thresholds.fast], SPEED_STYLE.fill.fast,
             [">", ["get", "sog"], SPEED_STYLE.thresholds.mid], SPEED_STYLE.fill.mid, SPEED_STYLE.fill.slow],
  ],
  "circle-stroke-color": [
    "case",
    ["==", ["get", "pointType"], 1], "#ffffff",
    ["==", ["get", "pointType"], 2], "#ffffff",
    ["case", [">", ["get", "sog"], SPEED_STYLE.thresholds.fast], SPEED_STYLE.stroke.fast,
             [">", ["get", "sog"], SPEED_STYLE.thresholds.mid], SPEED_STYLE.stroke.mid, SPEED_STYLE.stroke.slow],
  ],
  "circle-stroke-width": [
    "case",
    ["==", ["get", "pointType"], 1], 2,
    ["==", ["get", "pointType"], 2], 2,
    1,
  ],
  "circle-opacity": ["var", "dotOpacity"],
};

// WebGL style for the region track layer — mode 0=grey, 1=type, 2=speed, 3=per-vessel
export const VESSEL_PALETTE: string[] = sharedColors.track.multiVessel;

export const REGION_WEBGL_VARIABLES = { mode: 0, dotSize: 4, dotOpacity: 0.6 };
export const REGION_WEBGL_STYLE = {
  "circle-radius": ["var", "dotSize"],
  "circle-fill-color": [
    "case",
    ["==", ["var", "mode"], 2],
    ["case", [">", ["get", "sog"], SPEED_STYLE.thresholds.fast], SPEED_STYLE.fill.fast,
             [">", ["get", "sog"], SPEED_STYLE.thresholds.mid], SPEED_STYLE.fill.mid, SPEED_STYLE.fill.slow],
    ["==", ["var", "mode"], 1],
    ["match", ["get", "type_num"],
      1, TYPE_COLORS.cargo, 2, TYPE_COLORS.tanker, 3, TYPE_COLORS.fishing,
      4, TYPE_COLORS.passenger, 5, TYPE_COLORS["search & rescue"], 6, TYPE_COLORS.other,
      TYPE_COLORS.unknown,
    ],
    ["==", ["var", "mode"], 3],
    ["match", ["%", ["get", "vesselIndex"], 8],
      ...VESSEL_PALETTE.flatMap((color, i) => [i, color]),
      TRACK_DEFAULT_COLOR,
    ],
    TRACK_DEFAULT_COLOR,
  ],
  "circle-opacity": ["var", "dotOpacity"],
};

const _vesselCanvasCache: Record<string, HTMLCanvasElement> = {};
export function makeVesselCanvas(hex: string, radius: number, border?: string): HTMLCanvasElement {
  const key = `${hex}-${radius}-${border ?? ""}`;
  if (_vesselCanvasCache[key]) return _vesselCanvasCache[key];
  const pad = border ? 2 : 1;
  const size = (radius + pad) * 2;
  const cx = size / 2;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  if (border) {
    ctx.beginPath();
    ctx.arc(cx, cx, radius + 1.5, 0, Math.PI * 2);
    ctx.fillStyle = border;
    ctx.fill();
  }
  const grad = ctx.createRadialGradient(cx - radius * 0.3, cx - radius * 0.3, 0, cx, cx, radius);
  // lighten color for highlight
  grad.addColorStop(0, lighten(hex, 0.45));
  grad.addColorStop(0.55, hex);
  grad.addColorStop(1, darken(hex, 0.35));
  ctx.beginPath();
  ctx.arc(cx, cx, radius, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  _vesselCanvasCache[key] = c;
  return c;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export function lighten(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  const shift = Math.round(255 * amt);
  return `rgb(${Math.min(255, r + shift)},${Math.min(255, g + shift)},${Math.min(255, b + shift)})`;
}

export function darken(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  const shift = Math.round(255 * amt);
  return `rgb(${Math.max(0, r - shift)},${Math.max(0, g - shift)},${Math.max(0, b - shift)})`;
}

const _mooringCanvasCache: Record<string, HTMLCanvasElement> = {};
export function makeMooringCanvas(highlighted: boolean, r = 10): HTMLCanvasElement {
  const key = `${highlighted ? "1" : "0"}-${r}`;
  if (_mooringCanvasCache[key]) return _mooringCanvasCache[key];
  const size = r * 2 + 2;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  const grad = ctx.createRadialGradient(r - 3, r - 3, 1, r, r, r);
  grad.addColorStop(0, highlighted ? "#6b8cae" : "#4e6680");
  grad.addColorStop(0.6, highlighted ? "#3d5a80" : "#293241");
  grad.addColorStop(1, "#111a22");
  ctx.beginPath();
  ctx.arc(r + 1, r + 1, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  _mooringCanvasCache[key] = c;
  return c;
}

const iconAnchor = { anchor: [0.5, 0.5] as [number, number], anchorXUnits: "fraction" as const, anchorYUnits: "fraction" as const };

// The route line connecting a selected vessel's points. makeFeatureStyle()
// below builds its own fast/mid/slow/start/end dot styles per call (since it
// needs a caller-supplied radius/opacity) -- this is the one style that
// doesn't vary, so it isn't rebuilt every time.
export const ROUTE_LINE_STYLE = new Style({ stroke: new Stroke({ color: "#98c1d9", width: 2 }) });

export function makeFeatureStyle(showStart: boolean, showEnd: boolean, radius = 5, opacity = 1) {
  const endRadius = Math.round(radius * 1.4);
  const fast  = new Style({ image: new Icon({ img: makeVesselCanvas(SPEED_STYLE.fill.fast, radius), ...iconAnchor, opacity }) });
  const mid   = new Style({ image: new Icon({ img: makeVesselCanvas(SPEED_STYLE.fill.mid, radius), ...iconAnchor, opacity }) });
  const slow  = new Style({ image: new Icon({ img: makeVesselCanvas(SPEED_STYLE.fill.slow, radius), ...iconAnchor, opacity }) });
  const start = new Style({ image: new Icon({ img: makeVesselCanvas("#98c1d9", endRadius, "#fff"), ...iconAnchor, opacity }) });
  const end   = new Style({ image: new Icon({ img: makeVesselCanvas("#ee6c4d", endRadius, "#fff"), ...iconAnchor, opacity }) });
  return function (feature: FeatureLike): Style {
    const geomType = feature.getGeometry()?.getType();
    if (geomType === "LineString") return ROUTE_LINE_STYLE;
    const isStart = feature.get("isStart") as boolean;
    const isEnd = feature.get("isEnd") as boolean;
    if (isStart && !showStart) return EMPTY_STYLE;
    if (isEnd && !showEnd) return EMPTY_STYLE;
    if (isStart) return start;
    if (isEnd) return end;
    const sog = (feature.get("sog") as number) || 0;
    return sog > SPEED_STYLE.thresholds.fast ? fast : sog > SPEED_STYLE.thresholds.mid ? mid : slow;
  };
}

// Opacity variants are derived, not stored -- fill/hoverFill/selectedFill are
// always the same hue as stroke, just more opaque. Keeping that as code (not
// four separate rgba strings per region type in JSON) means changing a
// region's color can't leave the variants mismatched with the base hue.
function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function regionColor(type: string) {
  const stroke = REGION_COLORS[type] ?? REGION_COLORS.CHA;
  return {
    stroke,
    fill: hexToRgba(stroke, 0.07),
    hoverFill: hexToRgba(stroke, 0.15),
    selectedFill: hexToRgba(stroke, 0.28),
  };
}

// Module-level mutable state — OpenLayers feature styling callbacks can't read
// React state directly, so click handlers in Map.tsx push updates here via the
// setters below and call chaSourceRef.current.changed() to trigger a restyle.
let _selectedChaName: string | null = null;
let _clickedChaNames: Set<string> = new Set();

export function getSelectedChaName(): string | null {
  return _selectedChaName;
}

export function setSelectedChaName(name: string | null) {
  _selectedChaName = name;
}

export function getClickedChaNames(): Set<string> {
  return _clickedChaNames;
}

export function setClickedChaNames(names: Set<string>) {
  _clickedChaNames = names;
}

export function chaStyle(feature: FeatureLike): Style {
  const c = regionColor(feature.get("regionType") as string);
  const name = feature.get("name") as string;
  const selected = name === _selectedChaName;
  const clicked = _clickedChaNames.has(name);
  if (!selected && !clicked) return new Style();
  return new Style({
    stroke: new Stroke({ color: c.stroke, width: selected ? 2.5 : 2 }),
    fill: new Fill({ color: selected ? c.selectedFill : c.fill }),
  });
}

export function chaHoverStyle(feature: FeatureLike): Style {
  const c = regionColor(feature.get("regionType") as string);
  const selected = feature.get("name") === _selectedChaName;
  return new Style({
    stroke: new Stroke({ color: c.stroke, width: 2.5 }),
    fill: new Fill({ color: selected ? c.selectedFill : c.hoverFill }),
  });
}

export function drawnRegionLabel(geojson: object): string {
  const coords = (geojson as any)?.coordinates?.[0] as number[][] | undefined;
  if (!coords?.length) return "Drawn region";
  return coords.slice(0, -1).slice(0, 3).map(([lon, lat]) =>
    `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? "E" : "W"}`
  ).join(", ") + (coords.length - 1 > 3 ? "…" : "");
}

export function downloadPlot(b64: string, name: string) {
  const a = document.createElement("a");
  a.href = `data:image/png;base64,${b64}`;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

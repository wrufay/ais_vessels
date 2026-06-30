import type { FeatureLike } from "ol/Feature";
import { Style, Stroke, Fill, Icon } from "ol/style";

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

// type_num encoding used in the WebGL region track layer style (0 = unknown)
export const TYPE_NUM: Record<string, number> = {
  cargo: 1, tanker: 2, fishing: 3, passenger: 4, "search & rescue": 5, other: 6,
};

// WebGL style for the region track layer — mode 0=grey, 1=type, 2=speed
export const REGION_WEBGL_STYLE = {
  variables: { mode: 0 },
  "circle-radius": 4,
  "circle-fill-color": [
    "case",
    ["==", ["var", "mode"], 2],
    ["case", [">", ["get", "sog"], 10], "#ee6c4d", [">", ["get", "sog"], 3], "#ffc857", "#0a8754"],
    ["==", ["var", "mode"], 1],
    ["match", ["get", "type_num"],
      1, "#0072BD", 2, "#D95319", 3, "#EDB120", 4, "#7E2F8E", 5, "#77AC30", 6, "#4DBEEE",
      "#A2142F",
    ],
    "#5a5a5a",
  ],
  "circle-opacity": 0.6,
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

export function lighten(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, (n >> 16) + Math.round(255 * amt));
  const g = Math.min(255, ((n >> 8) & 0xff) + Math.round(255 * amt));
  const b = Math.min(255, (n & 0xff) + Math.round(255 * amt));
  return `rgb(${r},${g},${b})`;
}

export function darken(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, (n >> 16) - Math.round(255 * amt));
  const g = Math.max(0, ((n >> 8) & 0xff) - Math.round(255 * amt));
  const b = Math.max(0, (n & 0xff) - Math.round(255 * amt));
  return `rgb(${r},${g},${b})`;
}

const _mooringCanvasCache: Record<string, HTMLCanvasElement> = {};
export function makeMooringCanvas(highlighted: boolean): HTMLCanvasElement {
  const key = highlighted ? "1" : "0";
  if (_mooringCanvasCache[key]) return _mooringCanvasCache[key];
  const r = 10;
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
export const VESSEL_STYLES = {
  fast:  new Style({ image: new Icon({ img: makeVesselCanvas("#ee6c4d", 5), ...iconAnchor }) }),
  mid:   new Style({ image: new Icon({ img: makeVesselCanvas("#ffc857", 5), ...iconAnchor }) }),
  slow:  new Style({ image: new Icon({ img: makeVesselCanvas("#0a8754", 5), ...iconAnchor }) }),
  start: new Style({ image: new Icon({ img: makeVesselCanvas("#98c1d9", 7, "#fff"), ...iconAnchor }) }),
  end:   new Style({ image: new Icon({ img: makeVesselCanvas("#ee6c4d", 7, "#fff"), ...iconAnchor }) }),
  line:  new Style({ stroke: new Stroke({ color: "#98c1d9", width: 2 }) }),
};

export function makeFeatureStyle(showStart: boolean, showEnd: boolean) {
  return function (feature: FeatureLike): Style {
    const geomType = feature.getGeometry()?.getType();
    if (geomType === "LineString") return VESSEL_STYLES.line;
    const isStart = feature.get("isStart") as boolean;
    const isEnd = feature.get("isEnd") as boolean;
    if (isStart && !showStart) return EMPTY_STYLE;
    if (isEnd && !showEnd) return EMPTY_STYLE;
    if (isStart) return VESSEL_STYLES.start;
    if (isEnd) return VESSEL_STYLES.end;
    const sog = (feature.get("sog") as number) || 0;
    return sog > 10 ? VESSEL_STYLES.fast : sog > 3 ? VESSEL_STYLES.mid : VESSEL_STYLES.slow;
  };
}

export function regionColor(type: string) {
  if (type === "WEA") return { stroke: "#ee6c4d", fill: "rgba(238,108,77,0.07)", hoverFill: "rgba(238,108,77,0.15)", selectedFill: "rgba(238,108,77,0.28)" };
  if (type === "Uploaded") return { stroke: "#9b59b6", fill: "rgba(155,89,182,0.07)", hoverFill: "rgba(155,89,182,0.15)", selectedFill: "rgba(155,89,182,0.28)" };
  return { stroke: "#3d5a80", fill: "rgba(61,90,128,0.07)", hoverFill: "rgba(61,90,128,0.15)", selectedFill: "rgba(61,90,128,0.28)" };
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

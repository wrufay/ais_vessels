import { useState } from "react";
import PanelHeader from "../PanelHeader";
import CollapsibleHeader from "../CollapsibleHeader";
import SizeOpacityPanel from "../SizeOpacityPanel";
import NoiseImpactLegend, { LineSwatch } from "./NoiseImpactLegend";
import {
  zoneKey,
  EXPORT_FORMATS,
  type ExportFormat,
  type NoiseImpactResult,
  type NoiseImpactSite,
} from "../../useNoiseImpact";
import { zoneColor, IMPACT_DASH, formatKmOrTiny } from "../../utils/noiseImpactStyles";

// "SEL_cum" -> "SEL", "SPL_peak" -> "SPL", for the zone row titles.
const metricShort = (metric: string) => (metric.startsWith("SEL") ? "SEL" : "SPL");

const checkIcon = (
  <svg
    className="w-2.5 h-2.5 shrink-0"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

// The Impacts side-panel's content (everything inside <SidePanel>, which
// Map.tsx still renders directly since its open/width/registerTarget props
// are shared across all 5 side panels now). Entry point into the
// parameter-input modal, plus -- once a run has completed -- a small map
// key (source marker / WEA outline) and the zone list: one row per zone
// with its map line swatch (so the list is also the zones' legend), name,
// metric, area, and a visibility toggle that adds/removes its polygon
// from the map (see the noiseImpactSourceRef effect in Map.tsx). The
// other numbers sit in a per-row fold.
function ImpactsPanel({
  paramsOpen,
  onToggleParams,
  showOnMap,
  onToggleShowOnMap,
  result,
  visibleZoneKeys,
  onToggleZone,
  visibleWithoutKeys,
  onToggleWithout,
  siteName,
  siteMeta,
  undefinedCombos,
  starSize,
  setStarSize,
  starOpacity,
  setStarOpacity,
  starSizeOpen,
  setStarSizeOpen,
  onExport,
  exporting,
  exportError,
}: {
  paramsOpen: boolean;
  onToggleParams: () => void;
  showOnMap: boolean;
  onToggleShowOnMap: () => void;
  result: NoiseImpactResult | null;
  visibleZoneKeys: Set<string>;
  onToggleZone: (key: string) => void;
  visibleWithoutKeys: Set<string>;
  onToggleWithout: (key: string) => void;
  siteName: string;
  siteMeta: NoiseImpactSite | undefined;
  undefinedCombos: string[];
  starSize: number;
  setStarSize: (v: number) => void;
  starOpacity: number;
  setStarOpacity: (v: number) => void;
  starSizeOpen: boolean;
  setStarSizeOpen: (v: boolean) => void;
  onExport: (format: ExportFormat) => void;
  exporting: boolean;
  exportError: string | null;
}) {
  // Not-exceeded zones default to folded, to keep the panel short. A run
  // where nothing was exceeded at all doesn't use this fold -- it gets its
  // own "None of the selected thresholds were exceeded" line instead.
  const [notExceededOpen, setNotExceededOpen] = useState(false);
  // Zone rows whose details fold is open (zoneKey).
  const [openDetailKeys, setOpenDetailKeys] = useState<Set<string>>(new Set());
  const toggleDetails = (key: string) =>
    setOpenDetailKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const [undefinedOpen, setUndefinedOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("shp");

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-5 pt-8 pb-4 shrink-0">
        <PanelHeader
          name="Impacts"
          description="Calculate and view noise impacts results."
        />
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleParams}
            className="px-2.5 py-1 rounded-md bg-[#3d5a80] text-white text-[11px] hover:bg-[#2e4460] active:bg-slate-500 shadow-sm active:scale-95 transition"
          >
            {paramsOpen ? "Hide parameters" : "Open parameters"}
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={showOnMap}
            onClick={onToggleShowOnMap}
            title={showOnMap ? "Showing noise-impact zones/star/WEA on the map" : "Hidden from the map"}
            className="flex items-center gap-2"
          >
            <span className="text-[11px] text-slate-500 dark:text-slate-400">Show on map</span>
            <span
              className={`relative shrink-0 w-8 h-[18px] rounded-full border-2 transition-colors ${
                showOnMap ? "border-emerald-500" : "border-slate-400 dark:border-slate-500"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full shadow transition-transform ${
                  showOnMap
                    ? "bg-emerald-500 translate-x-[14px]"
                    : "bg-slate-400 dark:bg-slate-500 translate-x-0"
                }`}
              />
            </span>
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
      {!result && (
        <div className="px-5 pb-6 flex flex-col gap-2">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Open Parameters, fill in the three tabs, then hit Run.
          </p>

          {/* Same section shape the real results use (map key, then
              Zones), muted, so there's a preview of what's about to
              appear here instead of nothing at all. */}
          <div className="flex flex-col gap-2 opacity-40 pointer-events-none">
            <div className="pt-1 text-xs text-slate-400 dark:text-slate-500">
              Source marker/coordinates and WEA outline appear here
            </div>

            <div className="pt-3 pb-1 text-[11px] font-semibold font-geologica text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Zones
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500">
              One row per exceeded threshold, with its map line and area
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="px-5 pb-6 flex flex-col gap-2">
          <NoiseImpactLegend result={result} siteName={siteName} siteMeta={siteMeta} />

          <div className="pt-3 pb-1 text-[11px] font-semibold font-geologica text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Zones
          </div>
          {result.mitigation && (
            <div className="text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 rounded-md px-2 py-1">
              {result.mitigation.label} · −{result.mitigation.il_peak_db} dB peak · −
              {result.mitigation.il_sel_db} dB SEL
            </div>
          )}
          {result.zones.length === 0 ? (
            <div className="text-xs text-slate-400 dark:text-slate-500">
              No zones matched the selected hearing groups/impact types/metrics.
            </div>
          ) : (
            (() => {
              // Split into real zones (a threshold was exceeded somewhere,
              // there's a polygon on the map) vs. not (null geometry --
              // checked, came back clean). Real zones keep the full
              // clickable row (color = severity, toggles the map layer);
              // not-exceeded collapses into one line with a plain
              // checkmark, expandable for the full list, since there's
              // nothing on the map for any of them to toggle anyway.
              // With mitigation, a zone only exceeded without it still gets
              // a row (faded, "Not exceeded with mitigation") so its
              // "without" outline can be shown.
              const exceededZones = result.zones.filter((z) => z.geometry || z.without?.geometry);
              const notExceededZones = result.zones.filter((z) => !z.geometry && !z.without?.geometry);
              const anyMitigated = exceededZones.some((z) => z.geometry);
              return (
                <>
                  {exceededZones.length > 0 && (
                    <>
                      <div className="text-[11px] text-[#7c8ca2] leading-relaxed">
                        Click a zone to show or hide it. Click ▶ for details.
                      </div>
                      <ul className="flex flex-col gap-0.5">
                        {exceededZones.map((z) => {
                          const key = zoneKey(z);
                          const on = visibleZoneKeys.has(key) && !!z.geometry;
                          const withoutOn = visibleWithoutKeys.has(key);
                          const detailsOpen = openDetailKeys.has(key);
                          const color = zoneColor(z.hearing_group, z.impact, z.custom_index);
                          const dash = IMPACT_DASH[z.impact];
                          return (
                            <li
                              key={key}
                              className={`rounded-md transition ${
                                on || detailsOpen ? "bg-slate-50 dark:bg-slate-800" : ""
                              }`}
                            >
                              <div className={`flex items-start ${on ? "" : "opacity-50"}`}>
                                <button
                                  onClick={() => onToggleZone(key)}
                                  disabled={!z.geometry}
                                  className={`flex-1 min-w-0 flex items-start gap-2 pl-2.5 py-1.5 text-left ${
                                    z.geometry ? "cursor-pointer" : "cursor-default"
                                  }`}
                                >
                                  {/* Same line as on the map, so this row
                                      is also the zone's legend entry. */}
                                  <LineSwatch color={color} dash={dash} />
                                  <span className="flex-1 min-w-0">
                                    <span className="block text-xs font-medium leading-snug text-slate-700 dark:text-slate-200">
                                      {z.hearing_group} — {z.impact} ({metricShort(z.metric)})
                                    </span>
                                    <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                                      {z.geometry ? formatKmOrTiny(z.area_km2) : 0} km²
                                    </span>
                                  </span>
                                </button>
                                <button
                                  onClick={() => toggleDetails(key)}
                                  aria-expanded={detailsOpen}
                                  title={detailsOpen ? "Hide details" : "Show details"}
                                  className="shrink-0 px-2 pt-2 pb-1.5 text-[9px] leading-none text-[#7c8ca2] hover:text-[#3d5a80] dark:hover:text-[#98c1d9] transition"
                                >
                                  <span
                                    className={`inline-block transition-transform duration-150 ${
                                      detailsOpen ? "rotate-90" : ""
                                    }`}
                                  >
                                    ▶
                                  </span>
                                </button>
                              </div>
                              {detailsOpen && (
                                // Indented to line up with the title above
                                // (pl-2.5 + 20px swatch + gap-2 = 38px).
                                <div className="pl-[38px] pr-2.5 pb-1.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                                  <div>{z.threshold_db} dB threshold</div>
                                  <div>
                                    {z.geometry ? (
                                      <>
                                        Radius {formatKmOrTiny(z.radius_km)} km
                                        {z.radius_std_km > 0.01 &&
                                          ` (± ${z.radius_std_km.toFixed(1)})`}
                                      </>
                                    ) : (
                                      "Not exceeded with mitigation"
                                    )}
                                  </div>
                                  {z.without && (
                                    <button
                                      onClick={() => onToggleWithout(key)}
                                      disabled={!z.without.geometry}
                                      title="Show the zone without mitigation on the map"
                                      className="w-full flex items-center gap-1.5 pt-0.5 text-left text-[#7c8ca2] enabled:hover:text-[#3d5a80] dark:enabled:hover:text-[#98c1d9] transition"
                                    >
                                      <span
                                        className={`flex items-center justify-center w-2.5 h-2.5 rounded-sm border shrink-0 ${
                                          withoutOn
                                            ? "bg-[#3d5a80] border-[#3d5a80] dark:bg-[#98c1d9] dark:border-[#98c1d9] text-white dark:text-slate-900"
                                            : "border-slate-400 dark:border-slate-500"
                                        }`}
                                      >
                                        {withoutOn && checkIcon}
                                      </span>
                                      {/* Matches the map's lighter (80%)
                                          "without" line. */}
                                      <LineSwatch color={`${color}cc`} dash={dash} />
                                      <span>
                                        Without:{" "}
                                        {z.without.geometry
                                          ? `${formatKmOrTiny(z.without.area_km2)} km² · radius ${formatKmOrTiny(
                                              z.without.radius_km
                                            )} km`
                                          : "not exceeded"}
                                        {z.geometry &&
                                          z.without.area_km2 > 0 &&
                                          ` (−${Math.round(
                                            (1 - z.area_km2 / z.without.area_km2) * 100
                                          )}%)`}
                                      </span>
                                    </button>
                                  )}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                      <div className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed pt-1">
                        Radius is the mean distance from the source, ± is variation by direction.
                        {result.mitigation &&
                          " “Without” is the same run with no mitigation."}
                      </div>
                      {/* All exceeded zones from the last Run, whether or
                          not they're toggled visible above. With
                          mitigation, only the mitigated zones (see
                          analysis/noise_impact.py's export_impact). */}
                      {anyMitigated && (
                      <div className="flex flex-col gap-1.5 pt-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={exportFormat}
                            onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
                            disabled={exporting}
                            aria-label="Download format"
                            className="text-[11px] text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 outline-none focus:border-[#98c1d9] focus:ring-2 focus:ring-[#98c1d9]/20 transition cursor-pointer disabled:cursor-wait"
                          >
                            {EXPORT_FORMATS.map((f) => (
                              <option key={f.value} value={f.value}>
                                {f.label}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => onExport(exportFormat)}
                            disabled={exporting}
                            className="px-2.5 py-1 rounded-md bg-[#3d5a80] text-white text-[11px] hover:bg-[#2e4460] active:bg-slate-500 shadow-sm active:scale-95 transition disabled:opacity-60 disabled:cursor-wait"
                          >
                            {exporting ? "Preparing…" : "Download zones"}
                          </button>
                        </div>
                        <div className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
                          Downloads a .zip with the zones and a README describing the scenario.
                          {result.mitigation && " Zones with mitigation only."}
                        </div>
                        {exportError && (
                          <div className="px-3 py-2 rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-600 dark:text-red-400">
                            {exportError}
                          </div>
                        )}
                      </div>
                      )}
                    </>
                  )}

                  {notExceededZones.length ===
                  0 ? null : exceededZones.length === 0 ? (
                    <div className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {checkIcon}
                      </span>
                      None of the selected thresholds were exceeded anywhere in
                      range.
                    </div>
                  ) : (
                    <div className="mt-1">
                      <CollapsibleHeader
                        open={notExceededOpen}
                        onToggle={() => setNotExceededOpen((p) => !p)}
                        label={`${notExceededZones.length} threshold${
                          notExceededZones.length > 1 ? "s" : ""
                        } not exceeded`}
                        trailing={
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {checkIcon}
                          </span>
                        }
                      />
                      {notExceededOpen && (
                        <ul className="flex flex-col gap-1 pl-1 pb-1">
                          {notExceededZones.map((z) => (
                            <li
                              key={zoneKey(z)}
                              className="text-[11px] text-slate-400 dark:text-slate-500"
                            >
                              {z.hearing_group} — {z.impact} · {z.metric} ·{" "}
                              {z.threshold_db} dB threshold
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </>
              );
            })()
          )}

          {undefinedCombos.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400 rounded-md px-2.5 py-2 text-[11px] mt-2">
              <button
                onClick={() => setUndefinedOpen((p) => !p)}
                className="flex items-start gap-2 w-full text-left leading-relaxed"
              >
                <span
                  className={`text-[9px] shrink-0 mt-0.5 transition-transform duration-150 ${
                    undefinedOpen ? "rotate-90" : ""
                  }`}
                >
                  ▶
                </span>
                <span>
                  Thresholds for the following {undefinedCombos.length} parameter
                  combination{undefinedCombos.length > 1 ? "s" : ""} are not defined:
                </span>
              </button>
              {undefinedOpen && (
                <ul className="mt-1 pl-4 list-disc list-inside leading-relaxed">
                  {undefinedCombos.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
      </div>

      {/* Same spot as the "Change size" section in every other panel
          (Tracks/Moorings/Regions): last flex child, shrink-0, so it's
          pinned at the bottom -- only the results above scroll, this
          never does. */}
      <div className="border-t border-slate-100 dark:border-slate-800 mx-2 mt-2" />
      <div className="px-3 py-3 flex flex-col gap-1 shrink-0">
        <SizeOpacityPanel
          open={starSizeOpen}
          onToggle={() => setStarSizeOpen(!starSizeOpen)}
          preview={
            <span
              className="text-[#3d5a80] dark:text-[#98c1d9] leading-none"
              style={{ fontSize: starSize, opacity: starOpacity }}
            >
              ★
            </span>
          }
          size={starSize}
          onSizeChange={setStarSize}
          sizeMin={6}
          sizeMax={26}
          opacity={starOpacity}
          onOpacityChange={setStarOpacity}
        />
      </div>
    </div>
  );
}

export default ImpactsPanel;

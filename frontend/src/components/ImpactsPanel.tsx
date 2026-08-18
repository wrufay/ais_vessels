import { useState } from "react";
import PanelHeader from "./PanelHeader";
import CollapsibleHeader from "./CollapsibleHeader";
import NoiseImpactLegend from "./NoiseImpactLegend";
import { zoneKey, type NoiseImpactResult, type NoiseImpactSite } from "../useNoiseImpact";
import { IMPACT_COLORS } from "../utils/noiseImpactStyles";

const checkIcon = (
  <svg className="w-2.5 h-2.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

// The Impacts side-panel's content (everything inside <SidePanel>, which
// Map.tsx still renders directly since its open/width/registerTarget props
// are shared across all 5 side panels now). Entry point into the
// parameter-input modal, plus -- once a run has completed -- a legend
// (source marker / WEA outline / one entry per visible zone, mirroring
// the reference plot's own legend box) and the results list: one row per
// zone with a colour swatch, area, and a visibility toggle that
// adds/removes its polygon from the map (see the noiseImpactSourceRef
// effect in Map.tsx).
function ImpactsPanel({
  paramsOpen,
  onToggleParams,
  result,
  visibleZoneKeys,
  onToggleZone,
  siteName,
  siteMeta,
  undefinedCombos,
}: {
  paramsOpen: boolean;
  onToggleParams: () => void;
  result: NoiseImpactResult | null;
  visibleZoneKeys: Set<string>;
  onToggleZone: (key: string) => void;
  siteName: string;
  siteMeta: NoiseImpactSite | undefined;
  undefinedCombos: string[];
}) {
  const [notExceededOpen, setNotExceededOpen] = useState(false);
  const [undefinedOpen, setUndefinedOpen] = useState(false);

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
      <div className="px-5 pt-8 pb-4 shrink-0">
        <PanelHeader
          name="Impacts"
          description="Calculate and view noise impacts results."
        />
        <button
          onClick={onToggleParams}
          className="px-3 py-1.5 rounded-full bg-[#3d5a80] text-white text-xs font-medium hover:bg-[#2e4460] transition"
        >
          {paramsOpen ? "Hide parameters" : "Show parameters"}
        </button>
      </div>

      {!result && (
        <div className="px-5 pb-6 flex flex-col gap-2">
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            A run estimates the underwater sound field from pile driving
            and finds where the level crosses a species' injury or
            disturbance threshold. That boundary is called a "zone."
            Open Parameters, fill in the three tabs, then Run.
          </p>

          {/* Same section shape the real results use (Source/Legend/
              Quantitative results), muted, so there's a preview of what's
              about to appear here instead of nothing at all. */}
          <div className="flex flex-col gap-2 opacity-40 pointer-events-none">
            <div className="pt-1 pb-1 text-[11px] font-semibold font-geologica text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Source
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500">Source location appears here after a run</div>

            <div className="pt-3 pb-1 text-[11px] font-semibold font-geologica text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Legend
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500">Source marker, WEA outline, and zone lines appear here</div>

            <div className="pt-3 pb-1 text-[11px] font-semibold font-geologica text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Quantitative results
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500">Zone area/radius stats appear here, one row per exceeded threshold</div>
          </div>
        </div>
      )}

      {result && (
        <div className="px-5 pb-6 flex flex-col gap-2">
          <div className="pt-1 pb-1 text-[11px] font-semibold font-geologica text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Source
          </div>
          <div className="text-xs text-slate-400 dark:text-slate-500">
            {result.source.lat.toFixed(3)}, {result.source.lon.toFixed(3)}
          </div>
          {result.using_fixture_data && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400 rounded-md px-2.5 py-2 text-[11px] leading-relaxed">
              Synthetic placeholder data, not scientifically meaningful.
            </div>
          )}
          <div className="pt-3 pb-1 text-[11px] font-semibold font-geologica text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Legend
          </div>
          <NoiseImpactLegend
            result={result}
            visibleZoneKeys={visibleZoneKeys}
            siteName={siteName}
            siteMeta={siteMeta}
          />

          <div className="pt-3 pb-1 text-[11px] font-semibold font-geologica text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Quantitative results
          </div>
          {result.zones.length === 0 ? (
            <div className="text-xs text-slate-400 dark:text-slate-500">
              No zones matched the selected hearing groups/impact types/metrics.
            </div>
          ) : (
            (() => {
              // Split into real zones (a threshold was exceeded somewhere,
              // there's a polygon on the map) vs. not (null geometry --
              // checked, came back clean). These read as the same kind of
              // row if left mixed together, and get harder to tell apart
              // from the "undefined combo" amber warning below at a
              // glance -- three different meanings (exceeded / genuinely
              // fine / no data to check) competing for one muted-gray
              // visual language. Splitting them: real zones keep the full
              // clickable row (color = severity, toggles the map layer);
              // not-exceeded collapses into one line with a plain
              // checkmark, expandable for the full list, since there's
              // nothing on the map for any of them to toggle anyway.
              const exceededZones = result.zones.filter((z) => z.geometry);
              const notExceededZones = result.zones.filter((z) => !z.geometry);
              return (
                <>
                  {exceededZones.length > 0 && (
                    <>
                      <ul className="flex flex-col gap-1.5">
                        {exceededZones.map((z) => {
                          const key = zoneKey(z);
                          const on = visibleZoneKeys.has(key);
                          return (
                            <li key={key}>
                              <button
                                onClick={() => onToggleZone(key)}
                                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left transition cursor-pointer ${
                                  on ? "bg-slate-50 dark:bg-slate-800" : "opacity-50"
                                }`}
                              >
                                <span
                                  className="w-2.5 h-2.5 rounded-full shrink-0 mt-0.5 self-start"
                                  style={{ backgroundColor: IMPACT_COLORS[z.impact] ?? "#888" }}
                                />
                                <span className="flex-1 min-w-0">
                                  <span className="block text-xs font-medium text-slate-700 dark:text-slate-200 truncate">
                                    {z.hearing_group} — {z.impact}
                                  </span>
                                  <span className="block text-[11px] text-slate-400 dark:text-slate-500">
                                    {z.metric} · {z.threshold_db} dB threshold
                                  </span>
                                  <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                                    {z.area_km2.toFixed(1)} km² · Ø {(2 * z.radius_km).toFixed(1)} km
                                    {z.radius_std_km > 0.01 && ` (± ${(2 * z.radius_std_km).toFixed(1)})`}
                                  </span>
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                      <div className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed pt-1">
                        Ø is mean diameter (2× mean radius across all directions
                        from the source). ± shows how much that varies by
                        direction, since zones are irregular, not literal
                        circles: the underlying transmission-loss model varies
                        by direction. Same convention the source model's own
                        reference plots use.
                      </div>
                    </>
                  )}

                  {notExceededZones.length === 0 ? null : exceededZones.length === 0 ? (
                    <div className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <span className="text-emerald-600 dark:text-emerald-400">{checkIcon}</span>
                      None of the selected thresholds were exceeded anywhere in range.
                    </div>
                  ) : (
                    <div className="mt-1">
                      <CollapsibleHeader
                        open={notExceededOpen}
                        onToggle={() => setNotExceededOpen((p) => !p)}
                        label={`${notExceededZones.length} threshold${notExceededZones.length > 1 ? "s" : ""} not exceeded`}
                        trailing={<span className="text-emerald-600 dark:text-emerald-400">{checkIcon}</span>}
                      />
                      {notExceededOpen && (
                        <ul className="flex flex-col gap-1 pl-1 pb-1">
                          {notExceededZones.map((z) => (
                            <li key={zoneKey(z)} className="text-[11px] text-slate-400 dark:text-slate-500">
                              {z.hearing_group} — {z.impact} · {z.metric} · {z.threshold_db} dB threshold
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
                <span className={`text-[9px] shrink-0 mt-0.5 transition-transform duration-150 ${undefinedOpen ? "rotate-90" : ""}`}>
                  ▶
                </span>
                <span>
                  No threshold is defined for {undefinedCombos.length} of your selected
                  combination{undefinedCombos.length > 1 ? "s" : ""}. They're not in Noise_Impact_Thresholds.xlsx.
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
  );
}

export default ImpactsPanel;

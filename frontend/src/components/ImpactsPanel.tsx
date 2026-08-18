import PanelHeader from "./PanelHeader";
import NoiseImpactLegend from "./NoiseImpactLegend";
import { zoneKey, type NoiseImpactResult, type NoiseImpactSite } from "../useNoiseImpact";
import { IMPACT_COLORS } from "../utils/noiseImpactStyles";

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
              Synthetic placeholder data — not scientifically meaningful.
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
            <>
              <ul className="flex flex-col gap-1.5">
                {result.zones.map((z) => {
                  const key = zoneKey(z);
                  // A null geometry means the threshold was never exceeded
                  // anywhere in the model domain -- there's nothing on the
                  // map for this row to correspond to, so it's always
                  // muted and never shows the "selected" highlight or the
                  // impact-severity colour (that colour means "this shade
                  // is on the map somewhere," which wouldn't be true here).
                  const on = !!z.geometry && visibleZoneKeys.has(key);
                  return (
                    <li key={key}>
                      <button
                        onClick={() => onToggleZone(key)}
                        disabled={!z.geometry}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left transition ${
                          on ? "bg-slate-50 dark:bg-slate-800" : "opacity-50"
                        } ${!z.geometry ? "cursor-default" : "cursor-pointer"}`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 mt-0.5 self-start"
                          style={{ backgroundColor: z.geometry ? IMPACT_COLORS[z.impact] ?? "#888" : "#cbd5e1" }}
                        />
                        <span className="flex-1 min-w-0">
                          <span className="block text-xs font-medium text-slate-700 dark:text-slate-200 truncate">
                            {z.hearing_group} — {z.impact}
                          </span>
                          <span className="block text-[11px] text-slate-400 dark:text-slate-500">
                            {z.metric} · {z.threshold_db} dB threshold
                          </span>
                          {z.geometry ? (
                            <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                              {z.area_km2.toFixed(1)} km² · Ø {(2 * z.radius_km).toFixed(1)} km
                              {z.radius_std_km > 0.01 && ` (± ${(2 * z.radius_std_km).toFixed(1)})`}
                            </span>
                          ) : (
                            <span className="block text-[11px] text-slate-400 dark:text-slate-500">
                              0 km² — threshold not exceeded anywhere in range
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed pt-1">
                Ø is mean diameter (2×mean radius across all directions from
                the source), ± is its variation by direction — zones are
                irregular, not literal circles, since the underlying
                transmission-loss model varies by direction. Same convention
                as the source model's own reference plots.
              </div>
            </>
          )}

          {undefinedCombos.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400 rounded-md px-2.5 py-2 text-[11px] leading-relaxed mt-2">
              No threshold is defined for {undefinedCombos.length} of your selected
              combination{undefinedCombos.length > 1 ? "s" : ""} — not in Noise_Impact_Thresholds.xlsx:
              <ul className="mt-1 list-disc list-inside">
                {undefinedCombos.slice(0, 5).map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              {undefinedCombos.length > 5 && <div>…and {undefinedCombos.length - 5} more</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ImpactsPanel;

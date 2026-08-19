import { zoneKey, type NoiseImpactResult, type NoiseImpactSite } from "../../useNoiseImpact";
import { IMPACT_COLORS, IMPACT_DASH, formatKmOrTiny } from "../../utils/noiseImpactStyles";
import { regionColor } from "../../utils/mapStyles";

const weaColor = regionColor("WEA").stroke;

// A small inline-SVG line swatch matching a zone's actual map stroke
// (colour + dash pattern) -- same purpose as the boxed legend in
// ns_pile_driving_noise_mapping's own reference plots (see
// visualization/mapping.py's create_map()), rendered here as a normal
// block in the Impacts side panel instead of a floating map overlay.
function LineSwatch({ color, dash }: { color: string; dash?: number[] }) {
  return (
    <svg width="20" height="10" className="shrink-0 mt-0.5" aria-hidden="true">
      <line
        x1="0" y1="5" x2="20" y2="5"
        stroke={color}
        strokeWidth="2"
        strokeDasharray={dash?.join(" ")}
      />
    </svg>
  );
}

// Legend for "impact mode" -- lives in the Impacts side panel (not
// floating over the map, so it doesn't eat map real estate) mirroring
// what the reference plots show in their own legend box: the source
// marker, the Designated WEAs outline, and one line-style entry per
// currently visible zone. Source marker + WEA outline are always on the
// map once a result exists, so they always render here too -- previously
// this returned null outright whenever there were no visible *zones*
// (e.g. every threshold came back not-exceeded), which made the "Legend"
// section header above it render with nothing underneath, reading as
// broken rather than "there's nothing zone-specific to show right now."
function NoiseImpactLegend({
  result,
  visibleZoneKeys,
  siteName,
  siteMeta,
}: {
  result: NoiseImpactResult | null;
  visibleZoneKeys: Set<string>;
  siteName: string;
  siteMeta: NoiseImpactSite | undefined;
}) {
  if (!result) return null;
  const visibleZones = result.zones.filter((z) => z.geometry && visibleZoneKeys.has(zoneKey(z)));

  return (
    <div className="bg-[#3d5a80]/8 dark:bg-[#3d5a80]/20 border border-[#3d5a80]/20 dark:border-[#3d5a80]/30 rounded-md px-3 py-2.5 text-xs leading-snug">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[#3d5a80] dark:text-[#98c1d9] shrink-0" aria-hidden="true">★</span>
        <span className="text-slate-700 dark:text-slate-200">
          {siteName} source{siteMeta ? ` (${siteMeta.src_freq} Hz, ${siteMeta.src_depth} m depth)` : ""}
        </span>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <LineSwatch color={weaColor} />
        <span className="text-slate-700 dark:text-slate-200">Designated WEAs</span>
      </div>
      {visibleZones.length > 0 ? (
        <div className="flex flex-col gap-1.5 pt-1.5 border-t border-[#3d5a80]/20 dark:border-[#3d5a80]/30">
          {visibleZones.map((z) => (
            <div key={zoneKey(z)} className="flex items-start gap-2">
              <LineSwatch color={IMPACT_COLORS[z.impact] ?? "#888"} dash={IMPACT_DASH[z.impact]} />
              <span>
                <span className="block text-slate-700 dark:text-slate-200">{z.hearing_group} — {z.impact}</span>
                <span className="block text-slate-500 dark:text-slate-400">
                  {z.threshold_db} dB · Area {formatKmOrTiny(z.area_km2)} km² · Radius {formatKmOrTiny(z.radius_km, 2)}
                  {z.radius_std_km > 0.01 && ` ± ${z.radius_std_km.toFixed(2)}`} km
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="pt-1.5 border-t border-[#3d5a80]/20 dark:border-[#3d5a80]/30 text-slate-500 dark:text-slate-400">
          No zones currently shown. See Quantitative results below.
        </div>
      )}
    </div>
  );
}

export default NoiseImpactLegend;

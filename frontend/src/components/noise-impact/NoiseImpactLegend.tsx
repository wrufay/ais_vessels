import { type NoiseImpactResult, type NoiseImpactSite } from "../../useNoiseImpact";
import { WEA_EDGE_COLOR } from "../../utils/noiseImpactStyles";
import { regionColor } from "../../utils/mapStyles";

const weaColor = regionColor("WEA").stroke;

// A small inline-SVG line swatch matching a zone's actual map stroke
// (colour + dash pattern) -- same purpose as the boxed legend in
// ns_pile_driving_noise_mapping's own reference plots (see
// visualization/mapping.py's create_map()). Used here for the WEA outline
// and in the Impacts panel's zone list, where each row's swatch doubles as
// that zone's legend entry.
// `edge` draws a 1 px wider line underneath, like the map's line edges.
export function LineSwatch({ color, dash, width = 2, edge }: { color: string; dash?: number[]; width?: number; edge?: string }) {
  return (
    <svg width="20" height="10" className="shrink-0 mt-0.5" aria-hidden="true">
      {edge && (
        <line
          x1="0" y1="5" x2="20" y2="5"
          stroke={edge}
          strokeWidth={width + 1}
          strokeDasharray={dash?.join(" ")}
        />
      )}
      <line
        x1="0" y1="5" x2="20" y2="5"
        stroke={color}
        strokeWidth={width}
        strokeDasharray={dash?.join(" ")}
      />
    </svg>
  );
}

// Map key for "impact mode" -- lives in the Impacts side panel (not
// floating over the map, so it doesn't eat map real estate): the source
// marker and the Designated WEAs outline, both always on the map once a
// result exists. Zones have no entries here -- each row in the panel's
// zone list carries its own line swatch instead (the old separate zone
// legend repeated the list's names and numbers).
function NoiseImpactLegend({
  result,
  siteName,
  siteMeta,
}: {
  result: NoiseImpactResult | null;
  siteName: string;
  siteMeta: NoiseImpactSite | undefined;
}) {
  if (!result) return null;

  return (
    <div className="bg-[#3d5a80]/8 dark:bg-[#3d5a80]/20 border border-[#3d5a80]/20 dark:border-[#3d5a80]/30 rounded-md px-3 py-2.5 text-xs leading-snug">
      <div className="flex items-start gap-2 mb-1.5">
        <span className="text-[#3d5a80] dark:text-[#98c1d9] shrink-0" aria-hidden="true">★</span>
        <span>
          <span className="block text-slate-700 dark:text-slate-200">
            {siteName} source{siteMeta ? ` (${siteMeta.src_freq} Hz, ${siteMeta.src_depth} m depth)` : ""}
          </span>
          <span className="block text-slate-500 dark:text-slate-400">
            {result.source.lat.toFixed(3)}, {result.source.lon.toFixed(3)}
          </span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <LineSwatch color={weaColor} width={1.5} edge={WEA_EDGE_COLOR} />
        <span className="text-slate-700 dark:text-slate-200">Designated WEAs</span>
      </div>
    </div>
  );
}

export default NoiseImpactLegend;

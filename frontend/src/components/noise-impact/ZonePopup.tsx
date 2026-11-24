import { getDistance } from "ol/sphere";
import MapPopup from "../MapPopup";
import PopupRow from "../PopupRow";
import { LineSwatch } from "./NoiseImpactLegend";
import type { NoiseImpactZone } from "../../useNoiseImpact";
import { zoneColor, IMPACT_DASH, formatKmOrTiny } from "../../utils/noiseImpactStyles";

const metricShort = (metric: string) => (metric.startsWith("SEL") ? "SEL" : "SPL");

// The card shown when a noise-impact zone is clicked on the map: the
// smallest zone under the click (see zoneFeaturesAt in Map.tsx). Several
// zones only when they have exactly the same shape, so they share the
// size numbers and only their names and thresholds differ.
function ZonePopup({
  x,
  y,
  zones,
  lon,
  lat,
  source,
}: {
  x: number;
  y: number;
  zones: NoiseImpactZone[];
  // The clicked spot and the run's source, for "From source".
  lon: number;
  lat: number;
  source: { lon: number; lat: number };
}) {
  const z = zones[0];
  const km = getDistance([source.lon, source.lat], [lon, lat]) / 1000;
  return (
    <MapPopup
      x={x}
      y={y}
      selectable
      title={zones.map((zone) => (
        <div key={`${zone.hearing_group}|${zone.impact}|${zone.metric}`} className="flex items-start gap-2">
          <LineSwatch
            color={zoneColor(zone.hearing_group, zone.impact, zone.custom_index)}
            dash={IMPACT_DASH[zone.impact]}
          />
          <span>
            {zone.hearing_group} — {zone.impact} ({metricShort(zone.metric)})
          </span>
        </div>
      ))}
    >
      <PopupRow label="Threshold" labelWidth="w-20">
        {zones.map((zone) => `${zone.threshold_db} dB`).join(" · ")}
      </PopupRow>
      <PopupRow label="Area" labelWidth="w-20">
        {z.geometry ? `${formatKmOrTiny(z.area_km2)} km²` : "Not exceeded with mitigation"}
      </PopupRow>
      {z.geometry && (
        <PopupRow label="Radius" labelWidth="w-20">
          {formatKmOrTiny(z.radius_km)} km
          {z.radius_std_km > 0.01 && ` (± ${z.radius_std_km.toFixed(1)})`}
        </PopupRow>
      )}
      {z.without?.geometry && (
        <PopupRow label="Without" labelWidth="w-20">
          {formatKmOrTiny(z.without.area_km2)} km²
          {z.geometry &&
            z.without.area_km2 > 0 &&
            ` (−${Math.round((1 - z.area_km2 / z.without.area_km2) * 100)}%)`}
        </PopupRow>
      )}
      <PopupRow label="From source" labelWidth="w-20">
        {km.toFixed(1)} km
      </PopupRow>
    </MapPopup>
  );
}

export default ZonePopup;

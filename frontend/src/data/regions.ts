// These are the ready-made regions shown in the app -- Critical Habitat
// Areas and Wind Energy Areas -- the shapes people can click on instead of
// drawing their own. The actual map shapes live below in cha_regions.json
// and wea_regions.json, in a standard mapping format called GeoJSON. Even
// though the file ends in ".json", you can open and edit these in mapping
// tools like QGIS or geojson.io, same as any other GeoJSON file -- much
// easier than typing coordinates by hand. (It's named ".json" and not
// ".geojson" because Vite/TypeScript only auto-load data files ending in
// ".json".)
//
// This file just takes that raw shape data and simplifies it into the
// { name, geojson } format the rest of the app expects. To add or edit a
// region: edit cha_regions.json or wea_regions.json directly -- each region
// is a "Feature" with a "properties.name" (this is what shows up in the
// app's region list) and a "geometry" (the actual shape).

import chaFeatures from "./cha_regions.json";
import weaFeatures from "./wea_regions.json";

export interface PresetRegion {
  name: string;
  geojson: object;
}

interface GeoJSONFeatureCollection {
  features: { properties: { name: string }; geometry: object }[];
}

function toPresetRegions(fc: GeoJSONFeatureCollection): PresetRegion[] {
  return fc.features.map((f) => ({ name: f.properties.name, geojson: f.geometry }));
}

// Critical Habitat Regions
export const CHA_REGIONS: PresetRegion[] = toPresetRegions(chaFeatures as GeoJSONFeatureCollection);

// Wind energy areas
export const WEA_REGIONS: PresetRegion[] = toPresetRegions(weaFeatures as GeoJSONFeatureCollection);

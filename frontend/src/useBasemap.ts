import { useEffect, useRef, useState } from "react";
import type TileLayer from "ol/layer/Tile";
import XYZ from "ol/source/XYZ";

export const BASEMAPS = [
  { id: "esri-street",     label: "World Street Map",    tooltip: "Road and transit detail for identifying ports and coastal features.",                                      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",     maxZoom: 18, attributions: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>' },
  { id: "esri-imagery",    label: "World Imagery",       tooltip: "Satellite photography for visualising real ocean and coastal conditions.",                                          url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",        maxZoom: 18, attributions: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>' },
  { id: "esri-ocean",      label: "Ocean / Bathymetry",  tooltip: "Seabed depth and ocean labels for correlating tracks with underwater topography.",                              url: "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}", maxZoom: 13, attributions: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>' },
  { id: "esri-topo",       label: "Topo Map",            tooltip: "Topographic contours and relief shading for coastal terrain context.",                                        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",       maxZoom: 18, attributions: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>' },
  { id: "esri-light-gray", label: "Light Gray",          tooltip: "Minimal canvas that keeps focus on data layers without visual clutter.",                                       url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", maxZoom: 16, attributions: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>' },
  { id: "esri-dark-gray",  label: "Dark Gray",           tooltip: "Dark canvas with high contrast for noise, track, and density overlays.",                                      url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", maxZoom: 16, attributions: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>' },
  { id: "esri-natgeo",     label: "National Geographic", tooltip: "Classic cartographic style suited for presentations and reports.",                                         url: "https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}",     maxZoom: 16, attributions: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>' },
];

// Owns which Esri basemap tile source is active (plus the picker's open/
// closed state), and swaps the already-built basemap TileLayer's source
// whenever the selection changes. Same split as useBathymetry: the
// TileLayer itself is still built once in Map.tsx's map-init effect (it's
// the first layer in the map's layer list), which assigns
// basemapLayerRef.current there -- this hook only owns the reactive part.
export function useBasemap() {
  const basemapLayerRef = useRef<TileLayer | null>(null);
  const [basemap, setBasemap] = useState("esri-ocean");
  const [basemapOpen, setBasemapOpen] = useState(false);

  useEffect(() => {
    if (!basemapLayerRef.current) return;
    const bm = BASEMAPS.find((b) => b.id === basemap);
    if (!bm) return;
    basemapLayerRef.current.setSource(
      new XYZ({ url: bm.url, attributions: bm.attributions, maxZoom: bm.maxZoom })
    );
  }, [basemap]);

  return { basemapLayerRef, basemap, setBasemap, basemapOpen, setBasemapOpen };
}

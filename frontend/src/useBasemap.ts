import { useEffect, useRef, useState } from "react";
import TileLayer from "ol/layer/Tile";
import XYZ from "ol/source/XYZ";
import type ImageTile from "ol/ImageTile";

const API = import.meta.env.VITE_API_URL ?? "";

export const BASEMAPS = [
  { id: "esri-street",     label: "World Street Map",    tooltip: "Road and transit detail for identifying ports and coastal features.",                                      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",     maxZoom: 18, attributions: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>' },
  { id: "esri-imagery",    label: "World Imagery",       tooltip: "Satellite photography for visualising real ocean and coastal conditions.",                                          url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",        maxZoom: 18, attributions: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>' },
  { id: "esri-ocean",      label: "Ocean / Bathymetry",  tooltip: "Seabed depth and ocean labels for correlating tracks with underwater topography.",                              url: "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}", maxZoom: 13, attributions: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>', fillGaps: true },
  { id: "esri-topo",       label: "Topo Map",            tooltip: "Topographic contours and relief shading for coastal terrain context.",                                        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",       maxZoom: 18, attributions: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>' },
  { id: "esri-light-gray", label: "Light Gray",          tooltip: "Minimal canvas that keeps focus on data layers without visual clutter.",                                       url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", maxZoom: 16, attributions: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>' },
  { id: "esri-dark-gray",  label: "Dark Gray",           tooltip: "Dark canvas with high contrast for noise, track, and density overlays.",                                      url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", maxZoom: 16, attributions: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>' },
  { id: "esri-natgeo",     label: "National Geographic", tooltip: "Classic cartographic style suited for presentations and reports.",                                         url: "https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}",     maxZoom: 16, attributions: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>' },
];

type Basemap = (typeof BASEMAPS)[number];

// Esri sends a "Map data not yet available" picture for tiles it doesn't
// have. The Ocean map only has close-up tiles near some coasts (around much
// of the Gulf and Scotian Shelf it stops at zoom 10, below our maxZoom 13).
// For a basemap with fillGaps, blankTile=false makes Esri answer "no tile"
// instead, and the layer preloads tiles up to 3 zoom levels lower (13 -> 10)
// so it can fill the gap with the closest real tile, stretched.
export function basemapSource(bm: Basemap) {
  return new XYZ({
    url: bm.fillGaps ? `${bm.url}?blankTile=false` : bm.url,
    attributions: bm.attributions,
    maxZoom: bm.maxZoom,
  });
}
export const basemapPreload = (bm: Basemap) => (bm.fillGaps ? 3 : 0);

const OCEAN = BASEMAPS.find((b) => b.id === "esri-ocean")!;
const EMPTY_TILE = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

// Our own zoom 11-12 seabed tiles (pipeline/make_bathymetry_tiles.py, served
// by the backend), drawn just above the Ocean basemap. Stretching Esri's
// zoom-10 tile (above) gets blurry, so wherever Esri has no closer tile of
// its own, this layer shows ours instead; where Esri has one, it stays empty.
// To know which, each tile first loads Esri's tile for the same spot -- the
// basemap has just asked for that same URL, so the browser usually has it.
// Land is see-through in our tiles, so land always comes from Esri.
export function oceanFillLayer() {
  return new TileLayer({
    minZoom: 10, // only when zoomed in past Esri's offshore tiles
    visible: false,
    source: new XYZ({
      url: `${API}/api/bathy-tiles/{z}/{x}/{y}.webp`,
      minZoom: 11,
      maxZoom: 12, // the data has a point every ~100 m; zoom 12 is stretched further in
      tileLoadFunction: (tile, src) => {
        const [z, x, y] = tile.getTileCoord();
        const img = (tile as ImageTile).getImage() as HTMLImageElement;
        const esri = new Image();
        esri.onload = () => { img.src = EMPTY_TILE; };
        esri.onerror = () => { img.src = src; };
        esri.src = basemapSource(OCEAN).getUrls()![0].replace("{z}", `${z}`).replace("{x}", `${x}`).replace("{y}", `${y}`);
      },
    }),
  });
}

// Owns which Esri basemap tile source is active (plus the picker's open/
// closed state), and swaps the already-built basemap TileLayer's source
// whenever the selection changes. Same split as useBathymetry: the
// TileLayer itself is still built once in Map.tsx's map-init effect (it's
// the first layer in the map's layer list), which assigns
// basemapLayerRef.current there -- this hook only owns the reactive part.
export function useBasemap() {
  const basemapLayerRef = useRef<TileLayer | null>(null);
  const oceanFillLayerRef = useRef<TileLayer | null>(null);
  const [basemap, setBasemap] = useState("esri-ocean");
  const [basemapOpen, setBasemapOpen] = useState(true);

  useEffect(() => {
    if (!basemapLayerRef.current) return;
    const bm = BASEMAPS.find((b) => b.id === basemap);
    if (!bm) return;
    basemapLayerRef.current.setPreload(basemapPreload(bm));
    basemapLayerRef.current.setSource(basemapSource(bm));
    oceanFillLayerRef.current?.setVisible(bm.id === OCEAN.id);
  }, [basemap]);

  return { basemapLayerRef, oceanFillLayerRef, basemap, setBasemap, basemapOpen, setBasemapOpen };
}

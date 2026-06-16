import { useEffect, useRef, useState } from "react";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import XYZ from "ol/source/XYZ";
import { fromLonLat } from "ol/proj";
import Feature, { type FeatureLike } from "ol/Feature";
import LineString from "ol/geom/LineString";
import Point from "ol/geom/Point";
import OLPolygon from "ol/geom/Polygon";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { Style, Stroke, Circle as CircleStyle, Fill, Text } from "ol/style";
import Draw from "ol/interaction/Draw";
import GeoJSON from "ol/format/GeoJSON";
import "ol/ol.css";

const API = import.meta.env.VITE_API_URL ?? "";

// ---- Preset Regions ----
interface PresetRegion {
  name: string;
  geojson: object;
}

const CHA_REGIONS: PresetRegion[] = [
  {
    name: "Roseway Basin",
    geojson: {
      type: "Polygon",
      coordinates: [
        [
          [-64.9167, 43.2667],
          [-64.9833, 42.7833],
          [-65.5167, 42.65],
          [-66.0833, 42.8667],
          [-64.9167, 43.2667],
        ],
      ],
    },
  },
  {
    name: "Grand Manan Basin",
    geojson: {
      type: "Polygon",
      coordinates: [
        [
          [-66.45, 44.8167],
          [-66.2833, 44.7833],
          [-66.2833, 44.6667],
          [-66.3667, 44.55],
          [-66.5, 44.4833],
          [-66.6167, 44.4833],
          [-66.6167, 44.7],
          [-66.45, 44.8167],
        ],
      ],
    },
  },
];

// TODO: add WEA coordinates when available
const WEA_REGIONS: PresetRegion[] = [];

interface Vessel {
  mmsi: number;
  vessel_name: string | null;
  ship_type: string | number | null;
  source: string;
}

interface RoutePoint {
  time: number;
  latitude: number;
  longitude: number;
  sog: number | null;
  cog: number | null;
  source: string;
}

interface RegionStats {
  total_positions: number;
  unique_vessels: number;
  days: { date: string; vessel_counts: Record<string, number> }[];
  plots: { vessel_types?: string; speed_overall?: string };
}

const TYPE_COLORS: Record<string, string> = {
  cargo: "#ee6c4d",
  tanker: "#3d5a80",
  fishing: "#639fab",
  passenger: "#293241",
  "search & rescue": "#e0fbfc",
  other: "#afa98d",
  unknown: "#cbd2d9",
};

function classifyType(code: string | number | null): string {
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

function formatTime(epochSeconds: number): string {
  return (
    new Date(epochSeconds * 1000).toISOString().replace("T", " ").slice(0, 19) +
    " UTC"
  );
}

function makeFeatureStyle(showStart: boolean, showEnd: boolean) {
  return function (feature: FeatureLike): Style {
    const geomType = feature.getGeometry()?.getType();
    if (geomType === "LineString") {
      // can change the colour of connecting line here (currently powder blue)
      return new Style({ stroke: new Stroke({ color: "#98c1d9", width: 2 }) });
    }
    const isStart = feature.get("isStart") as boolean;
    const isEnd = feature.get("isEnd") as boolean;
    if (isStart && !showStart) return new Style({});
    if (isEnd && !showEnd) return new Style({});
    if (isStart) {
      return new Style({
        image: new CircleStyle({
          radius: 7,
          fill: new Fill({ color: "#98c1d9" }),
          stroke: new Stroke({ color: "#fff", width: 2.5 }),
        }),
      });
    }
    if (isEnd) {
      return new Style({
        image: new CircleStyle({
          radius: 7,
          fill: new Fill({ color: "#ee6c4d" }),
          stroke: new Stroke({ color: "#fff", width: 2.5 }),
        }),
      });
    }
    const sog = (feature.get("sog") as number) || 0;
    const color = sog > 10 ? "#ee6c4d" : sog > 3 ? "#ffc857" : "#0a8754";
    return new Style({
      image: new CircleStyle({ radius: 4, fill: new Fill({ color }) }),
    });
  };
}

function regionColor(type: string) {
  if (type === "WEA") return { stroke: "#ee6c4d", fill: "rgba(238,108,77,0.07)", hoverFill: "rgba(238,108,77,0.15)" };
  if (type === "Uploaded") return { stroke: "#9b59b6", fill: "rgba(155,89,182,0.07)", hoverFill: "rgba(155,89,182,0.15)" };
  return { stroke: "#3d5a80", fill: "rgba(61,90,128,0.07)", hoverFill: "rgba(61,90,128,0.15)" };
}

function chaStyle(feature: FeatureLike): Style {
  const name = feature.get("name") as string;
  const c = regionColor(feature.get("regionType") as string);
  return new Style({
    stroke: new Stroke({ color: c.stroke, width: 2 }),
    fill: new Fill({ color: c.fill }),
    text: new Text({
      text: name,
      font: "bold 11px sans-serif",
      fill: new Fill({ color: "#293241" }),
      stroke: new Stroke({ color: "#fff", width: 3 }),
      overflow: true,
    }),
  });
}

function chaHoverStyle(feature: FeatureLike): Style {
  const name = feature.get("name") as string;
  const c = regionColor(feature.get("regionType") as string);
  return new Style({
    stroke: new Stroke({ color: c.stroke, width: 2.5 }),
    fill: new Fill({ color: c.hoverFill }),
    text: new Text({
      text: name,
      font: "bold 11px sans-serif",
      fill: new Fill({ color: "#293241" }),
      stroke: new Stroke({ color: "#fff", width: 3 }),
      overflow: true,
    }),
  });
}

function downloadPlot(b64: string, name: string) {
  const a = document.createElement("a");
  a.href = `data:image/png;base64,${b64}`;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function ShipMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<Map | null>(null);
  const sourceRef = useRef(new VectorSource());
  const drawSourceRef = useRef(new VectorSource());
  const chaSourceRef = useRef(new VectorSource());
  const drawRef = useRef<Draw | null>(null);
  const routeLayerRef = useRef<VectorLayer | null>(null);
  const chaLayerRef = useRef<VectorLayer | null>(null);

  interface Popup {
    x: number;
    y: number;
    time: number;
    lat: number;
    lon: number;
    sog: number | null;
    cog: number | null;
    source: string;
    isStart: boolean;
    isEnd: boolean;
  }

  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Vessel | null>(null);
  const [start, setStart] = useState("2025-08-01");
  const [end, setEnd] = useState("2025-08-31");
  const [pointCount, setPointCount] = useState<number | null>(null);
  const [popup, setPopup] = useState<Popup | null>(null);
  const [regionStats, setRegionStats] = useState<RegionStats | null>(null);
  const [regionLoading, setRegionLoading] = useState(false);
  const [regionTime, setRegionTime] = useState<number | null>(null);
  const [regionName, setRegionName] = useState<string | null>(null);
  const [drawnPolygon, setDrawnPolygon] = useState<object | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [hoveredCha, setHoveredCha] = useState<string | null>(null);
  const [showVesselPanel, setShowVesselPanel] = useState(false);
  const [showRegionPanel, setShowRegionPanel] = useState(false);
  const [selectedRegionNames, setSelectedRegionNames] = useState<Set<string>>(new Set());
  const [uploadedRegions, setUploadedRegions] = useState<PresetRegion[]>([]);

  useEffect(() => {
    const fmt = new GeoJSON();
    chaSourceRef.current.clear();
    const allRegions = [
      ...CHA_REGIONS.map((r) => ({ ...r, regionType: "CHA" })),
      ...WEA_REGIONS.map((r) => ({ ...r, regionType: "WEA" })),
      ...uploadedRegions.map((r) => ({ ...r, regionType: "Uploaded" })),
    ];
    allRegions
      .filter((r) => selectedRegionNames.has(r.name))
      .forEach((r) => {
        const geom = fmt.readGeometry(r.geojson, {
          dataProjection: "EPSG:4326",
          featureProjection: "EPSG:3857",
        }) as OLPolygon;
        const f = new Feature({ geometry: geom, name: r.name, chaRegion: r, regionType: r.regionType });
        chaSourceRef.current.addFeature(f);
      });
  }, [selectedRegionNames, uploadedRegions]);

  useEffect(() => {
    if (!mapRef.current) return;

    const chaLayer = new VectorLayer({
      source: chaSourceRef.current,
      style: chaStyle,
    });
    chaLayerRef.current = chaLayer;

    const routeLayer = new VectorLayer({
      source: sourceRef.current,
      style: makeFeatureStyle(true, true),
    });
    routeLayerRef.current = routeLayer;

    const map = new Map({
      target: mapRef.current,
      layers: [
        new TileLayer({
          source: new XYZ({
            url: "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}",
            attributions: "Tiles © Esri",
          }),
        }),
        chaLayer,
        routeLayer,
        new VectorLayer({
          source: drawSourceRef.current,
          style: new Style({
            stroke: new Stroke({ color: "#ee6c4d", width: 2 }),
            fill: new Fill({ color: "rgba(238,108,77,0.1)" }),
          }),
        }),
      ],
      view: new View({
        center: fromLonLat([-63.5, 44.5]),
        zoom: 6,
      }),
    });

    map.on("click", (e) => {
      // check CHA click first
      let chaClicked = false;
      map.forEachFeatureAtPixel(e.pixel, (feature) => {
        const cha = feature.get("chaRegion") as PresetRegion | undefined;
        if (cha) {
          chaClicked = true;
          runChaAnalysis(cha);
          return true;
        }
      });
      if (chaClicked) return;

      // then vessel point click
      map.forEachFeatureAtPixel(e.pixel, (feature) => {
        if (feature.getGeometry()?.getType() !== "Point") return;
        if (feature.get("chaRegion")) return;
        setPopup({
          x: e.pixel[0],
          y: e.pixel[1],
          time: feature.get("time"),
          lat: feature.get("lat"),
          lon: feature.get("lon"),
          sog: feature.get("sog"),
          cog: feature.get("cog"),
          source: feature.get("source"),
          isStart: feature.get("isStart") ?? false,
          isEnd: feature.get("isEnd") ?? false,
        });
        return true;
      }) ?? setPopup(null);
    });

    // hover cursor on CHA polygons
    map.on("pointermove", (e) => {
      let overCha = false;
      map.forEachFeatureAtPixel(e.pixel, (feature) => {
        if (feature.get("chaRegion")) {
          overCha = true;
          const name = feature.get("name") as string;
          setHoveredCha(name);
          (feature as Feature).setStyle(chaHoverStyle(feature));
          return true;
        }
      });
      if (!overCha) {
        setHoveredCha(null);
        chaSourceRef.current
          .getFeatures()
          .forEach((f) => f.setStyle(undefined));
      }
      map.getTargetElement().style.cursor = overCha ? "pointer" : "";
    });

    mapObj.current = map;
    return () => map.setTarget(undefined);
  }, []);

  useEffect(() => {
    fetch(`${API}/api/vessels`)
      .then((r) => r.json())
      .then((d) => setVessels(d.vessels || []))
      .catch(console.error);
  }, []);

  function toggleRegion(name: string) {
    setSelectedRegionNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const raw = JSON.parse(evt.target?.result as string);
        let geometry = raw;
        if (raw.type === "FeatureCollection") geometry = raw.features[0]?.geometry;
        else if (raw.type === "Feature") geometry = raw.geometry;
        const name = file.name.replace(/\.(geojson|json)$/i, "");
        setUploadedRegions((prev) => [...prev, { name, geojson: geometry }]);
        setSelectedRegionNames((prev) => new Set([...prev, name]));
      } catch {
        alert("Invalid GeoJSON file");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function runChaAnalysis(cha: PresetRegion) {
    setRegionLoading(true);
    setRegionStats(null);
    setRegionTime(null);
    setRegionName(cha.name);
    setDrawnPolygon(null);
    drawSourceRef.current.clear();
    const t0 = performance.now();
    fetch(`${API}/api/analysis/region`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ polygon: cha.geojson, start, end }),
    })
      .then((r) => r.json())
      .then((d: RegionStats) => {
        setRegionStats(d);
        setRegionTime(Math.round(performance.now() - t0));
        setShowResults(true);
      })
      .catch(console.error)
      .finally(() => setRegionLoading(false));
  }

  function loadRoute(vessel = selected) {
    if (!vessel) return;
    setPointCount(null);
    sourceRef.current.clear();

    const params = new URLSearchParams({
      start: `${start}T00:00:00`,
      end: `${end}T23:59:59`,
    });

    fetch(`${API}/api/vessel/${vessel.mmsi}/route?${params}`)
      .then((r) => r.json())
      .then((data: { points: RoutePoint[] }) => {
        const pts = data.points || [];
        setPointCount(pts.length);
        if (pts.length === 0) return;

        const coords = pts.map((p) => fromLonLat([p.longitude, p.latitude]));
        sourceRef.current.addFeature(
          new Feature({ geometry: new LineString(coords) })
        );

        pts.forEach((p, i) => {
          const f = new Feature({
            geometry: new Point(fromLonLat([p.longitude, p.latitude])),
            sog: p.sog,
            cog: p.cog,
            time: p.time,
            lat: p.latitude,
            lon: p.longitude,
            source: p.source,
            isStart: i === 0,
            isEnd: i === pts.length - 1,
          });
          sourceRef.current.addFeature(f);
        });

        const extent = sourceRef.current.getExtent();
        if (extent)
          mapObj.current!.getView().fit(extent, {
            padding: [60, 60, 60, 60],
            maxZoom: 12,
            duration: 800,
          });
      })
      .catch(console.error);
  }

  function startDrawing() {
    if (!mapObj.current) return;
    if (drawRef.current) mapObj.current.removeInteraction(drawRef.current);
    setDrawnPolygon(null);
    setRegionStats(null);
    setRegionName(null);
    setDrawing(true);

    drawSourceRef.current.clear();
    const draw = new Draw({
      source: drawSourceRef.current,
      type: "Polygon",
      stopClick: true,
    });
    draw.on("drawend", (e) => {
      const fmt = new GeoJSON();
      const geojson = fmt.writeGeometryObject(e.feature.getGeometry()!, {
        dataProjection: "EPSG:4326",
        featureProjection: "EPSG:3857",
      });
      setDrawnPolygon(geojson);
      setDrawing(false);
      mapObj.current!.removeInteraction(draw);
      drawRef.current = null;
    });

    drawRef.current = draw;
    mapObj.current.addInteraction(draw);
  }

  function cancelDrawing() {
    if (mapObj.current && drawRef.current) {
      mapObj.current.removeInteraction(drawRef.current);
      drawRef.current = null;
    }
    drawSourceRef.current.clear();
    setDrawing(false);
  }

  function clearRegion() {
    drawSourceRef.current.clear();
    setDrawnPolygon(null);
    setRegionStats(null);
    setRegionTime(null);
    setRegionName(null);
  }

  function loadRegionStats() {
    if (!drawnPolygon) return;
    setRegionLoading(true);
    setRegionStats(null);
    setRegionTime(null);
    setRegionName("Custom Region");
    const t0 = performance.now();
    fetch(`${API}/api/analysis/region`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ polygon: drawnPolygon, start, end }),
    })
      .then((r) => r.json())
      .then((d: RegionStats) => {
        setRegionStats(d);
        setRegionTime(Math.round(performance.now() - t0));
        setShowResults(true);
      })
      .catch(console.error)
      .finally(() => setRegionLoading(false));
  }

  const filtered = vessels.filter((v) => {
    const q = search.toLowerCase();
    return (
      String(v.mmsi).includes(q) ||
      (v.vessel_name || "").toLowerCase().includes(q) ||
      String(v.ship_type || "")
        .toLowerCase()
        .includes(q)
    );
  });

  return (
    <div className="relative w-full h-screen overflow-hidden">
      {/* Map — full screen */}
      <div ref={mapRef} className="absolute inset-0" />

      {/* Drawing hint */}
      {drawing && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-white/95 backdrop-blur-md rounded-full shadow-lg ring-1 ring-slate-900/5 px-5 py-2.5 text-xs text-slate-600 flex items-center gap-3">
          <span>Click to add points · double-click to finish</span>
          <button
            onClick={cancelDrawing}
            className="text-slate-400 hover:text-slate-700 font-medium transition"
          >
            Cancel
          </button>
        </div>
      )}

      {/* CHA hover tooltip */}
      {hoveredCha && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 bg-[#293241] text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-lg pointer-events-none">
          {hoveredCha} — click to analyse
        </div>
      )}

      {/* Region loading indicator */}
      {regionLoading && regionName && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-white/95 backdrop-blur-md rounded-full shadow-lg ring-1 ring-slate-900/5 px-4 py-2 text-xs text-slate-600 flex items-center gap-2">
          <span className="w-3 h-3 rounded-full border-2 border-[#3d5a80] border-t-transparent animate-spin" />
          Analysing {regionName}…
        </div>
      )}

      {/* Left icon bar */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-3">
        {/* Vessels */}
        <div className="group relative">
          <button
            onClick={() => { setShowVesselPanel((p) => !p); setShowRegionPanel(false); }}
            className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition ${
              showVesselPanel
                ? "bg-[#293241] ring-2 ring-white/60"
                : "bg-[#3d5a80] hover:bg-[#293241]"
            } text-white`}
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <circle cx="3" cy="6" r="1" fill="currentColor" stroke="none" />
              <circle cx="3" cy="12" r="1" fill="currentColor" stroke="none" />
              <circle cx="3" cy="18" r="1" fill="currentColor" stroke="none" />
            </svg>
          </button>
          <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-slate-800 text-white text-xs font-medium px-2.5 py-1 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none">
            Vessels
          </div>
        </div>

        {/* Regions */}
        <div className="group relative">
          <button
            onClick={() => {
              setShowRegionPanel((p) => !p);
              setShowVesselPanel(false);
            }}
            className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition ${
              showRegionPanel
                ? "bg-[#293241] ring-2 ring-white/60"
                : "bg-[#3d5a80] hover:bg-[#293241]"
            } text-white`}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="3,6 9,3 15,6 21,3 21,18 15,21 9,18 3,21" />
            </svg>
          </button>
          <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-slate-800 text-white text-xs font-medium px-2.5 py-1 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none">
            Regions
          </div>
        </div>

        {/* Draw Region */}
        <div className="group relative">
          <button
            onClick={drawing ? cancelDrawing : startDrawing}
            className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition text-white ${
              drawing
                ? "bg-[#ee6c4d] hover:bg-[#c4462a]"
                : "bg-[#3d5a80] hover:bg-[#293241]"
            }`}
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="12,3 20.5,8.5 20.5,15.5 12,21 3.5,15.5 3.5,8.5" />
            </svg>
          </button>
          <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-slate-800 text-white text-xs font-medium px-2.5 py-1 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none">
            {drawing ? "Cancel Drawing" : "Draw Region"}
          </div>
        </div>

        {/* Analyse (contextual) */}
        {drawnPolygon && !drawing && (
          <div className="group relative">
            <button
              onClick={loadRegionStats}
              disabled={regionLoading}
              className="w-12 h-12 rounded-full bg-[#98c1d9] text-white shadow-lg flex items-center justify-center hover:bg-[#7aadca] disabled:opacity-50 transition"
            >
              {regionLoading ? (
                <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              ) : (
                <svg
                  className="w-5 h-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                  <line x1="2" y1="20" x2="22" y2="20" />
                </svg>
              )}
            </button>
            <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-slate-800 text-white text-xs font-medium px-2.5 py-1 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none">
              Analyse Region
            </div>
          </div>
        )}

        {/* View Results (contextual) */}
        {regionStats && !regionLoading && (
          <div className="group relative">
            <button
              onClick={() => setShowResults(true)}
              className="w-12 h-12 rounded-full bg-[#3d5a80] text-white shadow-lg flex items-center justify-center hover:bg-[#293241] transition"
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
            <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-slate-800 text-white text-xs font-medium px-2.5 py-1 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none">
              View Results
            </div>
          </div>
        )}

        {/* Clear Region (contextual) */}
        {drawnPolygon && (
          <div className="group relative">
            <button
              onClick={clearRegion}
              className="w-12 h-12 rounded-full bg-slate-500 text-white shadow-lg flex items-center justify-center hover:bg-slate-600 transition"
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
            </button>
            <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-slate-800 text-white text-xs font-medium px-2.5 py-1 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none">
              Clear Region
            </div>
          </div>
        )}
      </div>

      {/* Vessel panel — slides in from the right */}
      <div
        className={`absolute right-0 top-0 h-full w-72 bg-white z-20 flex flex-col shadow-xl transition-transform duration-200 ${
          showVesselPanel ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="px-5 pt-8 pb-4 shrink-0">
          <div className="grid grid-cols-2 gap-2 mb-4">
            <label className="flex flex-col gap-1">
              <span className="text-slate-400 text-xs font-medium uppercase tracking-wide">
                Start
              </span>
              <input
                type="date"
                className="bg-slate-50 border border-transparent rounded-xl px-3 py-2 text-sm focus:outline-none focus:bg-white focus:border-[#98c1d9] focus:ring-2 focus:ring-[#98c1d9]/20 transition"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-slate-400 text-xs font-medium uppercase tracking-wide">
                End
              </span>
              <input
                type="date"
                className="bg-slate-50 border border-transparent rounded-xl px-3 py-2 text-sm focus:outline-none focus:bg-white focus:border-[#98c1d9] focus:ring-2 focus:ring-[#98c1d9]/20 transition"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
          </div>

          {/* Search for a vessel input bar */}
          <div className="relative mb-4">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              className="w-full bg-slate-50 border border-transparent rounded-xl pl-9 pr-3 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-[#98c1d9] focus:ring-2 focus:ring-[#98c1d9]/20 transition"
              placeholder="Search name, MMSI, or type…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-2.5 text-xs font-medium text-slate-400 border-t border-slate-100 shrink-0">
          <span className="uppercase tracking-wide">Vessels</span>
          <span className="tabular-nums">
            {filtered.length !== vessels.length
              ? `${filtered.length} / ${vessels.length}`
              : `${vessels.length}`}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 px-2 pb-2 pt-2">
          {filtered.length === 0 && (
            <p className="text-sm text-slate-400 p-6 text-center">
              {vessels.length === 0
                ? "Loading vessels…"
                : "No vessels match your search."}
            </p>
          )}
          {filtered.map((v) => {
            const type = classifyType(v.ship_type);
            const color = TYPE_COLORS[type] ?? TYPE_COLORS.unknown;
            const active = selected?.mmsi === v.mmsi;
            return (
              <button
                key={v.mmsi}
                onClick={() => {
                  setSelected(v);
                  sourceRef.current.clear();
                  setPointCount(null);
                  loadRoute(v);
                }}
                className={`w-full text-left px-3 py-2.5 rounded-xl mb-0.5 transition ${
                  active
                    ? "bg-[#3d5a80]/8 ring-1 ring-[#3d5a80]/20"
                    : "hover:bg-slate-50"
                }`}
              >
                <div
                  className={`font-medium truncate ${
                    active ? "text-[#293241]" : "text-slate-700"
                  }`}
                >
                  {v.vessel_name || "Unknown vessel"}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 text-[11px] text-slate-500 capitalize">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: color }}
                    />
                    {type}
                  </span>
                  <span className="text-[11px] text-slate-400 tabular-nums">
                    {v.mmsi}
                  </span>
                </div>
                {active && pointCount !== null && (
                  <p className="text-[11px] text-slate-400 mt-1.5 tabular-nums">
                    {pointCount === 0
                      ? "No data for this period."
                      : `${pointCount.toLocaleString()} position points in range`}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Regions panel — slides in from the right */}
      <div
        className={`absolute right-0 top-0 h-full w-72 bg-white z-20 flex flex-col shadow-xl transition-transform duration-200 ${
          showRegionPanel ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="px-5 pt-8 pb-4 shrink-0">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Regions</h2>

          {/* Shapefile / GeoJSON upload */}
          <label className="flex flex-col items-center justify-center gap-1.5 w-full border-2 border-dashed border-slate-200 rounded-xl py-4 px-3 text-xs text-slate-400 cursor-pointer hover:border-[#98c1d9] hover:text-[#3d5a80] transition">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>Upload GeoJSON</span>
            <input type="file" accept=".geojson,.json" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-2 pb-4">
          {/* CHA section */}
          <div className="px-3 pt-3 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">CHA</div>
          {CHA_REGIONS.map((r) => (
            <label key={r.name} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedRegionNames.has(r.name)}
                onChange={() => toggleRegion(r.name)}
                className="accent-[#3d5a80] w-4 h-4 rounded"
              />
              <div>
                <div className="text-sm font-medium text-slate-700">{r.name}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-[#3d5a80] inline-block" />
                  <span className="text-[11px] text-slate-400">Critical Habitat Area</span>
                </div>
              </div>
            </label>
          ))}

          {/* WEA section */}
          <div className="px-3 pt-4 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">WEA</div>
          {WEA_REGIONS.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-400 italic">Coordinates coming soon</p>
          ) : (
            WEA_REGIONS.map((r) => (
              <label key={r.name} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedRegionNames.has(r.name)}
                  onChange={() => toggleRegion(r.name)}
                  className="accent-[#ee6c4d] w-4 h-4 rounded"
                />
                <div>
                  <div className="text-sm font-medium text-slate-700">{r.name}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-2 h-2 rounded-full bg-[#ee6c4d] inline-block" />
                    <span className="text-[11px] text-slate-400">Wind Energy Area</span>
                  </div>
                </div>
              </label>
            ))
          )}

          {/* Uploaded regions */}
          {uploadedRegions.length > 0 && (
            <>
              <div className="px-3 pt-4 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Uploaded</div>
              {uploadedRegions.map((r) => (
                <label key={r.name} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedRegionNames.has(r.name)}
                    onChange={() => toggleRegion(r.name)}
                    className="accent-[#9b59b6] w-4 h-4 rounded"
                  />
                  <div>
                    <div className="text-sm font-medium text-slate-700">{r.name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="w-2 h-2 rounded-full bg-[#9b59b6] inline-block" />
                      <span className="text-[11px] text-slate-400">Custom region</span>
                    </div>
                  </div>
                </label>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-5 left-5 z-10 bg-white/90 backdrop-blur-md rounded-2xl shadow-lg shadow-slate-900/5 ring-1 ring-slate-900/5 px-4 py-3 text-xs">
        <div className="font-semibold mb-2 text-slate-600">Speed (knots)</div>
        <div className="flex items-center gap-2 mb-1 text-slate-500">
          <span className="w-2.5 h-2.5 rounded-full bg-[#0a8754] inline-block" />
          &lt; 3
        </div>
        <div className="flex items-center gap-2 mb-1 text-slate-500">
          <span className="w-2.5 h-2.5 rounded-full bg-[#ffc857] inline-block" />
          3 – 10
        </div>
        <div className="flex items-center gap-2 text-slate-500">
          <span className="w-2.5 h-2.5 rounded-full bg-[#ee6c4d] inline-block" />
          &gt; 10
        </div>
      </div>

      {/* Results modal */}
      {showResults && regionStats && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
          onClick={() => setShowResults(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between px-7 pt-6 pb-5 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="text-xl font-semibold text-slate-800 tracking-tight">
                  {regionName ?? "Region Analysis"}
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  <span className="font-medium text-slate-700">
                    {regionStats.unique_vessels}
                  </span>{" "}
                  vessels ·{" "}
                  <span className="font-medium text-slate-700">
                    {regionStats.total_positions.toLocaleString()}
                  </span>{" "}
                  positions · {start} → {end}
                  {regionTime !== null && (
                    <span className="text-slate-400">
                      {" "}
                      · {(regionTime / 1000).toFixed(1)}s
                    </span>
                  )}
                </p>
              </div>
              <button
                onClick={() => setShowResults(false)}
                className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full w-8 h-8 flex items-center justify-center transition shrink-0"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto px-7 py-6 space-y-7">
              {regionStats.total_positions === 0 ? (
                <p className="text-sm text-slate-500 text-center py-10">
                  No vessel activity found in this region for the selected
                  dates.
                </p>
              ) : (
                <>
                  {regionStats.plots?.vessel_types && (
                    <figure>
                      <figcaption className="flex items-center justify-between mb-2.5">
                        <span className="text-sm font-semibold text-slate-700">
                          Daily vessels by type
                        </span>
                        <button
                          onClick={() =>
                            downloadPlot(
                              regionStats.plots.vessel_types!,
                              "vessels_by_type.png"
                            )
                          }
                          className="text-xs font-medium text-[#98c1d9] hover:bg-[#98c1d9]/10 rounded-full px-3 py-1 transition"
                        >
                          ↓ Download
                        </button>
                      </figcaption>
                      <img
                        src={`data:image/png;base64,${regionStats.plots.vessel_types}`}
                        className="w-full rounded-xl ring-1 ring-slate-100"
                      />
                    </figure>
                  )}
                  {regionStats.plots?.speed_overall && (
                    <figure>
                      <figcaption className="flex items-center justify-between mb-2.5">
                        <span className="text-sm font-semibold text-slate-700">
                          Daily mean speed
                        </span>
                        <button
                          onClick={() =>
                            downloadPlot(
                              regionStats.plots.speed_overall!,
                              "mean_speed.png"
                            )
                          }
                          className="text-xs font-medium text-[#98c1d9] hover:bg-[#98c1d9]/10 rounded-full px-3 py-1 transition"
                        >
                          ↓ Download
                        </button>
                      </figcaption>
                      <img
                        src={`data:image/png;base64,${regionStats.plots.speed_overall}`}
                        className="w-full rounded-xl ring-1 ring-slate-100"
                      />
                    </figure>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Point popup */}
      {popup && (
        <div
          className="absolute z-30 bg-white ring-1 ring-slate-900/5 rounded-2xl shadow-xl px-4 py-3 text-xs pointer-events-none"
          style={{ left: popup.x + 12, top: popup.y - 8 }}
        >
          <div className="font-semibold text-[#3d5a80] mb-1.5">
            {popup.isStart ? "Start" : popup.isEnd ? "End" : popup.source}
          </div>
          <div className="text-slate-600 space-y-1 tabular-nums">
            <div>
              <span className="text-slate-400 inline-block w-16">Time</span>
              {formatTime(popup.time)}
            </div>
            <div>
              <span className="text-slate-400 inline-block w-16">Latitude</span>
              {popup.lat?.toFixed(5)}°N
            </div>
            <div>
              <span className="text-slate-400 inline-block w-16">
                Longitude
              </span>
              {popup.lon?.toFixed(5)}°
            </div>
            <div>
              <span className="text-slate-400 inline-block w-16">Speed</span>
              {popup.sog != null ? `${popup.sog} kt` : "—"}
            </div>
            <div>
              <span className="text-slate-400 inline-block w-16">Course</span>
              {popup.cog != null ? `${popup.cog}°` : "—"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ShipMap;

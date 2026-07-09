import { useEffect, useMemo, useRef, useState } from "react";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import ImageLayer from "ol/layer/Image";
import ImageStatic from "ol/source/ImageStatic";
import XYZ from "ol/source/XYZ";
import TileWMS from "ol/source/TileWMS";
import TileGrid from "ol/tilegrid/TileGrid";
import { get as getProjection } from "ol/proj";
import { getTopLeft, getWidth } from "ol/extent";
import { fromLonLat, toLonLat } from "ol/proj";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import LineString from "ol/geom/LineString";
import OLPolygon from "ol/geom/Polygon";
import VectorLayer from "ol/layer/Vector";
import WebGLVectorLayer from "ol/layer/WebGLVector";
import VectorSource from "ol/source/Vector";
import { Style, Stroke, Fill, Icon, Circle as CircleStyle, Text } from "ol/style";
import { getLength } from "ol/sphere";
import Draw from "ol/interaction/Draw";
import GeoJSON from "ol/format/GeoJSON";
import shp from "shpjs";
import "ol/ol.css";
import "./map.css";
import {
  type PresetRegion,
  type Mooring,
  CHA_REGIONS,
  WEA_REGIONS,
  AMAR_MOORINGS,
  TYPE_COLORS,
} from "./data/regions";
import {
  classifyType,
  formatTime,
  REGION_WEBGL_STYLE,
  REGION_WEBGL_VARIABLES,
  TYPE_NUM,
  makeFeatureStyle,
  makeMooringCanvas,
  makeVesselCanvas,
  chaStyle,
  drawnRegionLabel,
  downloadPlot,
  setSelectedChaName,
  getSelectedChaName,
  setClickedChaNames,
} from "./utils/mapStyles";
import PanelHeader from "./components/PanelHeader";
import DateRangePicker from "./components/DateRangePicker";
import RegionListItem from "./components/RegionListItem";
import SidePanel from "./components/SidePanel";
import IconBar from "./components/IconBar";
import CursorCoordinates from "./components/CursorCoordinates";
import ClosePanelBtn from "./components/ClosePanelBtn";

const API = import.meta.env.VITE_API_URL ?? "";

const BASEMAPS = [
  { id: "esri-street",     label: "World Street Map",    tooltip: "Road and transit detail for identifying ports and coastal features.",                                      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",     maxZoom: 18, attributions: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>' },
  { id: "esri-imagery",    label: "World Imagery",       tooltip: "Satellite photography for visualising real ocean and coastal conditions.",                                          url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",        maxZoom: 18, attributions: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>' },
  { id: "esri-ocean",      label: "Ocean / Bathymetry",  tooltip: "Seabed depth and ocean labels for correlating tracks with underwater topography.",                              url: "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}", maxZoom: 13, attributions: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>' },
  { id: "esri-topo",       label: "Topo Map",            tooltip: "Topographic contours and relief shading for coastal terrain context.",                                        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",       maxZoom: 18, attributions: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>' },
  { id: "esri-light-gray", label: "Light Gray",          tooltip: "Minimal canvas that keeps focus on data layers without visual clutter.",                                       url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", maxZoom: 16, attributions: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>' },
  { id: "esri-dark-gray",  label: "Dark Gray",           tooltip: "Dark canvas with high contrast for noise, track, and density overlays.",                                      url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", maxZoom: 16, attributions: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>' },
  { id: "esri-natgeo",     label: "National Geographic", tooltip: "Classic cartographic style suited for presentations and reports.",                                         url: "https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}",     maxZoom: 16, attributions: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>' },
];

interface Vessel {
  mmsi: number;
  vessel_name: string | null;
  ship_type: string | number | null;
  source: string;
  point_count: number;
}

interface RoutePoint {
  time: number;
  latitude: number;
  longitude: number;
  sog: number | null;
  cog: number | null;
  source: string;
}

interface RegionPosition {
  mmsi: number;
  lat: number;
  lon: number;
  sog: number | null;
  ship_type: number | null;
}

interface RegionStats {
  total_positions: number;
  unique_vessels: number;
  vessel_mmsis: number[];
  positions: RegionPosition[];
  days: { date: string; vessel_counts: Record<string, number> }[];
  plots: {
    vessel_types?: string;
    speed_overall?: string;
    vessel_density?: string;
  };
}

function ShipMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<Map | null>(null);
  const sourceRef = useRef(new VectorSource());
  const drawSourceRef = useRef(new VectorSource());
  const chaSourceRef = useRef(new VectorSource());
  const mooringSourceRef = useRef(new VectorSource());
  const highlightedMooringRef = useRef<string | null>(null);
  const drawRef = useRef<Draw | null>(null);
  const regionNameRef = useRef<string | null>(null);
  const routeLayerRef = useRef<VectorLayer | null>(null);
  const chaLayerRef = useRef<VectorLayer | null>(null);
  const bathyLayerRef = useRef<TileLayer | null>(null);
  const basemapLayerRef = useRef<TileLayer | null>(null);
  const noiseLayerRef = useRef<ImageLayer<ImageStatic> | null>(null);
  const regionTrackSourceRef = useRef(new VectorSource());
  const regionTrackLayerRef = useRef<WebGLVectorLayer<VectorSource> | null>(null);
  const regionDisplayModeRef = useRef<"grey" | "type" | "speed" | "vessel">("grey");
  const measureSourceRef = useRef(new VectorSource());
  const measuringRef = useRef(false);
  const measureStartRef = useRef<number[] | null>(null);
  const measureLineFeatureRef = useRef<Feature | null>(null);

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
  const [selected, setSelected] = useState<Vessel | null>(null);
  const [start, setStart] = useState("2025-08-01");
  const [end, setEnd] = useState("2025-08-31");
  const [pointCount, setPointCount] = useState<number | null>(null);
  const [pointTotal, setPointTotal] = useState<number | null>(null);
  const [popup, setPopup] = useState<Popup | null>(null);
  const [mooringPopup, setMooringPopup] = useState<{
    x: number;
    y: number;
    mooring: Mooring;
  } | null>(null);
  const [regionStats, setRegionStats] = useState<RegionStats | null>(null);
  const [regionLoading, setRegionLoading] = useState(false);
  const [regionTime, setRegionTime] = useState<number | null>(null);
  const [regionName, setRegionName] = useState<string | null>(null);
  useEffect(() => {
    regionNameRef.current = regionName;
  }, [regionName]);
  const [drawnPolygon, setDrawnPolygon] = useState<object | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [measuring, setMeasuring] = useState(false);
  useEffect(() => {
    measuringRef.current = measuring;
    if (!measuring) {
      measureStartRef.current = null;
      measureLineFeatureRef.current = null;
      measureSourceRef.current.clear();
    }
  }, [measuring]);
  const [userSelectedRegions, setUserSelectedRegions] = useState<
    { name: string; geojson: object; type: string }[]
  >([]);
  const [showResults, setShowResults] = useState(false);
  const [closingResults, setClosingResults] = useState(false);
  function closeResults() {
    setClosingResults(true);
    setTimeout(() => {
      setShowResults(false);
      setClosingResults(false);
    }, 180);
  }
  const [cursorCoord, setCursorCoord] = useState<{
    lat: number;
    lon: number;
  } | null>(null);
  const [showVesselPanel, setShowVesselPanel] = useState(false);
  const [showRegionPanel, setShowRegionPanel] = useState(false);
  const [showMooringPanel, setShowMooringPanel] = useState(false);
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [lastOpenedPanel, setLastOpenedPanel] = useState<
    "vessel" | "region" | "layer" | "mooring"
  >("vessel");
  const [clickedRegionNames, setClickedRegionNames] = useState<Set<string>>(
    new Set()
  );
  const [uploadedRegions, setUploadedRegions] = useState<PresetRegion[]>([]);
  const [uploadedMoorings, setUploadedMoorings] = useState<Mooring[]>([]);
  const [hoveredMooring, setHoveredMooring] = useState<Mooring | null>(null);
  const [showBathymetry, setShowBathymetry] = useState(false);
  const [bathyOpacity, setBathyOpacity] = useState(0.75);
  const [bathyLoading, setBathyLoading] = useState(false);
  const [showNoise, setShowNoise] = useState(false);
  const [noiseOpacity, setNoiseOpacity] = useState(0.5);
  const [noiseLoading, setNoiseLoading] = useState(false);
  const [noiseVariable, setNoiseVariable] = useState("vessel_noise");
  const [noiseDate, setNoiseDate] = useState("2020-02");
  const [noiseFreq, setNoiseFreq] = useState(50);
  const [noiseDepth, setNoiseDepth] = useState(10);
  const [noiseRange, setNoiseRange] = useState<{ vmin: number; vmax: number } | null>(null);
  const [noiseAvailable, setNoiseAvailable] = useState<Record<string, { freq: number; depth: number }[]>>({});
  const [noiseDates, setNoiseDates] = useState<string[]>([]);
  const [basemap, setBasemap] = useState("esri-ocean");
  const [serverError, setServerError] = useState<string | null>(null);
  const [viewVesselsMode, setViewVesselsMode] = useState(false);
  const [regionMmsis, setRegionMmsis] = useState<Set<number>>(new Set());
  const [regionDisplayMode, setRegionDisplayMode] = useState<
    "grey" | "type" | "speed" | "vessel"
  >("grey");
  const defaultFilters = { type: new Set<string>(), source: "all", dfo: "all" };
  const [filters, setFilters] = useState<{
    type: Set<string>;
    source: string;
    dfo: string;
  }>(defaultFilters);
  const [draftFilters, setDraftFilters] = useState<{
    type: Set<string>;
    source: string;
    dfo: string;
  }>(defaultFilters);
  const [showTypeFilter, setShowTypeFilter] = useState(false);
  const [mooringSize, setMooringSize] = useState(10);
  const [vesselSize, setVesselSize] = useState(5);
  const [regionDotSize, setRegionDotSize] = useState(4);
  const [mooringOpacity, setMooringOpacity] = useState(1);
  const [vesselOpacity, setVesselOpacity] = useState(1);
  const [regionDotOpacity, setRegionDotOpacity] = useState(0.6);
  const [mooringOpen, setMooringOpen] = useState(false);
  const [vesselOpen, setVesselOpen] = useState(false);
  const [regionDotOpen, setRegionDotOpen] = useState(false);
  useEffect(() => {
    if (showVesselPanel) setLastOpenedPanel("vessel");
    else if (showRegionPanel) setLastOpenedPanel("region");
    else if (showLayerPanel) setLastOpenedPanel("layer");
    else if (showMooringPanel) setLastOpenedPanel("mooring");
  }, [showVesselPanel, showRegionPanel, showLayerPanel, showMooringPanel]);
  const anyPanelOpen =
    showVesselPanel || showRegionPanel || showLayerPanel || showMooringPanel;
  function closeActivePanel() {
    setShowVesselPanel(false);
    setShowRegionPanel(false);
    setShowLayerPanel(false);
    setShowMooringPanel(false);
  }
  function openLastPanel() {
    if (lastOpenedPanel === "vessel") setShowVesselPanel(true);
    else if (lastOpenedPanel === "region") setShowRegionPanel(true);
    else if (lastOpenedPanel === "layer") setShowLayerPanel(true);
    else if (lastOpenedPanel === "mooring") setShowMooringPanel(true);
  }
  const mooringSizeRef = useRef(10);
  const vesselSizeRef = useRef(5);
  const mooringOpacityRef = useRef(1);
  const vesselOpacityRef = useRef(1);
  useEffect(() => {
    mooringSizeRef.current = mooringSize;
    mooringSourceRef.current.changed();
  }, [mooringSize]);
  useEffect(() => {
    vesselSizeRef.current = vesselSize;
    routeLayerRef.current?.setStyle(makeFeatureStyle(true, true, vesselSize, vesselOpacityRef.current));
  }, [vesselSize]);
  useEffect(() => {
    regionTrackLayerRef.current?.updateStyleVariables({ dotSize: regionDotSize });
  }, [regionDotSize]);
  useEffect(() => {
    vesselOpacityRef.current = vesselOpacity;
    routeLayerRef.current?.setStyle(makeFeatureStyle(true, true, vesselSizeRef.current, vesselOpacity));
  }, [vesselOpacity]);
  useEffect(() => {
    mooringOpacityRef.current = mooringOpacity;
    mooringSourceRef.current.changed();
  }, [mooringOpacity]);
  useEffect(() => {
    regionTrackLayerRef.current?.updateStyleVariables({ dotOpacity: regionDotOpacity });
  }, [regionDotOpacity]);

  useEffect(() => {
    const fmt = new GeoJSON();
    chaSourceRef.current.clear();
    const allRegions = [
      ...CHA_REGIONS.map((r) => ({ ...r, regionType: "CHA" })),
      ...WEA_REGIONS.map((r) => ({ ...r, regionType: "WEA" })),
      ...uploadedRegions.map((r) => ({ ...r, regionType: "Uploaded" })),
      ...userSelectedRegions.map((r) => ({ ...r, regionType: "Drawn" })),
    ];
    allRegions.forEach((r) => {
      const geom = fmt.readGeometry(r.geojson, {
        dataProjection: "EPSG:4326",
        featureProjection: "EPSG:3857",
      }) as OLPolygon;
      const f = new Feature({
        geometry: geom,
        name: r.name,
        chaRegion: r,
        regionType: r.regionType,
      });
      chaSourceRef.current.addFeature(f);
    });
  }, [uploadedRegions, userSelectedRegions]);

  // rebuild mooring points when date range or uploaded moorings change
  useEffect(() => {
    mooringSourceRef.current.clear();
    const allMoorings = [...AMAR_MOORINGS, ...uploadedMoorings];
    allMoorings
      .filter((m) => m.deployment <= end && m.recovery >= start)
      .forEach((m) => {
        const f = new Feature({
          geometry: new Point(fromLonLat([m.lon, m.lat])),
          mooring: m,
        });
        mooringSourceRef.current.addFeature(f);
      });
  }, [start, end, uploadedMoorings]);

  useEffect(() => {
    if (!mapRef.current) return;

    const chaLayer = new VectorLayer({
      source: chaSourceRef.current,
      style: chaStyle,
    });
    chaLayerRef.current = chaLayer;

    const mooringLayer = new VectorLayer({
      source: mooringSourceRef.current,
      style: (feature) => {
        const isHighlighted =
          (feature.get("mooring") as Mooring)?.name ===
          highlightedMooringRef.current;
        return new Style({
          image: new Icon({
            img: makeMooringCanvas(isHighlighted, mooringSizeRef.current),
            anchor: [0.5, 0.5],
            anchorXUnits: "fraction",
            anchorYUnits: "fraction",
            opacity: mooringOpacityRef.current,
          }),
        });
      },
    });

    const routeLayer = new VectorLayer({
      source: sourceRef.current,
      style: makeFeatureStyle(true, true),
    });
    routeLayerRef.current = routeLayer;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const regionTrackLayer = new WebGLVectorLayer({
      source: regionTrackSourceRef.current,
      style: REGION_WEBGL_STYLE as any,
      variables: REGION_WEBGL_VARIABLES,
    });
    regionTrackLayerRef.current = regionTrackLayer;

    // DFO bathymetry WMS only supports EPSG:4326 — build a tile grid for it
    const proj4326 = getProjection("EPSG:4326")!;
    const proj4326Extent = proj4326.getExtent()!;
    const proj4326Width = getWidth(proj4326Extent);
    const resolutions = Array.from(
      { length: 14 },
      (_, z) => proj4326Width / (256 * Math.pow(2, z))
    );
    const bathyTileGrid = new TileGrid({
      extent: proj4326Extent,
      origin: getTopLeft(proj4326Extent),
      resolutions,
      tileSize: 256,
    });

    const bathyLayer = new TileLayer({
      source: new TileWMS({
        url: "https://maps-cartes.services.geo.ca/server_serveur/services/NRCan/GSC_Atlantic_bathymetric_compilation_en/MapServer/WmsServer?",
        params: {
          LAYERS: "1",
          VERSION: "1.3.0",
          FORMAT: "image/png",
          CRS: "EPSG:4326",
        },
        projection: "EPSG:4326",
        tileGrid: bathyTileGrid,
        crossOrigin: "anonymous",
        attributions: "Bathymetry © NRCan / DFO",
      }),
      opacity: 0.75,
      visible: false,
    });
    bathyLayerRef.current = bathyLayer;
    let bathyPending = 0;
    bathyLayer.getSource()!.on("tileloadstart", () => { bathyPending++; setBathyLoading(true); });
    bathyLayer.getSource()!.on(["tileloadend", "tileloaderror"], () => { if (--bathyPending <= 0) { bathyPending = 0; setBathyLoading(false); } });

    // ocean noise modelling — static raster overlay, one day's mean dB grid
    const noiseExtent = [
      ...fromLonLat([-69.5, 41.0]),
      ...fromLonLat([-59.0, 46.0]),
    ] as [number, number, number, number];
    const noiseLayer = new ImageLayer({
      source: new ImageStatic({
        url: `${API}/api/noise/overlay?date=2020-02-01`,
        imageExtent: noiseExtent,
        projection: "EPSG:3857",
      }),
      opacity: 0.5,
      visible: false,
    });
    noiseLayerRef.current = noiseLayer;
    noiseLayer.getSource()!.on("imageloadstart", () => setNoiseLoading(true));
    noiseLayer.getSource()!.on(["imageloadend", "imageloaderror"], () => setNoiseLoading(false));

    const map = new Map({
      target: mapRef.current,
      layers: [
        (() => {
          const layer = new TileLayer({
            source: new XYZ({
              url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
              attributions: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>',
              maxZoom: 18,
            }),
          });
          basemapLayerRef.current = layer;
          return layer;
        })(),
        bathyLayer,
        noiseLayer,
        chaLayer,
        mooringLayer,
        regionTrackLayer,
        routeLayer,
        new VectorLayer({
          source: drawSourceRef.current,
          style: new Style({
            stroke: new Stroke({ color: "#98c1d9", width: 2 }),
            fill: new Fill({ color: "rgba(152,193,217,0.1)" }),
          }),
        }),
        new VectorLayer({
          source: measureSourceRef.current,
          style: (feature) => {
            if (feature.getGeometry()?.getType() === "Point") {
              return new Style({
                image: new CircleStyle({
                  radius: 4,
                  fill: new Fill({ color: "#e63946" }),
                  stroke: new Stroke({ color: "#fff", width: 1.5 }),
                }),
              });
            }
            return new Style({
              stroke: new Stroke({ color: "#888", width: 1.5, lineDash: [4, 4] }),
            });
          },
        }),
      ],
      view: new View({
        center: fromLonLat([-63.5, 44.5]),
        zoom: 6,
      }),
    });

    map.on("click", (e) => {
      if (measuringRef.current) {
        if (!measureStartRef.current) {
          measureStartRef.current = e.coordinate;
          const dot = new Feature({ geometry: new Point(e.coordinate) });
          measureSourceRef.current.addFeature(dot);
          const line = new Feature({ geometry: new LineString([e.coordinate, e.coordinate]) });
          measureSourceRef.current.addFeature(line);
          measureLineFeatureRef.current = line;
        } else {
          const line = measureLineFeatureRef.current;
          const start = measureStartRef.current;
          if (line && start) {
            const lineGeom = line.getGeometry() as LineString;
            lineGeom.setCoordinates([start, e.coordinate]);
            const metres = getLength(lineGeom, { projection: "EPSG:3857" });
            const label = metres >= 1000
              ? `${(metres / 1000).toFixed(2)} km`
              : `${Math.round(metres)} m`;
            const mid = [(start[0] + e.coordinate[0]) / 2, (start[1] + e.coordinate[1]) / 2];
            const labelFeature = new Feature({ geometry: new Point(mid) });
            labelFeature.setStyle(new Style({
              text: new Text({
                text: label,
                font: "bold 11px Inter, sans-serif",
                fill: new Fill({ color: "#fff" }),
                backgroundFill: new Fill({ color: "rgba(41,50,65,0.85)" }),
                backgroundStroke: new Stroke({ color: "rgba(41,50,65,0.9)", width: 1 }),
                padding: [3, 5, 3, 5],
                offsetY: -14,
              }),
            }));
            measureSourceRef.current.addFeature(labelFeature);
          }
          measureSourceRef.current.addFeature(new Feature({ geometry: new Point(e.coordinate) }));
          measureStartRef.current = null;
          measureLineFeatureRef.current = null;
        }
        return;
      }

      // check CHA click first — select it as active region
      let chaClicked = false;
      map.forEachFeatureAtPixel(e.pixel, (feature) => {
        const cha = feature.get("chaRegion") as PresetRegion | undefined;
        if (cha) {
          chaClicked = true;
          if (regionNameRef.current === cha.name) {
            setDrawnPolygon(null);
            setRegionName(null);
            setSelectedChaName(null);
            regionTrackSourceRef.current.clear();
            setViewVesselsMode(false);
            setRegionMmsis(new Set());
          } else {
            setDrawnPolygon(cha.geojson);
            setRegionName(cha.name);
            drawSourceRef.current.clear();
            setSelectedChaName(cha.name);
            setShowRegionPanel(true);
          }
          chaSourceRef.current.changed();
          return true;
        }
      });
      if (chaClicked) return;

      // then vessel point click
      map.forEachFeatureAtPixel(e.pixel, (feature) => {
        if (feature.getGeometry()?.getType() !== "Point") return;
        if (feature.get("chaRegion")) return;
        if (feature.get("mooring")) {
          setMooringPopup({
            x: e.pixel[0],
            y: e.pixel[1],
            mooring: feature.get("mooring") as Mooring,
          });
          return true;
        }
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
      }) ?? (setPopup(null), setMooringPopup(null));
    });

    // hover cursor on moorings and CHA polygons
    map.on("pointermove", (e) => {
      const [lon, lat] = toLonLat(e.coordinate);
      setCursorCoord({ lat, lon });

      if (measuringRef.current) {
        if (measureStartRef.current && measureLineFeatureRef.current) {
          (measureLineFeatureRef.current.getGeometry() as LineString).setCoordinates([
            measureStartRef.current,
            e.coordinate,
          ]);
        }
        map.getTargetElement().style.cursor = "crosshair";
        return;
      }

      let overMooring = false;
      let overClickable = false;
      map.forEachFeatureAtPixel(e.pixel, (feature) => {
        if (feature.get("mooring")) {
          overMooring = true;
          overClickable = true;
          setHoveredMooring(feature.get("mooring") as Mooring);
          return true;
        }
        if (feature.get("chaRegion")) {
          overClickable = true;
          return true;
        }
      });
      if (!overMooring) setHoveredMooring(null);

      map.getTargetElement().style.cursor = overClickable
        ? "pointer"
        : "crosshair";
    });

    mapObj.current = map;
    return () => map.setTarget(undefined);
  }, []);

  useEffect(() => {
    bathyLayerRef.current?.setVisible(showBathymetry);
  }, [showBathymetry]);

  useEffect(() => {
    bathyLayerRef.current?.setOpacity(bathyOpacity);
  }, [bathyOpacity]);

  useEffect(() => {
    noiseLayerRef.current?.setVisible(showNoise);
  }, [showNoise]);

  useEffect(() => {
    fetch(`${API}/api/noise/available`)
      .then((r) => r.json())
      .then(setNoiseAvailable)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const options = noiseAvailable[noiseVariable];
    if (!options || options.length === 0) return;
    const freqs = [...new Set(options.map((o) => o.freq))].sort((a, b) => a - b);
    if (!freqs.includes(noiseFreq)) setNoiseFreq(freqs[0]);
    const depths = [...new Set(options.filter((o) => o.freq === (freqs.includes(noiseFreq) ? noiseFreq : freqs[0])).map((o) => o.depth))].sort((a, b) => a - b);
    if (!depths.includes(noiseDepth)) setNoiseDepth(depths[0]);
  }, [noiseVariable, noiseAvailable]);

  useEffect(() => {
    fetch(`${API}/api/noise/dates?variable=${noiseVariable}&freq=${noiseFreq}&depth=${noiseDepth}`)
      .then((r) => r.ok ? r.json() : [])
      .then((dates: string[]) => {
        setNoiseDates(dates);
        if (dates.length > 0 && !dates.includes(noiseDate)) setNoiseDate(dates[dates.length - 1]);
      })
      .catch(() => {});
  }, [noiseVariable, noiseFreq, noiseDepth]);

  useEffect(() => {
    if (!noiseLayerRef.current) return;
    const noiseExtent = [
      ...fromLonLat([-69.5, 41.0]),
      ...fromLonLat([-59.0, 46.0]),
    ] as [number, number, number, number];
    const url = `${API}/api/noise/overlay?date=${noiseDate}&variable=${noiseVariable}&freq=${noiseFreq}&depth=${noiseDepth}`;
    const newSource = new ImageStatic({ url, imageExtent: noiseExtent, projection: "EPSG:3857" });
    newSource.on("imageloadstart", () => setNoiseLoading(true));
    newSource.on(["imageloadend", "imageloaderror"], () => setNoiseLoading(false));
    noiseLayerRef.current.setSource(newSource);

    fetch(`${API}/api/noise/range?date=${noiseDate}&variable=${noiseVariable}&freq=${noiseFreq}&depth=${noiseDepth}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => setNoiseRange(data))
      .catch(() => setNoiseRange(null));
  }, [noiseDate, noiseVariable, noiseFreq, noiseDepth]);

  useEffect(() => {
    noiseLayerRef.current?.setOpacity(noiseOpacity);
  }, [noiseOpacity]);

  useEffect(() => {
    if (!basemapLayerRef.current) return;
    const bm = BASEMAPS.find((b) => b.id === basemap);
    if (!bm) return;
    const url = bm.url;
    basemapLayerRef.current.setSource(
      new XYZ({ url, attributions: bm.attributions, maxZoom: bm.maxZoom })
    );
  }, [basemap]);

  useEffect(() => {
    regionDisplayModeRef.current = regionDisplayMode;
    const modeNum =
      regionDisplayMode === "type" ? 1 : regionDisplayMode === "speed" ? 2 : regionDisplayMode === "vessel" ? 3 : 0;
    regionTrackLayerRef.current?.updateStyleVariables({ mode: modeNum });
  }, [regionDisplayMode]);

  useEffect(() => {
    fetch(`${API}/api/vessels?start=${start}T00:00:00&end=${end}T23:59:59`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((d) => {
        setServerError(null);
        setVessels(d.vessels || []);
      })
      .catch((e: Error) => setServerError(e.message));
  }, [start, end]);

  function downloadMooringTemplate() {
    const csv = [
      "name,lat,lon,depth,deployment,recovery",
      "MY_MOORING_01,43.0026,-65.5653,101,2023-05-01,2023-10-15",
      "MY_MOORING_02,43.4976,-62.8700,98,2023-06-01,2023-11-01",
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "mooring_template.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function handleMooringUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const lines = (evt.target?.result as string).trim().split(/\r?\n/);
        const header = lines[0]
          .toLowerCase()
          .split(",")
          .map((h) => h.trim());
        const idx = (col: string) => header.indexOf(col);
        const toISO = (d: string) => {
          const dt = new Date(d);
          return isNaN(dt.getTime()) ? d : dt.toISOString().slice(0, 10);
        };
        const parsed: Mooring[] = lines
          .slice(1)
          .map((line) => {
            const cols = line
              .split(",")
              .map((c) => c.trim().replace(/\r/g, ""));
            return {
              name: cols[idx("name")],
              lat: parseFloat(cols[idx("lat")]),
              lon: parseFloat(cols[idx("lon")]),
              depth: parseFloat(cols[idx("depth")] ?? "0"),
              deployment: toISO(cols[idx("deployment")]),
              recovery: toISO(cols[idx("recovery")]),
            };
          })
          .filter((m) => m.name && !isNaN(m.lat) && !isNaN(m.lon));
        setUploadedMoorings((prev) => [...prev, ...parsed]);
      } catch {
        alert(
          "Invalid CSV. Expected columns: name, lat, lon, depth, deployment, recovery"
        );
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function toggleClickedRegion(name: string) {
    setClickedRegionNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      setClickedChaNames(next);
      chaSourceRef.current.changed();
      return next;
    });
  }

  function handleShapefileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const buffer = evt.target?.result as ArrayBuffer;
        const fc = await shp(buffer);
        const features = Array.isArray(fc)
          ? fc.flatMap((f) => f.features)
          : fc.features;
        const name = file.name.replace(/\.zip$/i, "");
        features.forEach((feat, i) => {
          const regionName =
            feat.properties?.Name ||
            feat.properties?.name ||
            (features.length === 1 ? name : `${name} ${i + 1}`);
          const geometry = feat.geometry;
          setUploadedRegions((prev) => [
            ...prev,
            { name: regionName, geojson: geometry },
          ]);
          setClickedRegionNames((prev) => {
            const next = new Set(prev);
            next.add(regionName);
            setClickedChaNames(next);
            return next;
          });
        });
      } catch {
        alert(
          "Invalid shapefile. Upload a .zip containing .shp, .dbf, and .prj files."
        );
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
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
      .then(
        (data: { points: RoutePoint[]; total?: number; sampled?: boolean }) => {
          const pts = data.points || [];
          setPointCount(pts.length);
          setPointTotal(data.sampled ? data.total ?? null : null);
          if (pts.length === 0) return;

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
        }
      )
      .catch(console.error);
  }

  function renderRegionPositions(positions: RegionPosition[]) {
    regionTrackSourceRef.current.clear();
    regionTrackLayerRef.current?.updateStyleVariables({ hoveredMmsi: -1 });
    console.log(`[region] rendering ${positions.length} positions`);
    const mmsiList = [...new Set(positions.map((p) => p.mmsi))].sort();
    const mmsiIndex: Record<number, number> = Object.fromEntries(mmsiList.map((m, i) => [m, i]));
    positions.forEach((p) => {
      regionTrackSourceRef.current.addFeature(
        new Feature({
          geometry: new Point(fromLonLat([p.lon, p.lat])),
          mmsi: p.mmsi,
          sog: p.sog ?? 0,
          ship_type: p.ship_type,
          type_num: TYPE_NUM[classifyType(p.ship_type)] ?? 0,
          vesselIndex: mmsiIndex[p.mmsi] ?? 0,
        })
      );
    });
    console.log(
      `[region] source has ${
        regionTrackSourceRef.current.getFeatures().length
      } features`
    );
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
      type: "Polygon",
      stopClick: true,
    });
    draw.on("drawend", (e) => {
      const fmt = new GeoJSON();
      const geojson = fmt.writeGeometryObject(e.feature.getGeometry()!, {
        dataProjection: "EPSG:4326",
        featureProjection: "EPSG:3857",
      });
      setDrawing(false);
      setUserSelectedRegions((prev) => {
        const n = prev.filter((r) => r.type === "drawn").length + 1;
        const name = `Drawn region ${n}`;
        setClickedRegionNames((prevClicked) => {
          const next = new Set(prevClicked);
          next.add(name);
          setClickedChaNames(next);
          return next;
        });
        return [...prev, { name, geojson, type: "drawn" }];
      });
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


  function loadRegionStats() {
    if (!drawnPolygon) return;
    setRegionLoading(true);
    setRegionStats(null);
    setRegionTime(null);
    setRegionName((prev) => prev ?? "Custom Region");
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

  function viewVesselsInRegion(polygon: object) {
    if (regionLoading) return;
    setRegionLoading(true);
    regionTrackSourceRef.current.clear();
    fetch(`${API}/api/region/vessels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ polygon, start, end }),
    })
      .then((r) => r.json())
      .then((d: { vessel_mmsis: number[]; positions: RegionPosition[] }) => {
        renderRegionPositions(d.positions ?? []);
        setRegionMmsis(new Set(d.vessel_mmsis ?? []));
        setViewVesselsMode(true);
        setShowRegionPanel(false);
        setShowVesselPanel(true);
      })
      .catch(console.error)
      .finally(() => setRegionLoading(false));
  }

  const filtered = useMemo(() => {
    return vessels.filter((v) => {
      if (viewVesselsMode && regionMmsis.size > 0 && !regionMmsis.has(v.mmsi))
        return false;
      if (filters.type.size > 0 && !filters.type.has(classifyType(v.ship_type)))
        return false;
      if (filters.source !== "all" && v.source !== filters.source) return false;
      if (filters.dfo === "dfo" && !(v.vessel_name || "").toLowerCase().includes("ccgs"))
        return false;
      if (filters.dfo === "non-dfo" && (v.vessel_name || "").toLowerCase().includes("ccgs"))
        return false;
      return true;
    });
  }, [vessels, filters, viewVesselsMode, regionMmsis]);

  return (
    <div className="relative w-full h-screen overflow-hidden">
      {/* Map — full screen */}
      <div ref={mapRef} className="absolute inset-0" />

      <CursorCoordinates
        lat={cursorCoord?.lat ?? null}
        lon={cursorCoord?.lon ?? null}
      />

      <button
        onClick={() => setMeasuring((m) => !m)}
        className="absolute bottom-6 left-1 z-10 font-inter text-slate-600 text-xs px-2 py-0.5 border border-slate-400 rounded-full bg-white/80"
      >
        {measuring ? "Cancel" : "Measure"}
      </button>

      {/* Upload modal */}
      {showUploadModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setShowUploadModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-[480px] max-w-[90vw] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-700">Upload data</h2>
              <button onClick={() => setShowUploadModal(false)} className="text-slate-400 hover:text-slate-600 transition">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="px-6 py-5 flex flex-col gap-4">
              <div className="border border-slate-200 rounded-lg p-4 flex flex-col gap-2.5">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-[#3d5a80] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="3,6 9,3 15,6 21,3 21,18 15,21 9,18 3,21" />
                  </svg>
                  <span className="text-xs font-semibold text-slate-600">Region / Shapefile</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">Upload a zipped Shapefile (.zip) to define a custom region and analyse vessel activity within it.</p>
                <label className="self-start cursor-pointer px-3 py-1.5 rounded-md bg-[#3d5a80] text-white text-xs font-medium hover:bg-[#2e4460] transition">
                  Choose .zip
                  <input type="file" className="hidden" accept=".zip" onChange={handleShapefileUpload} />
                </label>
              </div>
              <div className="border border-slate-200 rounded-lg p-4 flex flex-col gap-2.5">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-[#3d5a80] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="5" r="2"/><line x1="12" y1="7" x2="12" y2="19"/><line x1="8" y1="19" x2="16" y2="19"/>
                  </svg>
                  <span className="text-xs font-semibold text-slate-600">Mooring data</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">Upload mooring locations to display on the map. Use the CSV template for the correct format.</p>
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer px-3 py-1.5 rounded-md bg-[#3d5a80] text-white text-xs font-medium hover:bg-[#2e4460] transition">
                    Choose .csv
                    <input type="file" className="hidden" accept=".csv" onChange={handleMooringUpload} />
                  </label>
                  <button onClick={downloadMooringTemplate} className="px-3 py-1.5 rounded-md border border-slate-300 text-slate-500 text-xs font-medium hover:border-slate-400 hover:text-slate-700 transition">
                    Download template
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Server error banner */}
      {serverError && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-red-600 text-white text-xs text-center py-2 px-4 flex items-center justify-center gap-3">
          <span>
            Could not reach the server — vessel data unavailable.{" "}
            <span className="opacity-75">({serverError})</span>
          </span>
          <button
            onClick={() => setServerError(null)}
            className="underline opacity-75 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Mooring hover tooltip */}
      {hoveredMooring && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 bg-[#293241] text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-sm pointer-events-none">
          {hoveredMooring.name} · {hoveredMooring.depth}m ·{" "}
          {hoveredMooring.deployment} → {hoveredMooring.recovery}
        </div>
      )}

      <IconBar
        showVesselPanel={showVesselPanel}
        showRegionPanel={showRegionPanel}
        showLayerPanel={showLayerPanel}
        showMooringPanel={showMooringPanel}
        setShowVesselPanel={setShowVesselPanel}
        setShowRegionPanel={setShowRegionPanel}
        setShowMooringPanel={setShowMooringPanel}
        setShowLayerPanel={setShowLayerPanel}
      />

      {/* Persistent panel toggle button */}
      <div className={`absolute top-3 right-3 z-30 transition-transform duration-300 ease-in-out ${anyPanelOpen ? "" : "rotate-180"}`}>
        <ClosePanelBtn
          onClick={anyPanelOpen ? closeActivePanel : openLastPanel}
          displayType="chevron"
        />
      </div>

      {/* Vessel panel — slides in from the right */}
      <SidePanel open={showVesselPanel}>
        <div className="px-5 pt-8 shrink-0">
          <PanelHeader
            description="Click a vessel to see its track."
            name="Tracks"
          />
          <DateRangePicker
            start={start}
            end={end}
            onStartChange={setStart}
            onEndChange={setEnd}
          />

          {/* Search for a vessel input bar */}
          {/* <div className="relative mb-4">
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
              className="w-full bg-slate-50 border border-transparent rounded-sm pl-9 pr-3 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-[#98c1d9] focus:ring-2 focus:ring-[#98c1d9]/20 transition"
              placeholder="Search name, MMSI, or type…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div> */}
        </div>

        <div className="flex items-center justify-between px-5 py-4 text-xs shadow-sm font-medium text-slate-400 shrink-0">
          <button
            onClick={() => {
              setDraftFilters({ ...filters, type: new Set(filters.type) });
              setShowTypeFilter(true);
            }}
            className={`uppercase tracking-wide transition ${
              filters.type.size > 0 ||
              filters.source !== "all" ||
              filters.dfo !== "all"
                ? "text-[#3d5a80]"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            {(() => {
              const n =
                filters.type.size +
                (filters.source !== "all" ? 1 : 0) +
                (filters.dfo !== "all" ? 1 : 0);
              return n > 0 ? `${n} filter${n > 1 ? "s" : ""}` : "Filter by…";
            })()}
          </button>
          <div className="flex items-center gap-2">
            <span className="tabular-nums">
              {filtered.length !== vessels.length
                ? `${filtered.length} / ${vessels.length}`
                : `${vessels.length}`}
            </span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 px-2 pb-2 pt-2">
          {filtered.length === 0 && (
            <p className="text-sm text-slate-400 p-6 text-center">
              {vessels.length === 0
                ? "Loading vessels…"
                : "No vessels match your search."}
            </p>
          )}
          {filtered.map((v, i) => {
            const type = classifyType(v.ship_type);
            const color = TYPE_COLORS[type] ?? TYPE_COLORS.unknown;
            const active = selected?.mmsi === v.mmsi;
            return (
              <button
                key={v.mmsi}
                id={`vessel-item-${v.mmsi}`}
                style={{ animationDelay: `${Math.min(i * 12, 300)}ms` }}
                onClick={() => {
                  if (active) {
                    setSelected(null);
                    sourceRef.current.clear();
                    setPointCount(null);
                  } else {
                    setSelected(v);
                    sourceRef.current.clear();
                    setPointCount(null);
                    loadRoute(v);
                  }
                }}
                className={`w-full text-left px-3 py-2.5 rounded-sm mb-0.5 transition animate-slide-up ${
                  active ? "bg-slate-100" : "hover:bg-slate-50"
                }`}
                onMouseEnter={() => {
                  if (viewVesselsMode)
                    regionTrackLayerRef.current?.updateStyleVariables({ hoveredMmsi: v.mmsi });
                }}
                onMouseLeave={() => {
                  if (viewVesselsMode)
                    regionTrackLayerRef.current?.updateStyleVariables({ hoveredMmsi: -1 });
                }}
              >
                <div
                  className={`font-inter text-xs truncate ${
                    active ? "text-[#293241]" : "text-slate-600"
                  }`}
                >
                  {v.vessel_name || "Unknown vessel"}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 text-[11px] text-slate-500 capitalize font-geologica">
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
                <div className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
                  {active && pointCount !== null && pointTotal !== null && pointTotal > pointCount
                    ? `showing ${pointCount.toLocaleString()} / ${pointTotal.toLocaleString()} pts`
                    : `${v.point_count.toLocaleString()} pts in range`}
                </div>
              </button>
            );
          })}
        </div>
        <div className="border-t border-slate-100 mx-2 mt-2" />
        <div className="px-3 py-3 flex flex-col gap-1">
          {/* Vessel tracks sizing */}
          <div className="flex flex-col">
            <button onClick={() => setVesselOpen(p => !p)} className="flex items-center gap-2 w-full py-1.5 text-left">
              <span className={`text-[9px] text-slate-400 transition-transform duration-150 ${vesselOpen ? "rotate-90" : ""}`}>▶</span>
              <span className="text-xs text-slate-600 flex-1">Vessel tracks</span>
              <div className="flex items-center gap-1">
                {(["#0a8754", "#ffc857", "#ee6c4d"] as const).map((color) => (
                  <img key={color} src={makeVesselCanvas(color, vesselSize).toDataURL()} style={{ opacity: vesselOpacity, width: vesselSize * 2, height: vesselSize * 2 }} />
                ))}
              </div>
            </button>
            {vesselOpen && (
              <div className="pl-4 pr-1 flex flex-col gap-2 pb-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 w-14 shrink-0">Size</span>
                  <input type="range" min={2} max={14} value={vesselSize} onChange={(e) => setVesselSize(Number(e.target.value))} className="panel-slider w-24" />
                  <div className="flex items-center shrink-0">
                    <input type="number" min={2} max={14} value={vesselSize} onChange={(e) => setVesselSize(Math.min(14, Math.max(2, Number(e.target.value))))} className="w-7 text-[11px] text-slate-400 text-right bg-transparent border-b border-slate-200 outline-none tabular-nums" />
                    <span className="text-[11px] text-slate-400">px</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 w-14 shrink-0">Opacity</span>
                  <input type="range" min={0} max={100} value={Math.round(vesselOpacity * 100)} onChange={(e) => setVesselOpacity(Number(e.target.value) / 100)} className="panel-slider w-24" />
                  <div className="flex items-center shrink-0">
                    <input type="number" min={0} max={100} value={Math.round(vesselOpacity * 100)} onChange={(e) => setVesselOpacity(Math.min(100, Math.max(0, Number(e.target.value))) / 100)} className="w-7 text-[11px] text-slate-400 text-right bg-transparent border-b border-slate-200 outline-none tabular-nums" />
                    <span className="text-[11px] text-slate-400">%</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </SidePanel>

      {/* Regions panel — slides in from the right */}
      <SidePanel open={showRegionPanel}>
        <div className="px-5 pt-8 shrink-0">
          <PanelHeader
            name="Regions"
            description="Select one or more regions to display them on the map."
          />

          <div className="mt-4 mb-4 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <button
                onClick={drawing ? cancelDrawing : startDrawing}
                className="font-inter text-slate-600 text-xs px-2 py-0.5 border border-slate-400 rounded-full"
              >
                {drawing ? "Cancel" : "Draw region"}
              </button>
              <label className="font-stack-headline text-xs text-slate-600">
                {drawing ? "Double-click to finish drawing." : "Click map to add points."}
              </label>
            </div>
            <div className="flex items-center justify-between">
              <label className="font-inter text-slate-600 text-xs px-2 py-0.5 border border-slate-400 rounded-full cursor-pointer">
                Upload
                <input type="file" accept=".zip" className="hidden" onChange={handleShapefileUpload} />
              </label>
              <label className="font-stack-headline text-xs text-slate-600">
                Use your own shapefile (.zip)
              </label>
            </div>
            <hr className="border-slate-200" />
            <div className="flex items-center gap-2">
              <button
                title="Generate plots of daily mean speed, types and vessel traffic density heat-map."
                disabled={!drawnPolygon || regionLoading}
                onClick={loadRegionStats}
                className="font-inter text-slate-600 text-xs px-2 py-0.5 border border-slate-400 rounded-full disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {regionLoading ? "Loading…" : "Analyse region"}
              </button>
              <button
                title="See all vessel traffic in selected region"
                disabled={!drawnPolygon || regionLoading}
                onClick={() => drawnPolygon && viewVesselsInRegion(drawnPolygon)}
                className="font-inter text-slate-600 text-xs px-2 py-0.5 border border-slate-400 rounded-full disabled:opacity-30 disabled:cursor-not-allowed"
              >
                See all traffic
              </button>
            </div>
            {viewVesselsMode && (
              <div className="flex items-center gap-1.5">
                {(["grey", "type", "speed", "vessel"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setRegionDisplayMode(mode)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium font-geologica transition ${
                      regionDisplayMode === mode
                        ? "bg-[#3d5a80] text-white"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}
                  >
                    {mode === "grey" ? "Uniform" : mode === "type" ? "Type" : mode === "speed" ? "Speed" : "Vessel"}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        

        <div className="flex-1 overflow-y-auto min-h-0 px-2 pb-4">
          {/* CHA section */}
          <div className="px-3 pt-3 pb-1 text-[11px] font-semibold font-geologica text-slate-400 uppercase tracking-wider">
            Critical Habitat Areas
          </div>
          {CHA_REGIONS.map((r) => (
            <RegionListItem
              key={r.name}
              label={r.name}
              dotColor="#3d5a80"
              tagLabel="CHA"
              active={clickedRegionNames.has(r.name)}
              onClick={() => {
                const hiding = clickedRegionNames.has(r.name);
                toggleClickedRegion(r.name);
                if (hiding) {
                  if (getSelectedChaName() === r.name) {
                    setSelectedChaName(null);
                    chaSourceRef.current.changed();
                  }
                  if (regionName === r.name) {
                    setDrawnPolygon(null);
                    setRegionName(null);
                    regionTrackSourceRef.current.clear();
                    setViewVesselsMode(false);
                    setRegionMmsis(new Set());
                  }
                }
              }}
            />
          ))}

          {/* WEA section */}
          <div className="px-3 pt-3 pb-1 text-[11px] font-semibold font-geologica text-slate-400 uppercase tracking-wider">
            Wind Energy Areas
          </div>
          {WEA_REGIONS.map((r) => (
            <RegionListItem
              key={r.name}
              label={r.name}
              dotColor="#ee6c4d"
              tagLabel="WEA"
              active={clickedRegionNames.has(r.name)}
              onClick={() => {
                const hiding = clickedRegionNames.has(r.name);
                toggleClickedRegion(r.name);
                if (hiding) {
                  if (getSelectedChaName() === r.name) {
                    setSelectedChaName(null);
                    chaSourceRef.current.changed();
                  }
                  if (regionName === r.name) {
                    setDrawnPolygon(null);
                    setRegionName(null);
                    regionTrackSourceRef.current.clear();
                    setViewVesselsMode(false);
                    setRegionMmsis(new Set());
                  }
                }
              }}
            />
          ))}

          {/* Uploaded regions */}
          {uploadedRegions.length > 0 && (
            <>
              <div className="px-3 pt-4 pb-1 text-[11px] font-semibold font-geologica text-slate-400 uppercase tracking-wider">
                Uploaded
              </div>
              {uploadedRegions.map((r) => (
                <RegionListItem
                  key={r.name}
                  label={r.name}
                  dotColor="#9b59b6"
                  tagLabel="Uploaded"
                  active={clickedRegionNames.has(r.name)}
                  onClick={() => toggleClickedRegion(r.name)}
                />
              ))}
            </>
          )}

          {/* Your regions (drawn) — at bottom */}
          {userSelectedRegions.length > 0 && (
            <>
              <div className="px-3 pt-4 pb-1 text-[11px] font-semibold font-geologica text-slate-400 uppercase tracking-wider">
                Your regions
              </div>
              {userSelectedRegions.map((r) => (
                <RegionListItem
                  key={r.name}
                  label={drawnRegionLabel(r.geojson)}
                  dotColor="#98c1d9"
                  tagLabel="Drawn"
                  active={clickedRegionNames.has(r.name)}
                  onClick={() => {
                    const hiding = clickedRegionNames.has(r.name);
                    toggleClickedRegion(r.name);
                    if (hiding) {
                      if (getSelectedChaName() === r.name) {
                        setSelectedChaName(null);
                        chaSourceRef.current.changed();
                      }
                      if (regionName === r.name) {
                        setDrawnPolygon(null);
                        setRegionName(null);
                        regionTrackSourceRef.current.clear();
                        setViewVesselsMode(false);
                        setRegionMmsis(new Set());
                      }
                    }
                  }}
                  onRemove={(e) => {
                    e.stopPropagation();
                    if (!window.confirm(`Remove this drawn region?`)) return;
                    setUserSelectedRegions((prev) =>
                      prev.filter((x) => x.name !== r.name)
                    );
                    if (regionName === r.name) {
                      setDrawnPolygon(null);
                      setRegionName(null);
                      drawSourceRef.current.clear();
                      regionTrackSourceRef.current.clear();
                      setViewVesselsMode(false);
                      setRegionMmsis(new Set());
                      setRegionStats(null);
                    }
                  }}
                />
              ))}
            </>
          )}
        </div>
        <div className="border-t border-slate-100 mx-2 mt-2" />
        <div className="px-3 py-3 flex flex-col gap-1">
          <div className="flex flex-col">
            <button onClick={() => setRegionDotOpen(p => !p)} className="flex items-center gap-2 w-full py-1.5 text-left">
              <span className={`text-[9px] text-slate-400 transition-transform duration-150 ${regionDotOpen ? "rotate-90" : ""}`}>▶</span>
              <span className="text-xs text-slate-600 flex-1">Region vessels</span>
              <div className="rounded-full bg-[#5a5a5a] shrink-0" style={{ width: regionDotSize * 2, height: regionDotSize * 2, opacity: regionDotOpacity }} />
            </button>
            {regionDotOpen && (
              <div className="pl-4 pr-1 flex flex-col gap-2 pb-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 w-14 shrink-0">Size</span>
                  <input type="range" min={2} max={14} value={regionDotSize} onChange={(e) => setRegionDotSize(Number(e.target.value))} className="panel-slider w-24" />
                  <div className="flex items-center shrink-0">
                    <input type="number" min={2} max={14} value={regionDotSize} onChange={(e) => setRegionDotSize(Math.min(14, Math.max(2, Number(e.target.value))))} className="w-7 text-[11px] text-slate-400 text-right bg-transparent border-b border-slate-200 outline-none tabular-nums" />
                    <span className="text-[11px] text-slate-400">px</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 w-14 shrink-0">Opacity</span>
                  <input type="range" min={0} max={100} value={Math.round(regionDotOpacity * 100)} onChange={(e) => setRegionDotOpacity(Number(e.target.value) / 100)} className="panel-slider w-24" />
                  <div className="flex items-center shrink-0">
                    <input type="number" min={0} max={100} value={Math.round(regionDotOpacity * 100)} onChange={(e) => setRegionDotOpacity(Math.min(100, Math.max(0, Number(e.target.value))) / 100)} className="w-7 text-[11px] text-slate-400 text-right bg-transparent border-b border-slate-200 outline-none tabular-nums" />
                    <span className="text-[11px] text-slate-400">%</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </SidePanel>

      {/* Overlay panel — slides in from the right */}
      {/* Mooring panel */}
      <SidePanel open={showMooringPanel}>
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="px-5 pt-8 shrink-0">
            <PanelHeader
              name="Moorings"
              description="Filter by date to see active mooring locations."
              className="mb-4"
            />
            <DateRangePicker start={start} end={end} onStartChange={setStart} onEndChange={setEnd} />
            <div className="mt-3 flex flex-row justify-between items-center">
              <label className="font-inter text-slate-600 text-xs px-2 py-0.5 border border-slate-400 rounded-full cursor-pointer">
                Upload
                <input type="file" accept=".csv" className="hidden" onChange={handleMooringUpload} />
              </label>
              <span onClick={downloadMooringTemplate} className="font-stack-headline text-xs text-slate-600 border-b border-slate-400 cursor-pointer">
                CSV template
              </span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 px-2 pb-4 mt-4">
            <div className="px-3 pt-1 pb-1 text-[11px] font-semibold font-geologica text-slate-400 uppercase tracking-wider">AMAR</div>
            {AMAR_MOORINGS.filter((m) => m.deployment <= end && m.recovery >= start).length === 0 && (
              <p className="text-xs text-slate-400 px-3 py-1">None active in this period.</p>
            )}
            {AMAR_MOORINGS.filter((m) => m.deployment <= end && m.recovery >= start).map((m) => (
              <div key={m.name} className="px-3 py-2.5 rounded-sm hover:bg-slate-50 cursor-pointer"
                onMouseEnter={() => { highlightedMooringRef.current = m.name; mooringSourceRef.current.changed(); }}
                onMouseLeave={() => { highlightedMooringRef.current = null; mooringSourceRef.current.changed(); }}
                onClick={() => {
                  if (mooringPopup?.mooring.name === m.name) { setMooringPopup(null); return; }
                  const pixel = mapObj.current?.getPixelFromCoordinate(fromLonLat([m.lon, m.lat]));
                  if (pixel) setMooringPopup({ x: pixel[0], y: pixel[1], mooring: m });
                }}>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#293241] inline-block shrink-0" />
                  <span className="text-sm font-medium text-slate-600">{m.name}</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">{m.depth}m · {m.deployment} → {m.recovery}</div>
              </div>
            ))}
            {uploadedMoorings.length > 0 && (
              <>
                <div className="px-3 pt-3 pb-1 text-[11px] font-semibold font-geologica text-slate-400 uppercase tracking-wider">Uploaded</div>
                {uploadedMoorings.filter((m) => m.deployment <= end && m.recovery >= start).length === 0 && (
                  <p className="text-xs text-slate-400 px-3 py-1">None active in this period.</p>
                )}
                {uploadedMoorings.filter((m) => m.deployment <= end && m.recovery >= start).map((m) => (
                  <div key={m.name} className="px-3 py-2.5 rounded-sm hover:bg-slate-50 cursor-pointer"
                    onMouseEnter={() => { highlightedMooringRef.current = m.name; mooringSourceRef.current.changed(); }}
                    onMouseLeave={() => { highlightedMooringRef.current = null; mooringSourceRef.current.changed(); }}
                    onClick={() => {
                      if (mooringPopup?.mooring.name === m.name) { setMooringPopup(null); return; }
                      const pixel = mapObj.current?.getPixelFromCoordinate(fromLonLat([m.lon, m.lat]));
                      if (pixel) setMooringPopup({ x: pixel[0], y: pixel[1], mooring: m });
                    }}>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#293241] inline-block shrink-0" />
                      <span className="text-sm font-medium text-slate-600">{m.name}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{m.depth}m · {m.deployment} → {m.recovery}</div>
                  </div>
                ))}
              </>
            )}
          </div>
          <div className="border-t border-slate-100 mx-2 mt-2" />
          <div className="px-3 py-3 flex flex-col gap-1 shrink-0">
            <div className="flex flex-col">
              <button onClick={() => setMooringOpen(p => !p)} className="flex items-center gap-2 w-full py-1.5 text-left">
                <span className={`text-[9px] text-slate-400 transition-transform duration-150 ${mooringOpen ? "rotate-90" : ""}`}>▶</span>
                <span className="text-xs text-slate-600 flex-1">Moorings</span>
                <img src={makeMooringCanvas(false, mooringSize).toDataURL()} style={{ opacity: mooringOpacity, width: mooringSize * 2, height: mooringSize * 2 }} />
              </button>
              {mooringOpen && (
                <div className="pl-4 pr-1 flex flex-col gap-2 pb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400 w-14 shrink-0">Size</span>
                    <input type="range" min={2} max={20} value={mooringSize} onChange={(e) => setMooringSize(Number(e.target.value))} className="panel-slider w-24" />
                    <div className="flex items-center shrink-0">
                      <input type="number" min={2} max={20} value={mooringSize} onChange={(e) => setMooringSize(Math.min(20, Math.max(2, Number(e.target.value))))} className="w-7 text-[11px] text-slate-400 text-right bg-transparent border-b border-slate-200 outline-none tabular-nums" />
                      <span className="text-[11px] text-slate-400">px</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400 w-14 shrink-0">Opacity</span>
                    <input type="range" min={0} max={100} value={Math.round(mooringOpacity * 100)} onChange={(e) => setMooringOpacity(Number(e.target.value) / 100)} className="panel-slider w-24" />
                    <div className="flex items-center shrink-0">
                      <input type="number" min={0} max={100} value={Math.round(mooringOpacity * 100)} onChange={(e) => setMooringOpacity(Math.min(100, Math.max(0, Number(e.target.value))) / 100)} className="w-7 text-[11px] text-slate-400 text-right bg-transparent border-b border-slate-200 outline-none tabular-nums" />
                      <span className="text-[11px] text-slate-400">%</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </SidePanel>

      <SidePanel open={showLayerPanel}>
        {/* LAYERS */}
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="px-5 pt-8 pb-4 shrink-0">
            <PanelHeader
              name="Map"
              description="Switch base map and toggle data overlays."
              className=""
            />
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 px-2 pb-4">
            <div className="px-3 pt-1 pb-1 text-[11px] font-semibold font-geologica text-slate-400 uppercase tracking-wider">
              Ocean
            </div>
            <div className="px-3 py-2.5 rounded-sm hover:bg-slate-50">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showBathymetry}
                  onChange={() => setShowBathymetry((p) => !p)}
                  className="accent-[#3d5a80] w-4 h-4 rounded"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-600">Bathymetry</span>
                    {bathyLoading && <span className="inline-block w-3 h-3 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />}
                  </div>
                  <div className="text-[11px] text-slate-400">NRCan / DFO — Scotian Shelf &amp; NL Shelves</div>
                </div>
              </label>
              {showBathymetry && (
                <div className="mt-2 ml-7 flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 w-12 shrink-0">Opacity</span>
                  <input
                    type="range" min={0} max={100} value={Math.round(bathyOpacity * 100)}
                    onChange={(e) => setBathyOpacity(Number(e.target.value) / 100)}
                    className="panel-slider w-24"
                  />
                  <input
                    type="number" min={0} max={100} value={Math.round(bathyOpacity * 100)}
                    onChange={(e) => setBathyOpacity(Math.min(100, Math.max(0, Number(e.target.value))) / 100)}
                    className="w-8 text-[11px] text-slate-400 text-right bg-transparent border-none outline-none"
                  />
                  <span className="text-[11px] text-slate-400">%</span>
                </div>
              )}
            </div>
            <div className="px-3 py-2.5 rounded-sm hover:bg-slate-50">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showNoise}
                  onChange={() => setShowNoise((p) => !p)}
                  className="accent-[#3d5a80] w-4 h-4 rounded"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-600">Noise model</span>
                    {noiseLoading && <span className="inline-block w-3 h-3 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />}
                  </div>
                  <div className="text-[11px] text-slate-400">Modelled underwater sound pressure level</div>
                </div>
              </label>
              {showNoise && (
                <div className="mt-2 ml-7 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400 w-12 shrink-0">Opacity</span>
                    <input
                      type="range" min={0} max={100} value={Math.round(noiseOpacity * 100)}
                      onChange={(e) => setNoiseOpacity(Number(e.target.value) / 100)}
                      className="panel-slider w-24"
                    />
                    <input
                      type="number" min={0} max={100} value={Math.round(noiseOpacity * 100)}
                      onChange={(e) => setNoiseOpacity(Math.min(100, Math.max(0, Number(e.target.value))) / 100)}
                      className="w-8 text-[11px] text-slate-400 text-right bg-transparent border-none outline-none"
                    />
                    <span className="text-[11px] text-slate-400">%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400 w-12 shrink-0">Variable</span>
                    <select value={noiseVariable} onChange={(e) => setNoiseVariable(e.target.value)}
                      className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 flex-1">
                      <option value="vessel_noise">Vessel noise</option>
                      <option value="combined_noise">Combined noise</option>
                      <option value="wind_noise">Wind noise</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400 w-12 shrink-0">Date</span>
                    <select value={noiseDate} onChange={(e) => setNoiseDate(e.target.value)}
                      className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 flex-1">
                      {(noiseDates.length > 0 ? noiseDates : [noiseDate]).map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  {(() => {
                    const freqs = [...new Set((noiseAvailable[noiseVariable] ?? []).map(o => o.freq))].sort((a, b) => a - b);
                    const depths = [...new Set((noiseAvailable[noiseVariable] ?? []).filter(o => o.freq === noiseFreq).map(o => o.depth))].sort((a, b) => a - b);
                    return <>
                      {freqs.length > 1 && (
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-400 w-12 shrink-0">Freq</span>
                          <select value={noiseFreq} onChange={(e) => setNoiseFreq(Number(e.target.value))}
                            className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 flex-1">
                            {freqs.map(f => <option key={f} value={f}>{f} Hz</option>)}
                          </select>
                        </div>
                      )}
                      {noiseVariable !== "wind_noise" && depths.length > 1 && (
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-400 w-12 shrink-0">Depth</span>
                          <select value={noiseDepth} onChange={(e) => setNoiseDepth(Number(e.target.value))}
                            className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 flex-1">
                            {depths.map(d => <option key={d} value={d}>{d} m</option>)}
                          </select>
                        </div>
                      )}
                    </>;
                  })()}
                  <div className="mt-1 flex flex-col gap-1">
                    <div
                      className="noise-gradient-bar h-2.5 rounded-full w-full"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>{noiseRange ? `${noiseRange.vmin.toFixed(1)} dB` : "Low dB"}</span>
                      <span>{noiseRange ? `${noiseRange.vmax.toFixed(1)} dB` : "High dB"}</span>
                    </div>
                    <div className="text-[9px] text-slate-300 italic">relative scale per render</div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="border-t border-slate-100 mx-2 mt-2" />
          <div className="px-5 py-4 shrink-0">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Base map</p>
            <div className="flex flex-col gap-1">
              {BASEMAPS.map((b) => (
                <label key={b.id} title={b.tooltip} className="flex items-center gap-2 cursor-pointer py-0.5">
                  <input
                    type="radio"
                    name="basemap"
                    value={b.id}
                    checked={basemap === b.id}
                    onChange={() => setBasemap(b.id)}
                    className="accent-[#3d5a80]"
                  />
                  <span className="text-sm text-slate-700">{b.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </SidePanel>

      {/* Vessel type filter modal */}
      {showTypeFilter && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fade-in"
          onClick={() => setShowTypeFilter(false)}
        >
          <div
            className="bg-white rounded-lg shadow-sm w-full max-w-sm animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800">
                Filter vessels
              </h2>
              <ClosePanelBtn
                onClick={() => setShowTypeFilter(false)}
                displayType="cross"
              />
            </div>
            <div className="px-6 py-5 flex flex-col gap-5">
              {/* Vessel type — pills */}
              <div className="flex flex-col gap-2">
                <span className="text-sm text-slate-600">Vessel type</span>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      "cargo",
                      "tanker",
                      "fishing",
                      "passenger",
                      "search & rescue",
                      "other",
                      "unknown",
                    ] as const
                  ).map((t) => {
                    const on = draftFilters.type.has(t);
                    const color = TYPE_COLORS[t];
                    return (
                      <button
                        key={t}
                        onClick={() =>
                          setDraftFilters((prev) => {
                            const next = new Set(prev.type);
                            on ? next.delete(t) : next.add(t);
                            return { ...prev, type: next };
                          })
                        }
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium font-geologica border transition ${
                          on
                            ? "border-transparent text-white"
                            : "border-slate-200 text-slate-600 hover:border-slate-300"
                        }`}
                        style={on ? { backgroundColor: color } : {}}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{
                            backgroundColor: on
                              ? "rgba(255,255,255,0.7)"
                              : color,
                          }}
                        />
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* Dropdowns for the other two */}
              {[
                {
                  key: "source" as const,
                  label: "AIS source",
                  options: [
                    { value: "all", label: "All sources" },
                    { value: "terrestrial", label: "Terrestrial" },
                    { value: "satellite", label: "Satellite" },
                  ],
                },
                {
                  key: "dfo" as const,
                  label: "DFO vessels",
                  options: [
                    { value: "all", label: "All vessels" },
                    { value: "dfo", label: "DFO only" },
                    { value: "non-dfo", label: "Non-DFO only" },
                  ],
                },
              ].map(({ key, label, options }) => (
                <div
                  key={key}
                  className="flex items-center justify-between gap-4"
                >
                  <span className="text-sm text-slate-600 shrink-0">
                    {label}
                  </span>
                  <select
                    value={draftFilters[key]}
                    onChange={(e) =>
                      setDraftFilters((prev) => ({
                        ...prev,
                        [key]: e.target.value,
                      }))
                    }
                    className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 outline-none focus:border-[#98c1d9] focus:ring-2 focus:ring-[#98c1d9]/20 transition cursor-pointer"
                  >
                    {options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between px-6 pb-5">
              <button
                onClick={() =>
                  setDraftFilters({
                    type: new Set(),
                    source: "all",
                    dfo: "all",
                  })
                }
                className="text-sm text-slate-400 hover:text-slate-600 transition"
              >
                Reset
              </button>
              <button
                onClick={() => {
                  setFilters(draftFilters);
                  setShowTypeFilter(false);
                }}
                className="px-4 py-1.5 rounded-full bg-[#3d5a80] text-white text-sm font-medium hover:bg-[#293241] transition"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Results modal */}
      {(showResults || closingResults) && regionStats && (
        <div
          className={`absolute inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 ${
            closingResults ? "animate-fade-out" : "animate-fade-in"
          }`}
          onClick={() => closeResults()}
        >
          {/* actual white area */}
          <div
            className={`bg-white rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col ${
              closingResults ? "animate-scale-out" : "animate-scale-in"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between px-7 pt-6 pb-5 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="text-xl font-inter font-semibold text-slate-800">
                  {regionName ?? "Region Analysis"}
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  <span className="font-medium text-slate-600">
                    Selected: {regionStats.unique_vessels}
                  </span>{" "}
                  vessels ·{" "}
                  <span className="font-medium text-slate-600">
                    {regionStats.total_positions.toLocaleString()}
                  </span>{" "}
                  positions · {start} to {end}
                  {regionTime !== null && (
                    <span className="text-slate-400">
                      {" "}
                      · {(regionTime / 1000).toFixed(1)}s
                    </span>
                  )}
                </p>
              </div>
              <ClosePanelBtn onClick={closeResults} displayType="cross" />
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
                        <span className="text-sm font-semibold text-slate-600 font-stack-headline">
                          Breakdown of vessel types by day.
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
                        className="w-full rounded-sm ring-1 ring-slate-100"
                      />
                    </figure>
                  )}
                  {regionStats.plots?.speed_overall && (
                    <figure>
                      <figcaption className="flex items-center justify-between mb-2.5">
                        <span className="text-sm font-semibold text-slate-600 font-stack-headline">
                          Mean speed of all vessels, daily.
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
                        className="w-full rounded-sm ring-1 ring-slate-100"
                      />
                    </figure>
                  )}
                  {regionStats.plots?.vessel_density && (
                    <figure>
                      <figcaption className="flex items-center justify-between mb-2.5">
                        <span className="text-sm font-semibold text-slate-600 font-stack-headline">
                          Regional traffic displayed in a heat map.
                        </span>
                        <button
                          onClick={() =>
                            downloadPlot(
                              regionStats.plots.vessel_density!,
                              "vessel_density.png"
                            )
                          }
                          className="text-xs font-medium text-[#98c1d9] hover:bg-[#98c1d9]/10 rounded-full px-3 py-1 transition"
                        >
                          ↓ Download
                        </button>
                      </figcaption>
                      <img
                        src={`data:image/png;base64,${regionStats.plots.vessel_density}`}
                        className="w-full rounded-sm ring-1 ring-slate-100"
                      />
                    </figure>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mooring popup */}
      {mooringPopup && (
        <div
          className="absolute z-30 bg-white ring-1 ring-slate-900/5 rounded-sm shadow-sm px-4 py-3 text-xs pointer-events-none animate-scale-in"
          style={{ left: mooringPopup.x + 12, top: mooringPopup.y - 8 }}
        >
          <div className="font-semibold text-[#3d5a80] mb-1.5">
            {mooringPopup.mooring.name}
          </div>
          <div className="text-slate-600 space-y-1 tabular-nums">
            <div>
              <span className="text-slate-400 inline-block w-20">Latitude</span>
              {mooringPopup.mooring.lat.toFixed(4)}°N
            </div>
            <div>
              <span className="text-slate-400 inline-block w-20">
                Longitude
              </span>
              {mooringPopup.mooring.lon.toFixed(4)}°
            </div>
            <div>
              <span className="text-slate-400 inline-block w-20">Depth</span>
              {mooringPopup.mooring.depth}m
            </div>
            <div>
              <span className="text-slate-400 inline-block w-20">Deployed</span>
              {mooringPopup.mooring.deployment}
            </div>
            <div>
              <span className="text-slate-400 inline-block w-20">
                Recovered
              </span>
              {mooringPopup.mooring.recovery}
            </div>
          </div>
        </div>
      )}

      {/* Point popup */}
      {popup && (
        <div
          className="absolute z-30 bg-white ring-1 ring-slate-900/5 rounded-sm shadow-sm px-4 py-3 text-xs pointer-events-none animate-scale-in"
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

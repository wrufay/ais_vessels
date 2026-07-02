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
import OLPolygon from "ol/geom/Polygon";
import VectorLayer from "ol/layer/Vector";
import WebGLPointsLayer from "ol/layer/WebGLPoints";
import VectorSource from "ol/source/Vector";
import { Style, Stroke, Fill, Icon } from "ol/style";
import Draw from "ol/interaction/Draw";
import GeoJSON from "ol/format/GeoJSON";
import shp from "shpjs";
import "ol/ol.css";
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
  TYPE_NUM,
  makeFeatureStyle,
  makeMooringCanvas,
  makeVesselCanvas,
  chaStyle,
  drawnRegionLabel,
  downloadPlot,
  setSelectedChaName,
  setClickedChaNames,
} from "./utils/mapStyles";
import PanelHeader from "./components/PanelHeader";
import DateRangePicker from "./components/DateRangePicker";
import RegionListItem from "./components/RegionListItem";
import SidePanel from "./components/SidePanel";
import IconBar from "./components/IconBar";
import CursorCoordinates from "./components/CursorCoordinates";
import SizingSlider from "./components/SizingSlider";
import ClosePanelBtn from "./components/ClosePanelBtn";

const API = import.meta.env.VITE_API_URL ?? "";

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
  const noiseLayerRef = useRef<ImageLayer<ImageStatic> | null>(null);
  const regionTrackSourceRef = useRef(new VectorSource());
  const regionTrackLayerRef = useRef<WebGLPointsLayer | null>(null);
  const highlightSourceRef = useRef(new VectorSource());
  const highlightLayerRef = useRef<VectorLayer | null>(null);
  const hoveredRegionVesselRef = useRef<number | null>(null);
  const regionRouteCacheRef = useRef<Record<number, RoutePoint[]>>({});
  const regionDisplayModeRef = useRef<"grey" | "type" | "speed">("grey");

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
  const [showCustomizePanel, setShowCustomizePanel] = useState(false);
  const [lastOpenedPanel, setLastOpenedPanel] = useState<
    "vessel" | "region" | "layer" | "customize"
  >("vessel");
  const [clickedRegionNames, setClickedRegionNames] = useState<Set<string>>(
    new Set()
  );
  const [uploadedRegions, setUploadedRegions] = useState<PresetRegion[]>([]);
  const [uploadedMoorings, setUploadedMoorings] = useState<Mooring[]>([]);
  const [hoveredMooring, setHoveredMooring] = useState<Mooring | null>(null);
  const [showBathymetry, setShowBathymetry] = useState(false);
  const [showNoise, setShowNoise] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [regionVessels, setRegionVessels] = useState<Vessel[]>([]);
  const [hoveredRegionVessel, setHoveredRegionVessel] = useState<number | null>(
    null
  );
  const [viewVesselsMode, setViewVesselsMode] = useState(false);
  const [regionDisplayMode, setRegionDisplayMode] = useState<
    "grey" | "type" | "speed"
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
  useEffect(() => {
    if (showVesselPanel) setLastOpenedPanel("vessel");
    else if (showRegionPanel) setLastOpenedPanel("region");
    else if (showLayerPanel) setLastOpenedPanel("layer");
    else if (showCustomizePanel) setLastOpenedPanel("customize");
  }, [showVesselPanel, showRegionPanel, showLayerPanel, showCustomizePanel]);
  const anyPanelOpen =
    showVesselPanel || showRegionPanel || showLayerPanel || showCustomizePanel;
  function closeActivePanel() {
    setShowVesselPanel(false);
    setShowRegionPanel(false);
    setShowLayerPanel(false);
    setShowCustomizePanel(false);
  }
  function openLastPanel() {
    if (lastOpenedPanel === "vessel") setShowVesselPanel(true);
    else if (lastOpenedPanel === "region") setShowRegionPanel(true);
    else if (lastOpenedPanel === "layer") setShowLayerPanel(true);
    else if (lastOpenedPanel === "customize") setShowCustomizePanel(true);
  }
  const mooringSizeRef = useRef(10);
  const vesselSizeRef = useRef(5);
  useEffect(() => {
    mooringSizeRef.current = mooringSize;
    mooringSourceRef.current.changed();
  }, [mooringSize]);
  useEffect(() => {
    vesselSizeRef.current = vesselSize;
    routeLayerRef.current?.setStyle(makeFeatureStyle(true, true, vesselSize));
  }, [vesselSize]);
  useEffect(() => {
    regionTrackLayerRef.current?.updateStyleVariables({
      dotSize: regionDotSize,
    });
  }, [regionDotSize]);

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
    const regionTrackLayer = new WebGLPointsLayer({
      source: regionTrackSourceRef.current,
      style: REGION_WEBGL_STYLE as any,
    });
    regionTrackLayerRef.current = regionTrackLayer;

    const highlightLayer = new VectorLayer({
      source: highlightSourceRef.current,
      style: makeFeatureStyle(true, true),
    });
    highlightLayerRef.current = highlightLayer;

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

    const map = new Map({
      target: mapRef.current,
      layers: [
        new TileLayer({
          source: new XYZ({
            url: `https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}.png?api_key=${
              import.meta.env.VITE_STADIA_KEY
            }`,
            attributions:
              '© <a href="https://stamen.com">Stamen Design</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 18,
          }),
        }),
        bathyLayer,
        noiseLayer,
        chaLayer,
        mooringLayer,
        regionTrackLayer,
        highlightLayer,
        routeLayer,
        new VectorLayer({
          source: drawSourceRef.current,
          style: new Style({
            stroke: new Stroke({ color: "#98c1d9", width: 2 }),
            fill: new Fill({ color: "rgba(152,193,217,0.1)" }),
          }),
        }),
      ],
      view: new View({
        center: fromLonLat([-63.5, 44.5]),
        zoom: 6,
      }),
    });

    map.on("click", (e) => {
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
    noiseLayerRef.current?.setVisible(showNoise);
  }, [showNoise]);

  useEffect(() => {
    regionDisplayModeRef.current = regionDisplayMode;
    const modeNum =
      regionDisplayMode === "type" ? 1 : regionDisplayMode === "speed" ? 2 : 0;
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

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
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
    highlightSourceRef.current.clear();
    hoveredRegionVesselRef.current = null;
    setHoveredRegionVessel(null);
    regionRouteCacheRef.current = {};
    console.log(`[region] rendering ${positions.length} positions`);
    positions.forEach((p) => {
      regionTrackSourceRef.current.addFeature(
        new Feature({
          geometry: new Point(fromLonLat([p.lon, p.lat])),
          mmsi: p.mmsi,
          sog: p.sog ?? 0,
          ship_type: p.ship_type,
          type_num: TYPE_NUM[classifyType(p.ship_type)] ?? 0,
        })
      );
    });
    console.log(
      `[region] source has ${
        regionTrackSourceRef.current.getFeatures().length
      } features`
    );
  }

  function hoverRegionVessel(mmsi: number) {
    hoveredRegionVesselRef.current = mmsi;
    setHoveredRegionVessel(mmsi);
    const cached = regionRouteCacheRef.current[mmsi];
    if (cached) {
      renderHighlight(mmsi, cached);
      return;
    }
    const params = new URLSearchParams({
      start: `${start}T00:00:00`,
      end: `${end}T23:59:59`,
    });
    fetch(`${API}/api/vessel/${mmsi}/route?${params}`)
      .then((r) => r.json())
      .then((data: { points: RoutePoint[] }) => {
        const pts = data.points || [];
        regionRouteCacheRef.current[mmsi] = pts;
        if (hoveredRegionVesselRef.current === mmsi) renderHighlight(mmsi, pts);
      })
      .catch(() => {});
  }

  function renderHighlight(mmsi: number, pts: RoutePoint[]) {
    highlightSourceRef.current.clear();
    pts.forEach((p, i) => {
      highlightSourceRef.current.addFeature(
        new Feature({
          geometry: new Point(fromLonLat([p.longitude, p.latitude])),
          mmsi,
          sog: p.sog,
          cog: p.cog,
          time: p.time,
          lat: p.latitude,
          lon: p.longitude,
          source: p.source,
          isStart: i === 0,
          isEnd: i === pts.length - 1,
        })
      );
    });
  }

  function unhoverRegionVessel() {
    hoveredRegionVesselRef.current = null;
    setHoveredRegionVessel(null);
    highlightSourceRef.current.clear();
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
      setUserSelectedRegions((prev) => {
        const n = prev.filter((r) => r.type === "drawn").length + 1;
        const name = `Drawn region ${n}`;
        setRegionName(name);
        setSelectedChaName(name);
        chaSourceRef.current.changed();
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
      drawSourceRef.current.clear();
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
    regionTrackSourceRef.current.clear();
    highlightSourceRef.current.clear();
    regionRouteCacheRef.current = {};
    hoveredRegionVesselRef.current = null;
    regionDisplayModeRef.current = "grey";
    setRegionVessels([]);
    setHoveredRegionVessel(null);
    setViewVesselsMode(false);
    setRegionDisplayMode("grey");
    setDrawnPolygon(null);
    setRegionStats(null);
    setRegionTime(null);
    setRegionName(null);
    setSelectedChaName(null);
    chaSourceRef.current.changed();
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
    highlightSourceRef.current.clear();
    regionRouteCacheRef.current = {};
    fetch(`${API}/api/region/vessels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ polygon, start, end }),
    })
      .then((r) => r.json())
      .then((d: { vessel_mmsis: number[]; positions: RegionPosition[] }) => {
        const rv = vessels.filter((v) =>
          (d.vessel_mmsis ?? []).includes(v.mmsi)
        );
        setRegionVessels(rv);
        renderRegionPositions(d.positions ?? []);
        setViewVesselsMode(true);
        setShowVesselPanel(true);
        setShowRegionPanel(false);
      })
      .catch(console.error)
      .finally(() => setRegionLoading(false));
  }

  const activeVesselList = regionVessels.length > 0 ? regionVessels : vessels;
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return activeVesselList.filter((v) => {
      if (filters.type.size > 0 && !filters.type.has(classifyType(v.ship_type)))
        return false;
      if (filters.source !== "all" && v.source !== filters.source) return false;
      if (
        filters.dfo === "dfo" &&
        !(v.vessel_name || "").toLowerCase().includes("ccgs")
      )
        return false;
      if (
        filters.dfo === "non-dfo" &&
        (v.vessel_name || "").toLowerCase().includes("ccgs")
      )
        return false;
      return (
        String(v.mmsi).includes(q) ||
        (v.vessel_name || "").toLowerCase().includes(q) ||
        String(v.ship_type || "")
          .toLowerCase()
          .includes(q)
      );
    });
  }, [activeVesselList, search, filters]);

  return (
    <div className="relative w-full h-screen overflow-hidden">
      {/* Map — full screen */}
      <div ref={mapRef} className="absolute inset-0" />

      <CursorCoordinates
        lat={cursorCoord?.lat ?? null}
        lon={cursorCoord?.lon ?? null}
      />

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
        showCustomizePanel={showCustomizePanel}
        setShowVesselPanel={setShowVesselPanel}
        setShowRegionPanel={setShowRegionPanel}
        setShowMooringPanel={setShowMooringPanel}
        setShowLayerPanel={setShowLayerPanel}
        setShowCustomizePanel={setShowCustomizePanel}
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
        <div className="px-5 pt-8 pb-4 shrink-0">
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
              className="w-full bg-slate-50 border border-transparent rounded-sm pl-9 pr-3 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-[#98c1d9] focus:ring-2 focus:ring-[#98c1d9]/20 transition"
              placeholder="Search name, MMSI, or type…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {viewVesselsMode && (
          <div className="px-5 py-2.5 border-t border-slate-100 shrink-0 flex items-center gap-1.5">
            {(["grey", "type", "speed"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setRegionDisplayMode(mode)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                  regionDisplayMode === mode
                    ? "bg-[#3d5a80] text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                {mode === "grey"
                  ? "Uniform"
                  : mode === "type"
                  ? "Ship type"
                  : "Speed"}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between px-5 py-2.5 text-xs font-medium text-slate-400 border-t border-slate-100 shrink-0">
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
              {regionVessels.length > 0
                ? `${filtered.length} / ${regionVessels.length}`
                : filtered.length !== vessels.length
                ? `${filtered.length} / ${vessels.length}`
                : `${vessels.length}`}
            </span>
            {regionVessels.length > 0 && (
              <ClosePanelBtn
                onClick={() => {
                  setRegionVessels([]);
                  regionTrackSourceRef.current.clear();
                  highlightSourceRef.current.clear();
                  regionRouteCacheRef.current = {};
                  hoveredRegionVesselRef.current = null;
                  setHoveredRegionVessel(null);
                }}
              />
            )}
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
                onMouseEnter={() => {
                  if (regionVessels.length > 0) hoverRegionVessel(v.mmsi);
                }}
                onMouseLeave={() => {
                  if (regionVessels.length > 0) unhoverRegionVessel();
                }}
                className={`w-full text-left px-3 py-2.5 rounded-sm mb-0.5 transition animate-slide-up ${
                  active
                    ? "bg-slate-100"
                    : hoveredRegionVessel === v.mmsi
                    ? "bg-slate-100"
                    : "hover:bg-slate-50"
                }`}
              >
                <div
                  className={`font-medium truncate ${
                    active ? "text-[#293241]" : "text-slate-600"
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
                      : pointTotal !== null
                      ? `Showing 500 of ${pointTotal.toLocaleString()} points (subsampled)`
                      : `${pointCount.toLocaleString()} position points in range`}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </SidePanel>

      {/* Regions panel — slides in from the right */}
      <SidePanel open={showRegionPanel}>
        <div className="px-5 pt-8 pb-4 shrink-0">
          <PanelHeader
            name="Regions"
            description="Select one or more regions to display them on the map."
          />

          {/* Region action pills */}
          <div className="flex flex-wrap gap-2">
            <button
              title="Generate plots of daily mean spead, types and vessel traffic density heat-map."
              disabled={!drawnPolygon || regionLoading}
              onClick={loadRegionStats}
              className="font-inter text-slate-600 text-xs px-2 py-0.5 border border-slate-400 rounded-full disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Analyse region
            </button>
            <button
              title="See all vessel traffic in selected region"
              disabled={!drawnPolygon || regionLoading}
              onClick={() => drawnPolygon && viewVesselsInRegion(drawnPolygon)}
              className="font-inter text-slate-600 text-xs px-2 py-0.5 border border-slate-400 rounded-full disabled:opacity-30 disabled:cursor-not-allowed"
            >
              See all traffic
            </button>
            {/* show selected region */}
            <div
              title="Click on a region to select it."
              className="font-inter text-slate-400 text-xs bg-slate-100 px-2 py-0.5 rounded-xs"
            >
              {regionName ? `Selected: ${regionName}` : "No region selected."}
            </div>
          </div>
        </div>

        <hr className="border-slate-200 my-4" />

        <div className="px-5 shrink-0">
          {/* Feature: Draw a custom region on the map */}
          <div className="mb-2 flex flex-row justify-between items-center">
            <button
              onClick={drawing ? cancelDrawing : startDrawing}
              className="font-inter text-slate-600 text-xs px-2 py-0.5 border border-slate-400 rounded-full"
            >
              {drawing ? "Cancel" : "Draw region"}
            </button>
            <label className="font-fraunces text-xs text-slate-600">
              {drawing
                ? "Double-click to finish drawing."
                : "Click map to add points"}
              .
            </label>
          </div>

          {/* Feature: Upload a shapefile as a region */}
          <div className=" flex flex-row justify-between items-center">
            <label className="font-inter text-slate-600 text-xs px-2 py-0.5 border border-slate-400 rounded-full cursor-pointer">
              Upload
              <input
                type="file"
                accept=".zip"
                className="hidden"
                onChange={handleFileUpload}
              />
            </label>
            <label className="font-fraunces text-xs text-slate-600">
              Use your own shapefile (.zip)
            </label>
          </div>
        </div>

        <hr className="border-slate-200 my-4" />

        <div className="flex-1 overflow-y-auto min-h-0 px-2 pb-4">
          {/* CHA section */}
          <div className="px-3 pt-3 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
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
                if (hiding && regionName === r.name) {
                  setDrawnPolygon(null);
                  setRegionName(null);
                  setSelectedChaName(null);
                  chaSourceRef.current.changed();
                }
              }}
            />
          ))}

          {/* WEA section */}
          <div className="px-3 pt-3 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
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
                if (hiding && regionName === r.name) {
                  setDrawnPolygon(null);
                  setRegionName(null);
                  setSelectedChaName(null);
                  chaSourceRef.current.changed();
                }
              }}
            />
          ))}

          {/* Uploaded regions */}
          {uploadedRegions.length > 0 && (
            <>
              <div className="px-3 pt-4 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
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
              <div className="px-3 pt-4 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
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
                    if (hiding && regionName === r.name) {
                      setDrawnPolygon(null);
                      setRegionName(null);
                      setSelectedChaName(null);
                      chaSourceRef.current.changed();
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
                      highlightSourceRef.current.clear();
                      setRegionVessels([]);
                      setViewVesselsMode(false);
                      setRegionStats(null);
                    }
                  }}
                />
              ))}
            </>
          )}
        </div>
      </SidePanel>

      {/* Overlay panel — slides in from the right */}
      <SidePanel open={showLayerPanel}>
        {/* DETAIL LAYERS SECTION */}
        {/* MOORINGS */}
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="px-5 pt-8 pb-4 shrink-0">
            <PanelHeader
              name="Moorings"
              description="Input desired time frame to see locations."
              className="mb-4"
            />
            <DateRangePicker
              start={start}
              end={end}
              onStartChange={setStart}
              onEndChange={setEnd}
              className="mb-6"
            />

            {/* upload onw csv  */}
            <p className="text-slate-400 text-xs font-fraunces border border-slate-300 rounded-full py-2 px-4">
              <label className="border-b border-transparent hover:border-slate-800 cursor-pointer text-slate-800 hover:text-slate-800 transition">
                Upload your own
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleMooringUpload}
                />
              </label>{" "}
              using{" "}
              <span
                onClick={downloadMooringTemplate}
                className="border-b border-slate-400 cursor-pointer transition"
              >
                {" "}
                CSV template
              </span>
            </p>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 px-2 pb-4">
            {/* AMAR section */}
            <div className="px-3 pt-3 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              AMAR
            </div>
            {AMAR_MOORINGS.filter(
              (m) => m.deployment <= end && m.recovery >= start
            ).length === 0 && (
              <p className="text-xs text-slate-400 px-3 py-1">
                None active in this period.
              </p>
            )}
            {AMAR_MOORINGS.filter(
              (m) => m.deployment <= end && m.recovery >= start
            ).map((m) => (
              <div
                key={m.name}
                className="px-3 py-2.5 rounded-sm hover:bg-slate-50 cursor-pointer"
                onMouseEnter={() => {
                  highlightedMooringRef.current = m.name;
                  mooringSourceRef.current.changed();
                }}
                onMouseLeave={() => {
                  highlightedMooringRef.current = null;
                  mooringSourceRef.current.changed();
                }}
                onClick={() => {
                  if (mooringPopup?.mooring.name === m.name) {
                    setMooringPopup(null);
                    return;
                  }
                  const pixel = mapObj.current?.getPixelFromCoordinate(
                    fromLonLat([m.lon, m.lat])
                  );
                  if (pixel)
                    setMooringPopup({ x: pixel[0], y: pixel[1], mooring: m });
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#293241] inline-block shrink-0" />
                  <span className="text-sm font-medium text-slate-600">
                    {m.name}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {m.depth}m · {m.deployment} → {m.recovery}
                </div>
              </div>
            ))}

            {/* Uploaded section */}
            {uploadedMoorings.length > 0 && (
              <>
                <div className="px-3 pt-3 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Uploaded
                </div>
                {uploadedMoorings.filter(
                  (m) => m.deployment <= end && m.recovery >= start
                ).length === 0 && (
                  <p className="text-xs text-slate-400 px-3 py-1">
                    None active in this period.
                  </p>
                )}
                {uploadedMoorings
                  .filter((m) => m.deployment <= end && m.recovery >= start)
                  .map((m) => (
                    <div
                      key={m.name}
                      className="px-3 py-2.5 rounded-sm hover:bg-slate-50 cursor-pointer"
                      onMouseEnter={() => {
                        highlightedMooringRef.current = m.name;
                        mooringSourceRef.current.changed();
                      }}
                      onMouseLeave={() => {
                        highlightedMooringRef.current = null;
                        mooringSourceRef.current.changed();
                      }}
                      onClick={() => {
                        if (mooringPopup?.mooring.name === m.name) {
                          setMooringPopup(null);
                          return;
                        }
                        const pixel = mapObj.current?.getPixelFromCoordinate(
                          fromLonLat([m.lon, m.lat])
                        );
                        if (pixel)
                          setMooringPopup({
                            x: pixel[0],
                            y: pixel[1],
                            mooring: m,
                          });
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#293241] inline-block shrink-0" />
                        <span className="text-sm font-medium text-slate-600">
                          {m.name}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {m.depth}m · {m.deployment} → {m.recovery}
                      </div>
                    </div>
                  ))}
              </>
            )}
          </div>
        </div>

        <div className="border-t border-slate-100 my-2" />

        {/* LAYERS */}
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="px-5 pt-8 pb-4 shrink-0">
            <PanelHeader
              name="Layers"
              description="Select detailed map layers to overlay."
              className=""
            />
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 px-2 pb-4">
            <div className="px-3 pt-1 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Ocean
            </div>
            <label className="flex items-center gap-3 px-3 py-2.5 rounded-sm hover:bg-slate-50 cursor-pointer">
              <input
                type="checkbox"
                checked={showBathymetry}
                onChange={() => setShowBathymetry((p) => !p)}
                className="accent-[#3d5a80] w-4 h-4 rounded"
              />
              <div>
                <div className="text-sm font-medium text-slate-600">
                  Bathymetry
                </div>
                <div className="text-[11px] text-slate-400">
                  NRCan / DFO — Scotian Shelf &amp; NL Shelves
                </div>
              </div>
            </label>
            <label className="flex items-center gap-3 px-3 py-2.5 rounded-sm hover:bg-slate-50 cursor-pointer">
              <input
                type="checkbox"
                checked={showNoise}
                onChange={() => setShowNoise((p) => !p)}
                className="accent-[#3d5a80] w-4 h-4 rounded"
              />
              <div>
                <div className="text-sm font-medium text-slate-600">
                  Vessel noise (2020-02-01)
                </div>
                <div className="text-[11px] text-slate-400">
                  Modelled underwater noise, 10m depth, 50Hz — daily mean
                </div>
              </div>
            </label>
          </div>
        </div>
      </SidePanel>

      {/* Customize panel */}
      <SidePanel open={showCustomizePanel}>
        <div className="px-5 pt-8 pb-4 shrink-0">
          <PanelHeader
            name="Customize"
            description="Adjust the appearance of map elements."
          />
          <div className="mt-6 flex flex-col gap-4">
            <SizingSlider
              label="Mooring dots"
              value={mooringSize}
              onChange={setMooringSize}
              accent="accent-[#3d5a80]/80"
              preview={
                <img
                  src={makeMooringCanvas(false, mooringSize).toDataURL()}
                  width={mooringSize * 2}
                  height={mooringSize * 2}
                />
              }
            />
            <SizingSlider
              label="Vessel tracks"
              value={vesselSize}
              onChange={setVesselSize}
              preview={
                <>
                  {(["#0a8754", "#ffc857", "#ee6c4d"] as const).map((color) => (
                    <img
                      key={color}
                      src={makeVesselCanvas(color, vesselSize).toDataURL()}
                      width={vesselSize * 2}
                      height={vesselSize * 2}
                    />
                  ))}
                </>
              }
            />
            <SizingSlider
              label="Region vessels"
              value={regionDotSize}
              onChange={setRegionDotSize}
              preview={
                <div
                  style={{
                    width: regionDotSize * 2,
                    height: regionDotSize * 2,
                    borderRadius: "50%",
                    backgroundColor: "#5a5a5a",
                    opacity: 0.6,
                    flexShrink: 0,
                  }}
                />
              }
            />
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
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition ${
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
                        <span className="text-sm font-semibold text-slate-600 font-fraunces">
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
                        <span className="text-sm font-semibold text-slate-600 font-fraunces">
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
                        <span className="text-sm font-semibold text-slate-600 font-fraunces">
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

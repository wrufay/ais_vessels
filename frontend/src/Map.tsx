import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
import WebGLVectorLayer from "ol/layer/WebGLVector";
import VectorSource from "ol/source/Vector";
import { Style, Stroke, Fill, Icon, Circle as CircleStyle } from "ol/style";
import Draw from "ol/interaction/Draw";
import GeoJSON from "ol/format/GeoJSON";
import shp from "shpjs";
import "ol/ol.css";
import "./map.css";
import { type PresetRegion, CHA_REGIONS, WEA_REGIONS } from "./data/regions";
import { type Mooring, AMAR_MOORINGS } from "./data/moorings";
import {
  classifyType,
  formatTime,
  REGION_WEBGL_STYLE,
  REGION_WEBGL_VARIABLES,
  ROUTE_WEBGL_STYLE,
  ROUTE_WEBGL_VARIABLES,
  TYPE_NUM,
  makeMooringCanvas,
  chaStyle,
  downloadPlot,
  setSelectedChaName,
  getSelectedChaName,
  setClickedChaNames,
} from "./utils/mapStyles";
import SidePanel, { PANEL_DEFAULT_WIDTH } from "./components/SidePanel";
import IconBar from "./components/IconBar";
import CursorCoordinates from "./components/CursorCoordinates";
import ClosePanelBtn from "./components/ClosePanelBtn";
import MapPopup from "./components/MapPopup";
import PopupRow from "./components/PopupRow";
import UploadModal from "./components/UploadModal";
import ResultsModal from "./components/ResultsModal";
import VesselTypeFilterModal from "./components/VesselTypeFilterModal";
import MooringPanel from "./components/MooringPanel";
import RegionsPanel from "./components/RegionsPanel";
import LayersPanel from "./components/LayersPanel";
import TracksPanel from "./components/TracksPanel";
import ImpactsPanel from "./components/noise-impact/ImpactsPanel";
import NoiseImpactParamsPanel from "./components/noise-impact/NoiseImpactParamsPanel";
import { useNoiseImpact, zoneKey } from "./useNoiseImpact";
import { IMPACT_COLORS, IMPACT_DASH, IMPACT_ZINDEX } from "./utils/noiseImpactStyles";
import { useTheme } from "./useTheme";
import { useDragResize } from "./useDragResize";
import { useStateRef } from "./useStateRef";
import { useNoiseLayer, NOISE_EXTENT } from "./useNoiseLayer";
import { useBathymetry } from "./useBathymetry";
import { useMeasureTool } from "./useMeasureTool";
import { useBasemap, BASEMAPS } from "./useBasemap";
import { useTour } from "./useTour";
import Tour from "./tour/Tour";

const API = import.meta.env.VITE_API_URL ?? "";


export interface Vessel {
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

export interface RegionStats {
  total_positions: number;
  unique_vessels: number;
  vessel_mmsis: number[];
  positions: RegionPosition[];
  days: { date: string; vessel_counts: Record<string, number> }[];
  plots: {
    vessel_types?: string;
    speed_overall?: string;
    vessel_density?: string;
    vessel_density_error?: string;
  };
}

export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
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
  const routeLayerRef = useRef<WebGLVectorLayer<VectorSource> | null>(null);
  const mooringLayerRef = useRef<VectorLayer | null>(null);
  const chaLayerRef = useRef<VectorLayer | null>(null);
  const regionTrackSourceRef = useRef(new VectorSource());
  const regionTrackLayerRef = useRef<WebGLVectorLayer<VectorSource> | null>(null);
  const noiseImpactSourceRef = useRef(new VectorSource());
  const noiseImpactLayerRef = useRef<VectorLayer | null>(null);
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
  const [search, setSearch] = useState("");
  const [start, setStart] = useState("2025-08-01");
  const [end, setEnd] = useState("2025-08-31");
  // Picking a start date that's on or after the current end date would
  // leave an invalid/empty range -- bump end to the day after instead of
  // just letting that happen. Left alone (not reset) if the existing end
  // is still after the new start, so shrinking the range from the front
  // doesn't blow away an intentionally longer one. UTC date math (not
  // setDate/getDate) since these are plain YYYY-MM-DD strings and this
  // app runs in a negative-UTC-offset timezone -- local-time day math on
  // a UTC-midnight Date would silently roll the day back by one.
  function handleStartChange(newStart: string) {
    setStart(newStart);
    setEnd((prevEnd) => {
      if (prevEnd > newStart) return prevEnd;
      const d = new Date(newStart);
      d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().slice(0, 10);
    });
  }
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
  const [regionName, setRegionName, regionNameRef] = useStateRef<string | null>(null);
  const [drawnPolygon, setDrawnPolygon] = useState<object | null>(null);
  const [drawing, setDrawing] = useState(false);
  const {
    measureSourceRef,
    measuring, setMeasuring, measuringRef,
    handleMeasureClick,
    handleMeasurePointerMove,
  } = useMeasureTool();
  const {
    bathyLayerRef,
    showBathymetry, setShowBathymetry,
    bathyOpacity, setBathyOpacity,
    bathyLoading, setBathyLoading,
  } = useBathymetry();
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
  const {
    showImpactsPanel, setShowImpactsPanel,
    showParamsPanel, setShowParamsPanel,
    sites: noiseImpactSites, options: noiseImpactOptions,
    site: noiseImpactSite, setSite: setNoiseImpactSite,
    hearingGroups: noiseImpactHearingGroups, toggleHearingGroup: toggleNoiseImpactHearingGroup,
    impactTypes: noiseImpactImpactTypes, toggleImpactType: toggleNoiseImpactImpactType,
    metrics: noiseImpactMetrics, toggleMetric: toggleNoiseImpactMetric,
    depthMin: noiseImpactDepthMin, setDepthMin: setNoiseImpactDepthMin,
    depthMax: noiseImpactDepthMax, setDepthMax: setNoiseImpactDepthMax,
    splPeak: noiseImpactSplPeak, setSplPeak: setNoiseImpactSplPeak,
    selSingleStrike: noiseImpactSelSingleStrike, setSelSingleStrike: setNoiseImpactSelSingleStrike,
    nStrikesPerPile: noiseImpactNStrikesPerPile, setNStrikesPerPile: setNoiseImpactNStrikesPerPile,
    nPiles: noiseImpactNPiles,
    assessmentPeriodHours: noiseImpactAssessmentPeriodHours,
    running: noiseImpactRunning, error: noiseImpactError, result: noiseImpactResult,
    visibleZoneKeys: noiseImpactVisibleZoneKeys, toggleZoneVisibility: toggleNoiseImpactZoneVisibility,
    undefinedCombos: noiseImpactUndefinedCombos,
    handleRun: handleRunNoiseImpact,
    resetParams: resetNoiseImpactParams,
  } = useNoiseImpact(API);
  const [lastOpenedPanel, setLastOpenedPanel] = useState<
    "vessel" | "region" | "layer" | "mooring" | "impacts"
  >("vessel");
  const [clickedRegionNames, setClickedRegionNames] = useState<Set<string>>(
    new Set()
  );
  // Mirrors clickedRegionNames into mapStyles.ts's module-level state and
  // triggers a redraw -- kept as one reactive effect (rather than calling
  // setClickedChaNames()/chaSourceRef.current.changed() at each call site
  // that updates clickedRegionNames) so those side effects can't end up
  // running inside a setState updater, which React may invoke more than once.
  useEffect(() => {
    setClickedChaNames(clickedRegionNames);
    chaSourceRef.current.changed();
  }, [clickedRegionNames]);
  const [uploadedRegions, setUploadedRegions] = useState<PresetRegion[]>([]);
  const [uploadedMoorings, setUploadedMoorings] = useState<Mooring[]>([]);
  const {
    noiseLayerRef,
    showNoise, setShowNoise,
    noiseOpacity, setNoiseOpacity,
    noiseLoading, setNoiseLoading,
    noiseVariable, setNoiseVariable,
    noiseDate, setNoiseDate,
    noiseFreq, setNoiseFreq,
    noiseDepth, setNoiseDepth,
    noiseRange,
    noiseVminOverride, setNoiseVminOverride,
    noiseVmaxOverride, setNoiseVmaxOverride,
    noiseAvailable,
    noiseDates,
  } = useNoiseLayer(API);
  const {
    basemapLayerRef,
    basemap, setBasemap,
    basemapOpen, setBasemapOpen,
  } = useBasemap();
  const { isDark, toggleTheme } = useTheme();
  useEffect(() => {
    setBasemap(isDark ? "esri-imagery" : "esri-ocean");
  }, [isDark]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [ccgLastPositionAt, setCcgLastPositionAt] = useState<string | null>(null);
  const [viewVesselsMode, setViewVesselsMode] = useState(false);
  const [regionDisplayMode, setRegionDisplayMode] = useStateRef<
    "grey" | "type" | "speed" | "vessel"
  >("grey", (mode) => {
    const modeNum = mode === "type" ? 1 : mode === "speed" ? 2 : mode === "vessel" ? 3 : 0;
    regionTrackLayerRef.current?.updateStyleVariables({ mode: modeNum });
  });
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
  const [mooringSize, setMooringSize, mooringSizeRef] = useStateRef(10, () => mooringSourceRef.current.changed());
  const [vesselSize, setVesselSize] = useStateRef(5, (v) => routeLayerRef.current?.updateStyleVariables({ dotSize: v }));
  const [regionDotSize, setRegionDotSize] = useState(4);
  const [mooringOpacity, setMooringOpacity, mooringOpacityRef] = useStateRef(1, () => mooringSourceRef.current.changed());
  const [vesselOpacity, setVesselOpacity] = useStateRef(1, (v) => routeLayerRef.current?.updateStyleVariables({ dotOpacity: v }));
  const [regionDotOpacity, setRegionDotOpacity] = useState(0.6);
  const [mooringOpen, setMooringOpen] = useState(false);
  const [vesselOpen, setVesselOpen] = useState(false);
  const [regionDotOpen, setRegionDotOpen] = useState(false);
  const [vesselListOpen, setVesselListOpen] = useState(true);
  const [vesselListHeight, setVesselListHeight] = useState(140);
  const onVesselListResizeMouseDown = useDragResize({
    axis: "y",
    min: 40,
    max: Infinity,
    getStart: () => vesselListHeight,
    onChange: setVesselListHeight,
  });

  const [regionListHeight, setRegionListHeight] = useState<number | null>(null);
  const regionListElRef = useRef<HTMLDivElement>(null);
  const onRegionListResizeMouseDown = useDragResize({
    axis: "y",
    min: 40,
    max: Infinity,
    getStart: () => regionListHeight ?? regionListElRef.current?.offsetHeight ?? 320,
    onChange: setRegionListHeight,
  });

  const [mooringListHeight, setMooringListHeight] = useState<number | null>(null);
  const mooringListElRef = useRef<HTMLDivElement>(null);
  const onMooringListResizeMouseDown = useDragResize({
    axis: "y",
    min: 40,
    max: Infinity,
    getStart: () => mooringListHeight ?? mooringListElRef.current?.offsetHeight ?? 384,
    onChange: setMooringListHeight,
  });
  const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT_WIDTH);
  // Own width, separate from panelWidth's shared right-side group, since
  // the params panel is on the left and can be open at the same time as
  // one of those (e.g. Impacts).
  const [paramsPanelWidth, setParamsPanelWidth] = useState(PANEL_DEFAULT_WIDTH);
  // Measured (not hardcoded) so the params panel starts past IconBar's own
  // width instead of covering it -- IconBar sizes itself to its content
  // (buttons/legend text), so there's no fixed width to offset by.
  const iconBarRef = useRef<HTMLDivElement | null>(null);
  const [iconBarWidth, setIconBarWidth] = useState(0);
  useEffect(() => {
    const el = iconBarRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setIconBarWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { tourActive, setTourActive, registerTarget, getTourTarget, tourSteps } = useTour({
    mooringListElRef,
    regionListElRef,
    openVesselPanel: () => {
      setShowRegionPanel(false);
      setShowMooringPanel(false);
      setShowLayerPanel(false);
      setShowVesselPanel(true);
      setVesselListOpen(true);
    },
    openMooringPanel: () => {
      setShowVesselPanel(false);
      setShowRegionPanel(false);
      setShowLayerPanel(false);
      setShowMooringPanel(true);
    },
    openRegionPanel: () => {
      setShowVesselPanel(false);
      setShowMooringPanel(false);
      setShowLayerPanel(false);
      setShowRegionPanel(true);
    },
    openMapPanel: () => {
      setShowVesselPanel(false);
      setShowRegionPanel(false);
      setShowMooringPanel(false);
      setShowLayerPanel(true);
    },
  });
  useEffect(() => {
    if (showVesselPanel) setLastOpenedPanel("vessel");
    else if (showRegionPanel) setLastOpenedPanel("region");
    else if (showLayerPanel) setLastOpenedPanel("layer");
    else if (showMooringPanel) setLastOpenedPanel("mooring");
    else if (showImpactsPanel) setLastOpenedPanel("impacts");
  }, [showVesselPanel, showRegionPanel, showLayerPanel, showMooringPanel, showImpactsPanel]);
  const anyPanelOpen =
    showVesselPanel || showRegionPanel || showLayerPanel || showMooringPanel || showImpactsPanel;
  function closeActivePanel() {
    setShowVesselPanel(false);
    setShowRegionPanel(false);
    setShowLayerPanel(false);
    setShowMooringPanel(false);
    setShowImpactsPanel(false);
  }
  function openLastPanel() {
    if (lastOpenedPanel === "vessel") setShowVesselPanel(true);
    else if (lastOpenedPanel === "region") setShowRegionPanel(true);
    else if (lastOpenedPanel === "layer") setShowLayerPanel(true);
    else if (lastOpenedPanel === "mooring") setShowMooringPanel(true);
    else if (lastOpenedPanel === "impacts") setShowImpactsPanel(true);
  }
  useEffect(() => {
    regionTrackLayerRef.current?.updateStyleVariables({ dotSize: regionDotSize });
  }, [regionDotSize]);
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

  // Rebuild noise-impact zone polygons whenever a run completes or the
  // panel's per-zone visibility toggles change, then pan/zoom to whatever
  // ends up visible -- both precomputed sites (French Bank, Sydney Bight)
  // sit outside the app's usual default view, so without this the zones
  // render correctly but off-screen. Deliberately ONE effect (not split
  // into "rebuild features" + "fit view" effects with different
  // dependency arrays) -- setResult/setVisibleZoneKeys in handleRun are
  // two separate state updates, and splitting this let the fit-view half
  // read the source's extent before the rebuild half had actually
  // populated it, so it fell back to "zoom to the source point" and never
  // got a re-trigger once the real zones landed a render later.
  useEffect(() => {
    const fmt = new GeoJSON();
    noiseImpactSourceRef.current.clear();
    if (!noiseImpactResult) return;
    noiseImpactResult.zones.forEach((z) => {
      const key = zoneKey(z);
      if (!z.geometry || !noiseImpactVisibleZoneKeys.has(key)) return;
      const geom = fmt.readGeometry(z.geometry, {
        dataProjection: "EPSG:4326",
        featureProjection: "EPSG:3857",
      }) as OLPolygon;
      const f = new Feature({
        geometry: geom,
        hearingGroup: z.hearing_group,
        impact: z.impact,
        metric: z.metric,
        thresholdDb: z.threshold_db,
        areaKm2: z.area_km2,
      });
      noiseImpactSourceRef.current.addFeature(f);
    });

    if (!mapObj.current) return;
    const view = mapObj.current.getView();
    const extent = noiseImpactSourceRef.current.getExtent();
    const hasVisibleZones =
      noiseImpactSourceRef.current.getFeatures().length > 0 && !!extent && extent.every(Number.isFinite);
    // Nothing to show (every visible threshold came back not-exceeded, or
    // everything's toggled off) -- leave the view exactly where the user
    // already has it instead of jumping to the source point for an empty
    // result.
    if (hasVisibleZones && extent) {
      view.fit(extent, { padding: [80, 80, 80, 80], maxZoom: 11, duration: 500 });
    }
  }, [noiseImpactResult, noiseImpactVisibleZoneKeys]);

  // "Impact mode": while the Impacts panel is open, show its zone layer's
  // polygons (they stay populated in the source underneath, see above --
  // this just toggles the layer, so nothing needs recomputing on reopen).
  // Map pan/zoom is deliberately left alone (it was locked here before,
  // which got in the way of just looking around while reviewing a
  // result) -- but the basemap still switches to a plain minimal-canvas
  // style, since zoomed-in street/satellite tiles compete for attention
  // with the zone polygons and read as visual noise. Picks the light or
  // dark variant to match the app's current theme (also re-picks if the
  // user toggles theme while the panel is already open, via isDark in
  // the dependency array). Restores whatever basemap was active before
  // on close, rather than leaving the user stuck on it.
  useEffect(() => {
    noiseImpactLayerRef.current?.setVisible(showImpactsPanel);
  }, [showImpactsPanel]);

  // Hide vessel/mooring position layers while in impact mode -- they're
  // not cleared (still there, still filtered/selected the same way
  // underneath), just visually out of the way so they don't clutter a
  // view that's already busy with the bathymetry layer and zone
  // polygons. Nothing here has been through a full regression pass yet
  // (e.g. selecting a new vessel route, or toggling "all traffic" for a
  // region, while impact mode is still active) -- if either of those
  // turns out to fight with this, that's the first place to look.
  useEffect(() => {
    routeLayerRef.current?.setVisible(!showImpactsPanel);
    mooringLayerRef.current?.setVisible(!showImpactsPanel);
    regionTrackLayerRef.current?.setVisible(!showImpactsPanel);
  }, [showImpactsPanel]);

  const preImpactsBasemapRef = useRef<string | null>(null);
  useEffect(() => {
    if (showImpactsPanel) {
      if (preImpactsBasemapRef.current === null) preImpactsBasemapRef.current = basemap;
      setBasemap(isDark ? "esri-dark-gray" : "esri-light-gray");
    } else if (preImpactsBasemapRef.current !== null) {
      setBasemap(preImpactsBasemapRef.current);
      preImpactsBasemapRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showImpactsPanel, isDark]);

  // Give the selected noise-impact site visual context on the map once Run
  // actually produces a result (not just from opening the params modal --
  // picking a site there shouldn't touch the map before the user commits to
  // it): highlight its matching WEA polygon (site names in useNoiseImpact
  // match WEA_REGIONS names exactly -- see analysis/noise_impact.py's SITES
  // dict) and turn on bathymetry, since seabed depth is directly relevant
  // to interpreting a pile-driving transmission-loss result. Same
  // remember/restore pattern as preImpactsBasemapRef above, so it doesn't
  // just leave bathymetry stuck on or clobber a highlight the user set some
  // other way.
  const preImpactsBathyRef = useRef<boolean | null>(null);
  useEffect(() => {
    const active = showImpactsPanel && !!noiseImpactResult;
    const weaRegion = WEA_REGIONS.find((r) => r.name === noiseImpactSite);
    if (active && weaRegion) {
      if (preImpactsBathyRef.current === null) preImpactsBathyRef.current = showBathymetry;
      setShowBathymetry(true);
      setSelectedChaName(weaRegion.name);
      chaSourceRef.current.changed();
      // Only actually move the view if the run produced something to look
      // at -- every threshold coming back not-exceeded (or undefined) is
      // a normal result, not a reason to yank the map somewhere with
      // nothing on it.
      const hasZones = noiseImpactResult.zones.some((z) => z.geometry);
      if (mapObj.current && hasZones) {
        const fmt = new GeoJSON();
        const geom = fmt.readGeometry(weaRegion.geojson, {
          dataProjection: "EPSG:4326",
          featureProjection: "EPSG:3857",
        }) as OLPolygon;
        mapObj.current.getView().fit(geom.getExtent(), { padding: [80, 80, 80, 80], maxZoom: 11, duration: 500 });
      }
    } else if (!active && preImpactsBathyRef.current !== null) {
      setShowBathymetry(preImpactsBathyRef.current);
      setSelectedChaName(null);
      chaSourceRef.current.changed();
      preImpactsBathyRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showImpactsPanel, noiseImpactResult, noiseImpactSite]);

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
    mooringLayerRef.current = mooringLayer;

    const routeLayer = new WebGLVectorLayer({
      source: sourceRef.current,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      style: ROUTE_WEBGL_STYLE as any,
      variables: ROUTE_WEBGL_VARIABLES,
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
      // Visible (not visible: false) from the start so OL starts fetching
      // WMS tiles for the current view as soon as the map loads, instead of
      // only starting once the user first toggles bathymetry on -- opacity
      // 0 keeps it invisible until then; useBathymetry drives the real
      // on/off + opacity via setOpacity rather than setVisible now.
      opacity: 0,
      visible: true,
    });
    bathyLayerRef.current = bathyLayer;
    let bathyPending = 0;
    bathyLayer.getSource()!.on("tileloadstart", () => { bathyPending++; setBathyLoading(true); });
    bathyLayer.getSource()!.on(["tileloadend", "tileloaderror"], () => { if (--bathyPending <= 0) { bathyPending = 0; setBathyLoading(false); } });

    // ocean noise modelling — static raster overlay, one day's mean dB grid
    const noiseLayer = new ImageLayer({
      source: new ImageStatic({
        url: `${API}/api/noise/overlay?date=2020-02-01`,
        imageExtent: NOISE_EXTENT,
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
          const initialBasemap = BASEMAPS.find((b) => b.id === basemap) ?? BASEMAPS[0];
          const layer = new TileLayer({
            source: new XYZ({
              url: initialBasemap.url,
              attributions: initialBasemap.attributions,
              maxZoom: initialBasemap.maxZoom,
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
        (() => {
          const layer = new VectorLayer({
            source: noiseImpactSourceRef.current,
            style: (feature) => {
              const impact = feature.get("impact") as string;
              const color = IMPACT_COLORS[impact] ?? "#888";
              return new Style({
                stroke: new Stroke({ color, width: 2, lineDash: IMPACT_DASH[impact] }),
                // 0x38 (~22%), not the old 0x22 (~13%) -- the lighter
                // fill nearly disappeared against the bathymetry WMS
                // layer's own busy coloring underneath it.
                fill: new Fill({ color: `${color}38` }),
                zIndex: IMPACT_ZINDEX[impact] ?? 0,
              });
            },
          });
          noiseImpactLayerRef.current = layer;
          return layer;
        })(),
      ],
      view: new View({
        center: fromLonLat([-63.5, 44.5]),
        zoom: 6,
      }),
    });

    map.on("click", (e) => {
      if (measuringRef.current) {
        handleMeasureClick(e.coordinate);
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
        handleMeasurePointerMove(e.coordinate);
        map.getTargetElement().style.cursor = "crosshair";
        return;
      }

      let overClickable = false;
      map.forEachFeatureAtPixel(e.pixel, (feature) => {
        if (feature.get("mooring")) {
          overClickable = true;
          return true;
        }
        if (feature.get("chaRegion")) {
          overClickable = true;
          return true;
        }
      });

      map.getTargetElement().style.cursor = overClickable
        ? "pointer"
        : "crosshair";
    });

    mapObj.current = map;
    return () => map.setTarget(undefined);
  }, []);

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

  // Live CCG terrestrial AIS feed freshness — polled periodically so the
  // "updated X ago" display stays roughly current without a page reload.
  useEffect(() => {
    function fetchCcgStatus() {
      fetch(`${API}/api/ccg/status`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setCcgLastPositionAt(d?.last_position_at ?? null))
        .catch(() => {});
    }
    fetchCcgStatus();
    const id = setInterval(fetchCcgStatus, 60_000);
    return () => clearInterval(id);
  }, []);

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

  function deactivateRegionIfActive(name: string) {
    if (getSelectedChaName() === name) {
      setSelectedChaName(null);
      chaSourceRef.current.changed();
    }
    if (regionName === name) {
      setDrawnPolygon(null);
      setRegionName(null);
      regionTrackSourceRef.current.clear();
      setViewVesselsMode(false);
    }
  }

  function handleRegionCheckboxClick(r: { name: string; geojson: object }) {
    const hiding = clickedRegionNames.has(r.name);
    toggleClickedRegion(r.name);
    if (hiding) {
      deactivateRegionIfActive(r.name);
    }
  }

  function toggleClickedRegion(name: string) {
    const next = new Set(clickedRegionNames);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setClickedRegionNames(next);
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

          sourceRef.current.addFeatures(pts.map((p, i) => new Feature({
            geometry: new Point(fromLonLat([p.longitude, p.latitude])),
            sog: p.sog,
            cog: p.cog,
            time: p.time,
            lat: p.latitude,
            lon: p.longitude,
            source: p.source,
            isStart: i === 0,
            isEnd: i === pts.length - 1,
            pointType: i === 0 ? 1 : i === pts.length - 1 ? 2 : 0,
          })));

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
        setViewVesselsMode(true);
      })
      .catch(console.error)
      .finally(() => setRegionLoading(false));
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return vessels.filter((v) => {
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
  }, [vessels, search, filters]);

  return (
    <div
      className="relative w-full h-screen overflow-hidden"
      // Read by map.css to push OL's built-in zoom control out from under
      // IconBar (a permanent full-height sidebar) and the params panel
      // when it's open -- same offset CursorCoordinates uses below.
      style={{ "--map-controls-offset": `${iconBarWidth + (showParamsPanel ? paramsPanelWidth : 0)}px` } as CSSProperties}
    >
      {/* Map — full screen */}
      <div ref={mapRef} className="absolute inset-0" />

      <CursorCoordinates
        lat={cursorCoord?.lat ?? null}
        lon={cursorCoord?.lon ?? null}
        leftOffset={iconBarWidth + (showParamsPanel ? paramsPanelWidth : 0)}
      />

      {/* Upload modal */}
      {showUploadModal && (
        <UploadModal
          onClose={() => setShowUploadModal(false)}
          onShapefileUpload={handleShapefileUpload}
          onMooringUpload={handleMooringUpload}
          onDownloadMooringTemplate={downloadMooringTemplate}
        />
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

      <IconBar
        showVesselPanel={showVesselPanel}
        showRegionPanel={showRegionPanel}
        showLayerPanel={showLayerPanel}
        showMooringPanel={showMooringPanel}
        showImpactsPanel={showImpactsPanel}
        setShowVesselPanel={setShowVesselPanel}
        setShowRegionPanel={setShowRegionPanel}
        setShowMooringPanel={setShowMooringPanel}
        setShowLayerPanel={setShowLayerPanel}
        setShowImpactsPanel={setShowImpactsPanel}
        measuring={measuring}
        setMeasuring={setMeasuring}
        drawnPolygon={drawnPolygon}
        regionLoading={regionLoading}
        viewVesselsMode={viewVesselsMode}
        onAnalyse={loadRegionStats}
        onAllTraffic={() => drawnPolygon && viewVesselsInRegion(drawnPolygon)}
        onClearTraffic={() => {
          regionTrackSourceRef.current.clear();
          setViewVesselsMode(false);
        }}
        onStartTour={() => setTourActive(true)}
        registerTarget={registerTarget}
        isDark={isDark}
        toggleTheme={toggleTheme}
        innerRef={(el) => {
          iconBarRef.current = el;
        }}
      />

      <Tour
        active={tourActive}
        steps={tourSteps}
        getTarget={getTourTarget}
        onClose={() => setTourActive(false)}
      />

      {/* Persistent panel toggle button */}
      <div className={`absolute top-3 right-3 z-30 transition-transform duration-300 ease-in-out ${anyPanelOpen ? "" : "rotate-180"}`}>
        <ClosePanelBtn
          onClick={anyPanelOpen ? closeActivePanel : openLastPanel}
          displayType="chevron"
        />
      </div>

      {/* Vessel panel — slides in from the right */}
      <SidePanel open={showVesselPanel} width={panelWidth} onWidthChange={setPanelWidth} innerRef={registerTarget("vesselPanel")}>
        <TracksPanel
          registerTarget={registerTarget}
          ccgLastPositionAt={ccgLastPositionAt}
          start={start}
          end={end}
          setStart={handleStartChange}
          setEnd={setEnd}
          search={search}
          setSearch={setSearch}
          vesselListOpen={vesselListOpen}
          setVesselListOpen={setVesselListOpen}
          filtered={filtered}
          vessels={vessels}
          filters={filters}
          setDraftFilters={setDraftFilters}
          setShowTypeFilter={setShowTypeFilter}
          vesselListHeight={vesselListHeight}
          selected={selected}
          setSelected={setSelected}
          sourceRef={sourceRef}
          setPointCount={setPointCount}
          pointCount={pointCount}
          pointTotal={pointTotal}
          loadRoute={loadRoute}
          onVesselListResizeMouseDown={onVesselListResizeMouseDown}
          vesselOpen={vesselOpen}
          setVesselOpen={setVesselOpen}
          vesselSize={vesselSize}
          setVesselSize={setVesselSize}
          vesselOpacity={vesselOpacity}
          setVesselOpacity={setVesselOpacity}
        />
      </SidePanel>

      {/* Regions panel — slides in from the right */}
      <SidePanel open={showRegionPanel} width={panelWidth} onWidthChange={setPanelWidth} innerRef={registerTarget("regionPanel")}>
        <RegionsPanel
          registerTarget={registerTarget}
          drawing={drawing}
          startDrawing={startDrawing}
          cancelDrawing={cancelDrawing}
          onShapefileUpload={handleShapefileUpload}
          viewVesselsMode={viewVesselsMode}
          regionDisplayMode={regionDisplayMode}
          setRegionDisplayMode={setRegionDisplayMode}
          regionListElRef={regionListElRef}
          regionListHeight={regionListHeight}
          clickedRegionNames={clickedRegionNames}
          regionName={regionName}
          onRegionCheckboxClick={handleRegionCheckboxClick}
          uploadedRegions={uploadedRegions}
          userSelectedRegions={userSelectedRegions}
          setUserSelectedRegions={setUserSelectedRegions}
          setDrawnPolygon={setDrawnPolygon}
          setRegionName={setRegionName}
          drawSourceRef={drawSourceRef}
          regionTrackSourceRef={regionTrackSourceRef}
          setViewVesselsMode={setViewVesselsMode}
          setRegionStats={setRegionStats}
          onRegionListResizeMouseDown={onRegionListResizeMouseDown}
          regionDotOpen={regionDotOpen}
          setRegionDotOpen={setRegionDotOpen}
          regionDotSize={regionDotSize}
          setRegionDotSize={setRegionDotSize}
          regionDotOpacity={regionDotOpacity}
          setRegionDotOpacity={setRegionDotOpacity}
        />
      </SidePanel>

      {/* Overlay panel — slides in from the right */}
      {/* Mooring panel */}
      <SidePanel open={showMooringPanel} width={panelWidth} onWidthChange={setPanelWidth} innerRef={registerTarget("mooringPanel")}>
        <MooringPanel
          registerTarget={registerTarget}
          start={start}
          end={end}
          setStart={handleStartChange}
          setEnd={setEnd}
          onMooringUpload={handleMooringUpload}
          onDownloadMooringTemplate={downloadMooringTemplate}
          mooringListElRef={mooringListElRef}
          mooringListHeight={mooringListHeight}
          onMooringListResizeMouseDown={onMooringListResizeMouseDown}
          uploadedMoorings={uploadedMoorings}
          highlightedMooringRef={highlightedMooringRef}
          mooringSourceRef={mooringSourceRef}
          mooringPopup={mooringPopup}
          setMooringPopup={setMooringPopup}
          mapObj={mapObj}
          mooringOpen={mooringOpen}
          setMooringOpen={setMooringOpen}
          mooringSize={mooringSize}
          setMooringSize={setMooringSize}
          mooringOpacity={mooringOpacity}
          setMooringOpacity={setMooringOpacity}
        />
      </SidePanel>

      <SidePanel open={showLayerPanel} width={panelWidth} onWidthChange={setPanelWidth} innerRef={registerTarget("mapPanel")}>
        <LayersPanel
          registerTarget={registerTarget}
          bathymetry={{ bathyLayerRef, showBathymetry, setShowBathymetry, bathyOpacity, setBathyOpacity, bathyLoading, setBathyLoading }}
          noise={{
            noiseLayerRef,
            showNoise, setShowNoise,
            noiseOpacity, setNoiseOpacity,
            noiseLoading, setNoiseLoading,
            noiseVariable, setNoiseVariable,
            noiseDate, setNoiseDate,
            noiseFreq, setNoiseFreq,
            noiseDepth, setNoiseDepth,
            noiseRange,
            noiseVminOverride, setNoiseVminOverride,
            noiseVmaxOverride, setNoiseVmaxOverride,
            noiseAvailable,
            noiseDates,
          }}
          basemapState={{ basemapLayerRef, basemap, setBasemap, basemapOpen, setBasemapOpen }}
        />
      </SidePanel>

      <SidePanel open={showImpactsPanel} width={panelWidth} onWidthChange={setPanelWidth} innerRef={registerTarget("impactsPanel")}>
        <ImpactsPanel
          paramsOpen={showParamsPanel}
          onToggleParams={() => setShowParamsPanel((p) => !p)}
          result={noiseImpactResult}
          visibleZoneKeys={noiseImpactVisibleZoneKeys}
          onToggleZone={toggleNoiseImpactZoneVisibility}
          siteName={noiseImpactSite}
          siteMeta={noiseImpactSites[noiseImpactSite]}
          undefinedCombos={noiseImpactUndefinedCombos}
        />
      </SidePanel>

      {/* Vessel type filter modal */}
      {showTypeFilter && (
        <VesselTypeFilterModal
          draftFilters={draftFilters}
          setDraftFilters={setDraftFilters}
          onApply={() => {
            setFilters(draftFilters);
            setShowTypeFilter(false);
          }}
          onClose={() => setShowTypeFilter(false)}
        />
      )}

      {/* Noise impact parameters — left side panel, can stay open alongside Impacts */}
      <SidePanel
        side="left"
        offset={iconBarWidth}
        open={showParamsPanel}
        width={paramsPanelWidth}
        onWidthChange={setParamsPanelWidth}
        innerRef={registerTarget("paramsPanel")}
      >
        <NoiseImpactParamsPanel
          sites={noiseImpactSites}
          options={noiseImpactOptions}
          site={noiseImpactSite}
          setSite={setNoiseImpactSite}
          hearingGroups={noiseImpactHearingGroups}
          onToggleHearingGroup={toggleNoiseImpactHearingGroup}
          impactTypes={noiseImpactImpactTypes}
          onToggleImpactType={toggleNoiseImpactImpactType}
          metrics={noiseImpactMetrics}
          onToggleMetric={toggleNoiseImpactMetric}
          depthMin={noiseImpactDepthMin}
          setDepthMin={setNoiseImpactDepthMin}
          depthMax={noiseImpactDepthMax}
          setDepthMax={setNoiseImpactDepthMax}
          splPeak={noiseImpactSplPeak}
          setSplPeak={setNoiseImpactSplPeak}
          selSingleStrike={noiseImpactSelSingleStrike}
          setSelSingleStrike={setNoiseImpactSelSingleStrike}
          nStrikesPerPile={noiseImpactNStrikesPerPile}
          setNStrikesPerPile={setNoiseImpactNStrikesPerPile}
          nPiles={noiseImpactNPiles}
          assessmentPeriodHours={noiseImpactAssessmentPeriodHours}
          running={noiseImpactRunning}
          error={noiseImpactError}
          onRun={handleRunNoiseImpact}
          onReset={resetNoiseImpactParams}
          onClose={() => setShowParamsPanel(false)}
        />
      </SidePanel>

      {/* Results modal */}
      {(showResults || closingResults) && regionStats && (
        <ResultsModal
          closing={closingResults}
          regionStats={regionStats}
          regionName={regionName}
          start={start}
          end={end}
          regionTime={regionTime}
          onClose={closeResults}
          onDownloadPlot={downloadPlot}
        />
      )}

      {/* Mooring popup */}
      {mooringPopup && (
        <MapPopup x={mooringPopup.x} y={mooringPopup.y} title={mooringPopup.mooring.name}>
          <PopupRow label="Latitude" labelWidth="w-20">{mooringPopup.mooring.lat.toFixed(4)}°N</PopupRow>
          <PopupRow label="Longitude" labelWidth="w-20">{mooringPopup.mooring.lon.toFixed(4)}°</PopupRow>
          <PopupRow label="Depth" labelWidth="w-20">{mooringPopup.mooring.depth}m</PopupRow>
          <PopupRow label="Deployed" labelWidth="w-20">{mooringPopup.mooring.deployment}</PopupRow>
          <PopupRow label="Recovered" labelWidth="w-20">{mooringPopup.mooring.recovery}</PopupRow>
        </MapPopup>
      )}

      {/* Point popup */}
      {popup && (
        <MapPopup x={popup.x} y={popup.y} title={popup.isStart ? "Start" : popup.isEnd ? "End" : popup.source}>
          <PopupRow label="Time">{formatTime(popup.time)}</PopupRow>
          <PopupRow label="Latitude">{popup.lat?.toFixed(5)}°N</PopupRow>
          <PopupRow label="Longitude">{popup.lon?.toFixed(5)}°</PopupRow>
          <PopupRow label="Speed">{popup.sog != null ? `${popup.sog} kt` : "—"}</PopupRow>
          <PopupRow label="Course">{popup.cog != null ? `${popup.cog}°` : "—"}</PopupRow>
        </MapPopup>
      )}
    </div>
  );
}

export default ShipMap;

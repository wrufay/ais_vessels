import { useEffect, useRef, useState } from 'react';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import { fromLonLat } from 'ol/proj';
import Feature, { type FeatureLike } from 'ol/Feature';
import LineString from 'ol/geom/LineString';
import Point from 'ol/geom/Point';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Style, Stroke, Circle as CircleStyle, Fill } from 'ol/style';
import Draw from 'ol/interaction/Draw';
import GeoJSON from 'ol/format/GeoJSON';
import 'ol/ol.css';

const API = import.meta.env.VITE_API_URL ?? '';

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
  cargo:             '#f4a261',
  tanker:            '#e76f51',
  fishing:           '#2a9d8f',
  passenger:         '#8d6cc4',
  'search & rescue': '#43aa8b',
  other:             '#9aa5b1',
  unknown:           '#cbd2d9',
};

function classifyType(code: string | number | null): string {
  const c = typeof code === 'number' ? code : parseInt(String(code ?? ''), 10);
  if (Number.isNaN(c)) return String(code ?? '').trim() ? String(code).toLowerCase() : 'unknown';
  if (c >= 70 && c < 80) return 'cargo';
  if (c >= 80 && c < 90) return 'tanker';
  if (c === 30) return 'fishing';
  if (c >= 60 && c < 70) return 'passenger';
  if (c === 51) return 'search & rescue';
  if ((c >= 20 && c < 30) || (c >= 31 && c < 51) || (c >= 52 && c < 60) || (c >= 90 && c < 100)) return 'other';
  return 'unknown';
}

function formatTime(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function makeFeatureStyle(showStart: boolean, showEnd: boolean) {
  return function (feature: FeatureLike): Style {
    const geomType = feature.getGeometry()?.getType();
    if (geomType === 'LineString') {
      return new Style({ stroke: new Stroke({ color: '#127475', width: 2 }) });
    }
    const isStart = feature.get('isStart') as boolean;
    const isEnd   = feature.get('isEnd')   as boolean;
    if (isStart && !showStart) return new Style({});
    if (isEnd   && !showEnd)   return new Style({});
    if (isStart) {
      return new Style({
        image: new CircleStyle({
          radius: 7,
          fill:   new Fill({ color: '#2a9d8f' }),
          stroke: new Stroke({ color: '#fff', width: 2.5 }),
        }),
      });
    }
    if (isEnd) {
      return new Style({
        image: new CircleStyle({
          radius: 7,
          fill:   new Fill({ color: '#e63946' }),
          stroke: new Stroke({ color: '#fff', width: 2.5 }),
        }),
      });
    }
    const sog = (feature.get('sog') as number) || 0;
    const color = sog > 10 ? '#e63946' : sog > 3 ? '#f4a261' : '#2a9d8f';
    return new Style({ image: new CircleStyle({ radius: 4, fill: new Fill({ color }) }) });
  };
}

function downloadPlot(b64: string, name: string) {
  const a = document.createElement('a');
  a.href = `data:image/png;base64,${b64}`;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function ShipMap() {
  const mapRef        = useRef<HTMLDivElement>(null);
  const mapObj        = useRef<Map | null>(null);
  const sourceRef     = useRef(new VectorSource());
  const drawSourceRef = useRef(new VectorSource());
  const drawRef       = useRef<Draw | null>(null);
  const routeLayerRef = useRef<VectorLayer | null>(null);

  interface Popup {
    x: number; y: number;
    time: number; lat: number; lon: number;
    sog: number | null; cog: number | null; source: string;
  }

  const [showStart, setShowStart]   = useState(true);
  const [showEnd,   setShowEnd]     = useState(true);
  const [showIntro, setShowIntro]   = useState(true);
  const [vessels, setVessels]       = useState<Vessel[]>([]);
  const [search, setSearch]         = useState('');
  const [selected, setSelected]     = useState<Vessel | null>(null);
  const [start, setStart]           = useState('2025-08-01');
  const [end, setEnd]               = useState('2025-08-31');
  const [loading, setLoading]             = useState(false);
  const [pointCount, setPointCount]       = useState<number | null>(null);
  const [popup, setPopup]                 = useState<Popup | null>(null);
  const [regionStats, setRegionStats]     = useState<RegionStats | null>(null);
  const [regionLoading, setRegionLoading] = useState(false);
  const [regionTime, setRegionTime]       = useState<number | null>(null);
  const [drawnPolygon, setDrawnPolygon]   = useState<object | null>(null);
  const [drawing, setDrawing]             = useState(false);
  const [showResults, setShowResults]     = useState(false);

  useEffect(() => {
    if (!mapRef.current) return;
    const routeLayer = new VectorLayer({
      source: sourceRef.current,
      style: makeFeatureStyle(true, true),
    });
    routeLayerRef.current = routeLayer;

    const map = new Map({
      target: mapRef.current,
      layers: [
        new TileLayer({ source: new OSM() }),
        routeLayer,
        new VectorLayer({
          source: drawSourceRef.current,
          style: new Style({
            stroke: new Stroke({ color: '#e63946', width: 2 }),
            fill:   new Fill({ color: 'rgba(230,57,70,0.1)' }),
          }),
        }),
      ],
      view: new View({
        center: fromLonLat([-63.5, 44.5]),
        zoom: 6,
      }),
    });
    map.on('click', e => {
      map.forEachFeatureAtPixel(e.pixel, feature => {
        if (feature.getGeometry()?.getType() !== 'Point') return;
        setPopup({
          x: e.pixel[0],
          y: e.pixel[1],
          time:   feature.get('time'),
          lat:    feature.get('lat'),
          lon:    feature.get('lon'),
          sog:    feature.get('sog'),
          cog:    feature.get('cog'),
          source: feature.get('source'),
        });
        return true;
      }) ?? setPopup(null);
    });

    mapObj.current = map;
    return () => map.setTarget(undefined);
  }, []);

  useEffect(() => {
    fetch(`${API}/api/vessels`)
      .then(r => r.json())
      .then(d => setVessels(d.vessels || []))
      .catch(console.error);
  }, []);

  function toggleStart() {
    const next = !showStart;
    setShowStart(next);
    routeLayerRef.current?.setStyle(makeFeatureStyle(next, showEnd));
  }

  function toggleEnd() {
    const next = !showEnd;
    setShowEnd(next);
    routeLayerRef.current?.setStyle(makeFeatureStyle(showStart, next));
  }

  function loadRoute() {
    if (!selected) return;
    setLoading(true);
    setPointCount(null);
    sourceRef.current.clear();

    const params = new URLSearchParams({
      start: `${start}T00:00:00`,
      end:   `${end}T23:59:59`,
    });

    fetch(`${API}/api/vessel/${selected.mmsi}/route?${params}`)
      .then(r => r.json())
      .then((data: { points: RoutePoint[] }) => {
        const pts = data.points || [];
        setPointCount(pts.length);
        if (pts.length === 0) return;

        const coords = pts.map(p => fromLonLat([p.longitude, p.latitude]));
        sourceRef.current.addFeature(new Feature({ geometry: new LineString(coords) }));

        pts.forEach((p, i) => {
          const f = new Feature({
            geometry: new Point(fromLonLat([p.longitude, p.latitude])),
            sog:     p.sog,
            cog:     p.cog,
            time:    p.time,
            lat:     p.latitude,
            lon:     p.longitude,
            source:  p.source,
            isStart: i === 0,
            isEnd:   i === pts.length - 1,
          });
          sourceRef.current.addFeature(f);
        });

        const extent = sourceRef.current.getExtent();
        if (extent) mapObj.current!.getView().fit(extent, { padding: [60, 60, 60, 60], maxZoom: 12, duration: 800 });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  function startDrawing() {
    if (!mapObj.current) return;
    if (drawRef.current) mapObj.current.removeInteraction(drawRef.current);
    setDrawnPolygon(null);
    setRegionStats(null);
    setDrawing(true);

    drawSourceRef.current.clear();
    const draw = new Draw({ source: drawSourceRef.current, type: 'Polygon', stopClick: true });
    draw.on('drawend', (e) => {
      const fmt = new GeoJSON();
      const geojson = fmt.writeGeometryObject(e.feature.getGeometry()!, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857',
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
  }

  function loadRegionStats() {
    if (!drawnPolygon) return;
    setRegionLoading(true);
    setRegionStats(null);
    setRegionTime(null);
    const t0 = performance.now();
    fetch(`${API}/api/analysis/region`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ polygon: drawnPolygon, start, end }),
    })
      .then(r => r.json())
      .then((d: RegionStats) => {
        setRegionStats(d);
        setRegionTime(Math.round(performance.now() - t0));
        setShowResults(true);
      })
      .catch(console.error)
      .finally(() => setRegionLoading(false));
  }

  function resetVessels() {
    sourceRef.current.clear();
    setSelected(null);
    setPointCount(null);
    setSearch('');
  }

  const filtered = vessels.filter(v => {
    const q = search.toLowerCase();
    return (
      String(v.mmsi).includes(q) ||
      (v.vessel_name || '').toLowerCase().includes(q) ||
      String(v.ship_type || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="relative w-full h-screen bg-slate-50 text-slate-700">

      {/* ---------------- Sidebar ---------------- */}
      <div className="absolute top-0 left-0 h-full w-80 bg-white z-20 flex flex-col shadow-[8px_0_30px_-12px_rgba(15,23,42,0.15)]">
        <div className="px-5 pt-5 pb-4 shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-slate-800 text-xl tracking-tight">Vessel Tracker</h2>
              <p className="text-xs text-slate-400 mt-0.5">Scotian Shelf · AIS</p>
            </div>
            <button
              onClick={resetVessels}
              title="Clear selection &amp; search"
              className="text-xs text-slate-400 hover:text-[#127475] rounded-full px-2.5 py-1 hover:bg-slate-50 transition-colors"
            >
              ↺ Reset
            </button>
          </div>

          <div className="relative mb-4">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            <input
              className="w-full bg-slate-50 border border-transparent rounded-xl pl-9 pr-3 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-[#2a9d8f] focus:ring-2 focus:ring-[#2a9d8f]/20 transition"
              placeholder="Search name, MMSI, or type…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5 mb-4">
            <label className="flex flex-col gap-1">
              <span className="text-slate-400 text-xs font-medium uppercase tracking-wide">Start</span>
              <input type="date"
                className="bg-slate-50 border border-transparent rounded-xl px-3 py-2 text-sm focus:outline-none focus:bg-white focus:border-[#2a9d8f] focus:ring-2 focus:ring-[#2a9d8f]/20 transition"
                value={start} onChange={e => setStart(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-slate-400 text-xs font-medium uppercase tracking-wide">End</span>
              <input type="date"
                className="bg-slate-50 border border-transparent rounded-xl px-3 py-2 text-sm focus:outline-none focus:bg-white focus:border-[#2a9d8f] focus:ring-2 focus:ring-[#2a9d8f]/20 transition"
                value={end} onChange={e => setEnd(e.target.value)} />
            </label>
          </div>

          <button
            onClick={loadRoute}
            disabled={!selected || loading}
            className="w-full bg-[#127475] text-white rounded-xl py-2.5 text-sm font-semibold shadow-sm shadow-[#127475]/20 hover:bg-[#0e5f60] active:scale-[0.99] disabled:opacity-40 disabled:shadow-none disabled:active:scale-100 transition"
          >
            {loading ? 'Loading…' : selected ? `Show Route · ${selected.vessel_name || selected.mmsi}` : 'Select a vessel'}
          </button>

          {pointCount !== null && (
            <div className="mt-2 text-center">
              <p className="text-xs text-slate-400 mb-2">
                {pointCount === 0 ? 'No data for this period.' : `${pointCount.toLocaleString()} position points`}
              </p>
              {pointCount > 0 && (
                <div className="flex justify-center gap-2">
                  <button
                    onClick={toggleStart}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition ${
                      showStart
                        ? 'bg-[#2a9d8f]/10 text-[#2a9d8f]'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-[#2a9d8f]" />
                    Start
                  </button>
                  <button
                    onClick={toggleEnd}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition ${
                      showEnd
                        ? 'bg-[#e63946]/10 text-[#e63946]'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-[#e63946]" />
                    End
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Scrollable vessel list */}
        <div className="flex items-center justify-between px-5 py-2.5 text-xs font-medium text-slate-400 border-t border-slate-100 shrink-0">
          <span className="uppercase tracking-wide">Vessels</span>
          <span className="tabular-nums">
            {filtered.length !== vessels.length
              ? `${filtered.length} / ${vessels.length}`
              : `${vessels.length}`}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 px-2 pb-2">
          {filtered.length === 0 && (
            <p className="text-sm text-slate-400 p-6 text-center">
              {vessels.length === 0 ? 'Loading vessels…' : 'No vessels match your search.'}
            </p>
          )}
          {filtered.map(v => {
            const type = classifyType(v.ship_type);
            const color = TYPE_COLORS[type] ?? TYPE_COLORS.unknown;
            const active = selected?.mmsi === v.mmsi;
            return (
              <button
                key={v.mmsi}
                onClick={() => { setSelected(v); sourceRef.current.clear(); setPointCount(null); }}
                className={`w-full text-left px-3 py-2.5 rounded-xl mb-0.5 transition ${
                  active ? 'bg-[#127475]/8 ring-1 ring-[#127475]/20' : 'hover:bg-slate-50'
                }`}
              >
                <div className={`font-medium truncate ${active ? 'text-[#0e5f60]' : 'text-slate-700'}`}>
                  {v.vessel_name || 'Unknown vessel'}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 text-[11px] text-slate-500 capitalize">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                    {type}
                  </span>
                  <span className="text-[11px] text-slate-400 tabular-nums">{v.mmsi}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ---------------- Map ---------------- */}
      <div ref={mapRef} className="absolute inset-0 left-80" />

      {/* ---------------- Region toolbar ---------------- */}
      <div className="absolute top-5 left-80 right-0 flex justify-center z-20 pointer-events-none">
        <div className="pointer-events-auto bg-white/90 backdrop-blur-md rounded-full shadow-lg shadow-slate-900/5 ring-1 ring-slate-900/5 px-2 py-1.5 flex items-center gap-2">
          {drawing ? (
            <>
              <span className="text-xs text-slate-500 pl-3">Click to add points · double-click to finish</span>
              <button
                onClick={cancelDrawing}
                className="text-xs rounded-full px-3.5 py-1.5 text-slate-500 hover:bg-slate-100 transition"
              >
                Cancel
              </button>
            </>
          ) : drawnPolygon ? (
            <>
              <span className="text-xs text-slate-500 pl-3 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#e63946]" /> Region selected
              </span>
              <button
                onClick={loadRegionStats}
                disabled={regionLoading}
                className="text-xs rounded-full px-4 py-1.5 bg-[#2a9d8f] text-white font-semibold shadow-sm hover:bg-[#23867a] active:scale-[0.98] disabled:opacity-50 transition"
              >
                {regionLoading ? 'Analysing…' : 'Analyse Region'}
              </button>
              {regionStats && !regionLoading && (
                <button
                  onClick={() => setShowResults(true)}
                  className="text-xs rounded-full px-3.5 py-1.5 text-[#2a9d8f] hover:bg-[#2a9d8f]/10 font-medium transition"
                >
                  View Results
                </button>
              )}
              <button
                onClick={clearRegion}
                className="text-xs rounded-full px-3.5 py-1.5 text-slate-500 hover:bg-slate-100 transition"
              >
                Clear
              </button>
            </>
          ) : (
            <button
              onClick={startDrawing}
              className="text-xs rounded-full px-4 py-1.5 bg-[#2a9d8f] text-white font-semibold shadow-sm hover:bg-[#23867a] active:scale-[0.98] transition flex items-center gap-1.5"
            >
              ✏️ Draw Region to Analyse
            </button>
          )}
        </div>
      </div>

      {/* ---------------- Legend ---------------- */}
      <div className="absolute bottom-5 right-5 bg-white/90 backdrop-blur-md rounded-2xl shadow-lg shadow-slate-900/5 ring-1 ring-slate-900/5 px-4 py-3 text-xs z-10">
        <div className="font-semibold mb-2 text-slate-600">Speed (knots)</div>
        <div className="flex items-center gap-2 mb-1 text-slate-500"><span className="w-2.5 h-2.5 rounded-full bg-[#2a9d8f] inline-block" />&lt; 3</div>
        <div className="flex items-center gap-2 mb-1 text-slate-500"><span className="w-2.5 h-2.5 rounded-full bg-[#f4a261] inline-block" />3 – 10</div>
        <div className="flex items-center gap-2 text-slate-500"><span className="w-2.5 h-2.5 rounded-full bg-[#e63946] inline-block" />&gt; 10</div>
      </div>

      {/* ---------------- Intro modal ---------------- */}
      {showIntro && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8">
            <div className="w-12 h-12 rounded-2xl bg-[#127475]/10 flex items-center justify-center text-2xl mb-4">🌊</div>
            <h1 className="text-2xl font-semibold text-slate-800 tracking-tight mb-1">Scotian Shelf AIS Tracker</h1>
            <p className="text-xs text-slate-400 mb-5">Canadian Coast Guard · Terrestrial AIS</p>
            <p className="text-sm text-slate-600 leading-relaxed mb-6">
              Explore vessel traffic on the Scotian Shelf and analyse activity within any area you draw.
            </p>
            <div className="space-y-3 mb-7">
              {[
                ['Pick a vessel and date range, then ', 'Show Route', ' to plot its track.'],
                ['Click any point to see its time, position, and speed.', '', ''],
                ['Use ', 'Draw Region', ' (top of map) to outline an area and get traffic stats & charts.'],
              ].map(([a, b, c], i) => (
                <div key={i} className="flex gap-3 text-sm text-slate-600">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-[#127475]/10 text-[#127475] font-semibold text-xs flex items-center justify-center">{i + 1}</span>
                  <span className="leading-relaxed pt-0.5">{a}{b && <strong className="text-slate-800">{b}</strong>}{c}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowIntro(false)}
              className="w-full bg-[#127475] text-white rounded-xl py-3 text-sm font-semibold shadow-sm shadow-[#127475]/20 hover:bg-[#0e5f60] active:scale-[0.99] transition"
            >
              Get Started
            </button>
          </div>
        </div>
      )}

      {/* ---------------- Results modal ---------------- */}
      {showResults && regionStats && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
          onClick={() => setShowResults(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between px-7 pt-6 pb-5 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="text-xl font-semibold text-slate-800 tracking-tight">Region Analysis</h2>
                <p className="text-sm text-slate-500 mt-1">
                  <span className="font-medium text-slate-700">{regionStats.unique_vessels}</span> vessels ·{' '}
                  <span className="font-medium text-slate-700">{regionStats.total_positions.toLocaleString()}</span> positions · {start} → {end}
                  {regionTime !== null && <span className="text-slate-400"> · {(regionTime / 1000).toFixed(1)}s</span>}
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
                  No vessel activity found in this region for the selected dates.
                </p>
              ) : (
                <>
                  {regionStats.plots?.vessel_types && (
                    <figure>
                      <figcaption className="flex items-center justify-between mb-2.5">
                        <span className="text-sm font-semibold text-slate-700">Daily vessels by type</span>
                        <button
                          onClick={() => downloadPlot(regionStats.plots.vessel_types!, 'vessels_by_type.png')}
                          className="text-xs font-medium text-[#2a9d8f] hover:bg-[#2a9d8f]/10 rounded-full px-3 py-1 transition"
                        >
                          ↓ Download
                        </button>
                      </figcaption>
                      <img src={`data:image/png;base64,${regionStats.plots.vessel_types}`} className="w-full rounded-xl ring-1 ring-slate-100" />
                    </figure>
                  )}
                  {regionStats.plots?.speed_overall && (
                    <figure>
                      <figcaption className="flex items-center justify-between mb-2.5">
                        <span className="text-sm font-semibold text-slate-700">Daily mean speed</span>
                        <button
                          onClick={() => downloadPlot(regionStats.plots.speed_overall!, 'mean_speed.png')}
                          className="text-xs font-medium text-[#2a9d8f] hover:bg-[#2a9d8f]/10 rounded-full px-3 py-1 transition"
                        >
                          ↓ Download
                        </button>
                      </figcaption>
                      <img src={`data:image/png;base64,${regionStats.plots.speed_overall}`} className="w-full rounded-xl ring-1 ring-slate-100" />
                    </figure>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Point popup ---------------- */}
      {popup && (
        <div
          className="absolute z-30 bg-white ring-1 ring-slate-900/5 rounded-2xl shadow-xl px-4 py-3 text-xs pointer-events-none"
          style={{ left: popup.x + 320 + 12, top: popup.y - 8 }}
        >
          <div className="font-semibold text-[#127475] mb-1.5">{popup.source}</div>
          <div className="text-slate-600 space-y-1 tabular-nums">
            <div><span className="text-slate-400 inline-block w-16">Time</span>{formatTime(popup.time)}</div>
            <div><span className="text-slate-400 inline-block w-16">Latitude</span>{popup.lat?.toFixed(5)}°N</div>
            <div><span className="text-slate-400 inline-block w-16">Longitude</span>{popup.lon?.toFixed(5)}°</div>
            <div><span className="text-slate-400 inline-block w-16">Speed</span>{popup.sog != null ? `${popup.sog} kt` : '—'}</div>
            <div><span className="text-slate-400 inline-block w-16">Course</span>{popup.cog != null ? `${popup.cog}°` : '—'}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ShipMap;

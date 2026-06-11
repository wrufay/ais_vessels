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

function formatTime(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function featureStyle(feature: FeatureLike): Style {
  const type = feature.getGeometry()?.getType();
  if (type === 'LineString') {
    return new Style({
      stroke: new Stroke({ color: '#127475', width: 2 }),
    });
  }
  const sog = (feature.get('sog') as number) || 0;
  const color = sog > 10 ? '#e63946' : sog > 3 ? '#f4a261' : '#2a9d8f';
  return new Style({
    image: new CircleStyle({
      radius: 4,
      fill: new Fill({ color }),
    }),
  });
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

  interface Popup {
    x: number; y: number;
    time: number; lat: number; lon: number;
    sog: number | null; cog: number | null; source: string;
  }

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
    const map = new Map({
      target: mapRef.current,
      layers: [
        new TileLayer({ source: new OSM() }),
        new VectorLayer({
          source: sourceRef.current,
          style: featureStyle,
        }),
        new VectorLayer({
          source: drawSourceRef.current,
          style: new Style({
            stroke: new Stroke({ color: '#e63946', width: 2 }),
            fill: new Fill({ color: 'rgba(230,57,70,0.1)' }),
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

        pts.forEach(p => {
          const f = new Feature({
            geometry: new Point(fromLonLat([p.longitude, p.latitude])),
            sog: p.sog,
            cog: p.cog,
            time: p.time,
            lat: p.latitude,
            lon: p.longitude,
            source: p.source,
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
    <div className="relative w-full h-screen">

      {/* ---------------- Sidebar ---------------- */}
      <div className="absolute top-0 left-0 h-full w-72 bg-white shadow-lg z-20 flex flex-col">
        {/* Sticky header — vessel search + dates */}
        <div className="p-4 border-b shrink-0">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-semibold text-[#127475] text-lg">Vessel Tracker</h2>
            <button
              onClick={resetVessels}
              title="Clear selection &amp; search"
              className="text-xs text-gray-400 hover:text-[#127475] transition-colors"
            >
              ↺ Reset
            </button>
          </div>

          <input
            className="w-full border rounded px-2 py-1.5 text-sm mb-3 focus:outline-none focus:ring-1 focus:ring-[#2a9d8f]"
            placeholder="Search name, MMSI, or type…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-2 text-sm mb-3">
            <label className="flex flex-col gap-0.5">
              <span className="text-gray-500 text-xs">Start</span>
              <input type="date" className="border rounded px-2 py-1"
                value={start} onChange={e => setStart(e.target.value)} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-gray-500 text-xs">End</span>
              <input type="date" className="border rounded px-2 py-1"
                value={end} onChange={e => setEnd(e.target.value)} />
            </label>
          </div>

          <button
            onClick={loadRoute}
            disabled={!selected || loading}
            className="w-full bg-[#127475] text-white rounded py-1.5 text-sm font-medium hover:bg-[#0e5f60] disabled:opacity-40 transition-colors"
          >
            {loading ? 'Loading…' : selected ? `Show Route — ${selected.vessel_name || selected.mmsi}` : 'Select a vessel'}
          </button>

          {pointCount !== null && (
            <p className="text-xs text-gray-400 mt-1.5 text-center">
              {pointCount === 0 ? 'No data for this period.' : `${pointCount} position points`}
            </p>
          )}
        </div>

        {/* Scrollable vessel list */}
        <div className="flex items-center justify-between px-4 py-2 text-xs text-gray-400 border-b shrink-0">
          <span>Vessels</span>
          <span>
            {filtered.length !== vessels.length
              ? `${filtered.length} / ${vessels.length}`
              : `${vessels.length}`}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {filtered.length === 0 && (
            <p className="text-xs text-gray-400 p-4 text-center">
              {vessels.length === 0 ? 'Loading vessels…' : 'No vessels match.'}
            </p>
          )}
          {filtered.map(v => (
            <button
              key={v.mmsi}
              onClick={() => { setSelected(v); sourceRef.current.clear(); setPointCount(null); }}
              className={`w-full text-left px-4 py-2 border-b text-sm hover:bg-gray-50 ${
                selected?.mmsi === v.mmsi ? 'bg-teal-50 border-l-4 border-l-[#127475]' : ''
              }`}
            >
              <div className="font-medium truncate">{v.vessel_name || 'Unknown'}</div>
              <div className="text-xs text-gray-400">{v.mmsi} · {v.ship_type || '—'} · {v.source}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ---------------- Map ---------------- */}
      <div ref={mapRef} className="absolute inset-0 left-72" />

      {/* ---------------- Region toolbar (floating over map) ---------------- */}
      <div className="absolute top-4 left-72 right-0 flex justify-center z-20 pointer-events-none">
        <div className="pointer-events-auto bg-white/95 backdrop-blur rounded-full shadow-lg border border-gray-200 px-2 py-1.5 flex items-center gap-2">
          {drawing ? (
            <>
              <span className="text-xs text-gray-500 pl-2">Click to add points · double-click to finish</span>
              <button
                onClick={cancelDrawing}
                className="text-xs rounded-full px-3 py-1.5 border border-gray-300 text-gray-500 hover:bg-gray-50"
              >
                Cancel
              </button>
            </>
          ) : drawnPolygon ? (
            <>
              <span className="text-xs text-gray-500 pl-2">Region selected</span>
              <button
                onClick={loadRegionStats}
                disabled={regionLoading}
                className="text-xs rounded-full px-3 py-1.5 bg-[#2a9d8f] text-white font-medium hover:bg-[#23867a] disabled:opacity-50"
              >
                {regionLoading ? 'Analysing…' : 'Analyse Region'}
              </button>
              {regionStats && !regionLoading && (
                <button
                  onClick={() => setShowResults(true)}
                  className="text-xs rounded-full px-3 py-1.5 border border-[#2a9d8f] text-[#2a9d8f] hover:bg-teal-50"
                >
                  View Results
                </button>
              )}
              <button
                onClick={clearRegion}
                className="text-xs rounded-full px-3 py-1.5 border border-gray-300 text-gray-500 hover:bg-gray-50"
              >
                Clear
              </button>
            </>
          ) : (
            <button
              onClick={startDrawing}
              className="text-xs rounded-full px-4 py-1.5 bg-[#2a9d8f] text-white font-medium hover:bg-[#23867a]"
            >
              ✏ Draw Region to Analyse
            </button>
          )}
        </div>
      </div>

      {/* ---------------- Legend ---------------- */}
      <div className="absolute bottom-4 right-4 bg-white rounded shadow px-3 py-2 text-xs z-10">
        <div className="font-medium mb-1 text-gray-600">Speed (knots)</div>
        <div className="flex items-center gap-1.5 mb-0.5"><span className="w-3 h-3 rounded-full bg-[#2a9d8f] inline-block"/>&lt; 3</div>
        <div className="flex items-center gap-1.5 mb-0.5"><span className="w-3 h-3 rounded-full bg-[#f4a261] inline-block"/>3 – 10</div>
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-[#e63946] inline-block"/>&gt; 10</div>
      </div>

      {/* ---------------- Intro modal ---------------- */}
      {showIntro && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 p-6">
            <h1 className="text-xl font-semibold text-[#127475] mb-1">Scotian Shelf AIS Vessel Tracker</h1>
            <p className="text-xs text-gray-400 mb-4">Canadian Coast Guard · Terrestrial AIS</p>
            <p className="text-sm text-gray-600 mb-4">
              Explore vessel traffic on the Scotian Shelf and analyse activity within any area you choose.
            </p>
            <div className="text-sm text-gray-600 space-y-2 mb-5">
              <div className="flex gap-2"><span className="text-[#127475] font-medium">1.</span><span>Pick a vessel and date range, then <strong>Show Route</strong> to plot its track.</span></div>
              <div className="flex gap-2"><span className="text-[#127475] font-medium">2.</span><span>Click any point to see its time, position, and speed.</span></div>
              <div className="flex gap-2"><span className="text-[#127475] font-medium">3.</span><span>Use <strong>Draw Region</strong> (top of map) to outline an area and get traffic stats &amp; charts.</span></div>
            </div>
            <button
              onClick={() => setShowIntro(false)}
              className="w-full bg-[#127475] text-white rounded-lg py-2 text-sm font-medium hover:bg-[#0e5f60] transition-colors"
            >
              Get Started
            </button>
          </div>
        </div>
      )}

      {/* ---------------- Results modal ---------------- */}
      {showResults && regionStats && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowResults(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between p-5 border-b shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-[#127475]">Region Analysis</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {regionStats.unique_vessels} vessels · {regionStats.total_positions.toLocaleString()} positions · {start} → {end}
                  {regionTime !== null && <span className="text-gray-400"> · {(regionTime / 1000).toFixed(1)}s</span>}
                </p>
              </div>
              <button
                onClick={() => setShowResults(false)}
                className="text-gray-400 hover:text-gray-700 text-xl leading-none"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto p-5 space-y-6">
              {regionStats.total_positions === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">
                  No vessel activity found in this region for the selected dates.
                </p>
              ) : (
                <>
                  {regionStats.plots?.vessel_types && (
                    <figure>
                      <figcaption className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">Daily vessels by type</span>
                        <button
                          onClick={() => downloadPlot(regionStats.plots.vessel_types!, 'vessels_by_type.png')}
                          className="text-xs text-[#2a9d8f] hover:underline"
                        >
                          ↓ Download
                        </button>
                      </figcaption>
                      <img src={`data:image/png;base64,${regionStats.plots.vessel_types}`} className="w-full rounded border" />
                    </figure>
                  )}
                  {regionStats.plots?.speed_overall && (
                    <figure>
                      <figcaption className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">Daily mean speed</span>
                        <button
                          onClick={() => downloadPlot(regionStats.plots.speed_overall!, 'mean_speed.png')}
                          className="text-xs text-[#2a9d8f] hover:underline"
                        >
                          ↓ Download
                        </button>
                      </figcaption>
                      <img src={`data:image/png;base64,${regionStats.plots.speed_overall}`} className="w-full rounded border" />
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
          className="absolute z-30 bg-white border border-gray-200 rounded shadow-lg px-3 py-2 text-xs pointer-events-none"
          style={{ left: popup.x + 288 + 8, top: popup.y - 8 }}
        >
          <div className="font-semibold text-[#127475] mb-1">{popup.source}</div>
          <div className="text-gray-600 space-y-0.5">
            <div><span className="text-gray-400">Time     </span>{formatTime(popup.time)}</div>
            <div><span className="text-gray-400">Latitude </span>{popup.lat?.toFixed(5)}°N</div>
            <div><span className="text-gray-400">Longitude</span>{popup.lon?.toFixed(5)}°</div>
            <div><span className="text-gray-400">Speed    </span>{popup.sog != null ? `${popup.sog} kt` : '—'}</div>
            <div><span className="text-gray-400">Course   </span>{popup.cog != null ? `${popup.cog}°` : '—'}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ShipMap;

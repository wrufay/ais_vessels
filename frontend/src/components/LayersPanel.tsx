import type { useBathymetry } from "../useBathymetry";
import type { useNoiseLayer } from "../useNoiseLayer";
import { useBasemap as useBasemapHook, BASEMAPS } from "../useBasemap";
import PanelHeader from "./PanelHeader";
import CollapsibleHeader from "./CollapsibleHeader";

// The Map/Layers side-panel's content (everything inside <SidePanel>, which
// Map.tsx still renders directly since its open/width/registerTarget props
// are shared across all 4 side panels). Nearly everything here is state
// already owned by useBathymetry/useNoiseLayer/useBasemap -- rather than
// re-listing ~25 individual props, each hook's whole return value is
// passed through as one prop, typed via ReturnType so it can't drift out
// of sync with the hook itself.
function LayersPanel({
  registerTarget,
  bathymetry,
  noise,
  basemapState,
}: {
  registerTarget: (key: string) => (el: HTMLElement | null) => void;
  bathymetry: ReturnType<typeof useBathymetry>;
  noise: ReturnType<typeof useNoiseLayer>;
  basemapState: ReturnType<typeof useBasemapHook>;
}) {
  const { showBathymetry, setShowBathymetry, bathyOpacity, setBathyOpacity, bathyLoading } = bathymetry;
  const {
    showNoise, setShowNoise, noiseOpacity, setNoiseOpacity, noiseLoading,
    noiseVariable, setNoiseVariable, noiseDate, setNoiseDate, noiseDates,
    noiseAvailable, noiseFreq, setNoiseFreq, noiseDepth, setNoiseDepth,
    noiseVminOverride, setNoiseVminOverride, noiseVmaxOverride, setNoiseVmaxOverride,
    noiseRange,
  } = noise;
  const { basemap, setBasemap, basemapOpen, setBasemapOpen } = basemapState;

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
      <div className="px-5 pt-8 pb-4 shrink-0">
        <PanelHeader
          name="Map"
          description="Switch base map and toggle data overlays."
          className=""
        />
      </div>
      <div ref={registerTarget("mapLayers")} className="shrink-0 px-2 pb-4">
        <div className="px-3 pt-1 pb-1 text-[11px] font-semibold font-geologica text-slate-400 dark:text-slate-500 uppercase tracking-wider">
          Ocean
        </div>
        <div className="px-3 py-2.5 rounded-sm hover:bg-slate-50 dark:hover:bg-slate-800">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={showBathymetry}
              onChange={() => setShowBathymetry((p) => !p)}
              className="accent-[#3d5a80] w-4 h-4 rounded"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Bathymetry</span>
                {bathyLoading && <span className="inline-block w-3 h-3 border-2 border-slate-300 dark:border-slate-600 border-t-slate-500 rounded-full animate-spin" />}
              </div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500">NRCan / DFO — Scotian Shelf &amp; NL Shelves</div>
            </div>
          </label>
          {showBathymetry && (
            <div className="mt-2 ml-7 flex items-center gap-2">
              <span className="text-[11px] text-slate-400 dark:text-slate-500 w-12 shrink-0">Opacity</span>
              <input
                type="range" min={0} max={100} value={Math.round(bathyOpacity * 100)}
                onChange={(e) => setBathyOpacity(Number(e.target.value) / 100)}
                className="panel-slider w-24"
              />
              <input
                type="number" min={0} max={100} value={Math.round(bathyOpacity * 100)}
                onChange={(e) => setBathyOpacity(Math.min(100, Math.max(0, Number(e.target.value))) / 100)}
                className="w-8 text-[11px] text-slate-400 dark:text-slate-500 text-right bg-transparent border-none outline-none"
              />
              <span className="text-[11px] text-slate-400 dark:text-slate-500">%</span>
            </div>
          )}
        </div>
        <div className="px-3 py-2.5 rounded-sm hover:bg-slate-50 dark:hover:bg-slate-800">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={showNoise}
              onChange={() => setShowNoise((p) => !p)}
              className="accent-[#3d5a80] w-4 h-4 rounded"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Noise model</span>
                {noiseLoading && <span className="inline-block w-3 h-3 border-2 border-slate-300 dark:border-slate-600 border-t-slate-500 rounded-full animate-spin" />}
              </div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500">Modelled underwater sound pressure level</div>
            </div>
          </label>
          {showNoise && (
            <div className="mt-2 ml-7 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400 dark:text-slate-500 w-12 shrink-0">Opacity</span>
                <input
                  type="range" min={0} max={100} value={Math.round(noiseOpacity * 100)}
                  onChange={(e) => setNoiseOpacity(Number(e.target.value) / 100)}
                  className="panel-slider w-24"
                />
                <input
                  type="number" min={0} max={100} value={Math.round(noiseOpacity * 100)}
                  onChange={(e) => setNoiseOpacity(Math.min(100, Math.max(0, Number(e.target.value))) / 100)}
                  className="w-8 text-[11px] text-slate-400 dark:text-slate-500 text-right bg-transparent border-none outline-none"
                />
                <span className="text-[11px] text-slate-400 dark:text-slate-500">%</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400 dark:text-slate-500 w-12 shrink-0">Variable</span>
                <select value={noiseVariable} onChange={(e) => setNoiseVariable(e.target.value)}
                  className="text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 flex-1">
                  <option value="vessel_noise">Vessel noise</option>
                  <option value="combined_noise">Combined noise</option>
                  <option value="wind_noise">Wind noise</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400 dark:text-slate-500 w-12 shrink-0">Date</span>
                <select value={noiseDate} onChange={(e) => setNoiseDate(e.target.value)}
                  className="text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 flex-1">
                  {(noiseDates.length > 0 ? noiseDates : [noiseDate]).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              {(() => {
                const options = noiseAvailable[noiseVariable] ?? [];
                const freqs = [...new Set(options.map(o => o.freq))].sort((a, b) => a - b);
                const depths = [...new Set(options.filter(o => o.freq === noiseFreq).map(o => o.depth))].sort((a, b) => a - b);
                return <>
                  {freqs.length > 1 && (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 w-12 shrink-0">Freq</span>
                      <select value={noiseFreq} onChange={(e) => setNoiseFreq(Number(e.target.value))}
                        className="text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 flex-1">
                        {freqs.map(f => <option key={f} value={f}>{f} Hz</option>)}
                      </select>
                    </div>
                  )}
                  {noiseVariable !== "wind_noise" && (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 w-12 shrink-0">Depth</span>
                      <select value={noiseDepth} onChange={(e) => setNoiseDepth(Number(e.target.value))}
                        className="text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 flex-1">
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
                <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400 dark:text-slate-500">
                  <input
                    type="number"
                    step={1}
                    value={noiseVminOverride === "" ? "" : Math.round(noiseVminOverride ?? noiseRange?.vmin ?? 0)}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") { setNoiseVminOverride(""); return; }
                      const n = Number(raw.replace(/^0+(?=\d)/, ""));
                      if (!Number.isNaN(n)) setNoiseVminOverride(n);
                    }}
                    className="spin-arrows w-16 text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 tabular-nums"
                  />
                  <span>dB</span>
                  <input
                    type="number"
                    step={1}
                    value={noiseVmaxOverride === "" ? "" : Math.round(noiseVmaxOverride ?? noiseRange?.vmax ?? 0)}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") { setNoiseVmaxOverride(""); return; }
                      const n = Number(raw.replace(/^0+(?=\d)/, ""));
                      if (!Number.isNaN(n)) setNoiseVmaxOverride(n);
                    }}
                    className="spin-arrows w-16 text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 tabular-nums text-right"
                  />
                </div>
                {(noiseVminOverride !== null || noiseVmaxOverride !== null) && (
                  <div className="flex items-center justify-end">
                    <button
                      onClick={() => { setNoiseVminOverride(null); setNoiseVmaxOverride(null); }}
                      className="text-[9px] text-[#98c1d9] hover:underline"
                    >
                      Reset to auto
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="border-t border-slate-100 dark:border-slate-800 mx-2 mt-2" />
      <div ref={registerTarget("mapBasemap")} className="px-3 py-3 shrink-0">
        <CollapsibleHeader
          open={basemapOpen}
          onToggle={() => setBasemapOpen((p) => !p)}
          label="Base map"
          trailing={
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              {BASEMAPS.find((b) => b.id === basemap)?.label}
            </span>
          }
        />
        {basemapOpen && (
          <div className="pl-4 pr-1 flex flex-col gap-1 pb-1">
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
                <span className="text-sm text-slate-700 dark:text-slate-200">{b.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default LayersPanel;

import type { ChangeEvent } from "react";

const uploadIcon = (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const drawIcon = (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="3 11 22 2 13 21 11 13 3 11" />
  </svg>
);

const analyzeIcon = (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

const basemapIcon = (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
    <line x1="8" y1="2" x2="8" y2="18" />
    <line x1="16" y1="6" x2="16" y2="22" />
  </svg>
);

const styleIcon = (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
  </svg>
);

const zoomInIcon = (
  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const zoomOutIcon = (
  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

interface BottomBarProps {
  zoom: number;
  onZoomChange: (val: number) => void;
  drawing: boolean;
  onStartDrawing: () => void;
  onCancelDrawing: () => void;
  onFileUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  onMooringUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  canAnalyze: boolean;
  analyzeLoading: boolean;
  onAnalyze: () => void;
  basemapOpen: boolean;
  onBasemapToggle: () => void;
  styleOpen: boolean;
  onStyleToggle: () => void;
  sidebarOpen: boolean;
  lat: number | null;
  lon: number | null;
}

function NavBtn({ active, onClick, icon, label, title }: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center gap-1.5 font-inter text-xs px-2 py-1 rounded transition shrink-0 ${
        active ? "bg-[#3d5a80] text-white" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function BottomBar({
  zoom,
  onZoomChange,
  drawing,
  onStartDrawing,
  onCancelDrawing,
  onFileUpload,
  onMooringUpload,
  canAnalyze,
  analyzeLoading,
  onAnalyze,
  basemapOpen,
  onBasemapToggle,
  styleOpen,
  onStyleToggle,
  sidebarOpen,
  lat,
  lon,
}: BottomBarProps) {
  const roundedZoom = Math.round(zoom * 10) / 10;

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-20 h-11 bg-slate-100 border-t border-slate-200 flex items-center pr-4 gap-1 transition-[padding-left] duration-300 ease-in-out"
      style={{ paddingLeft: sidebarOpen ? 352 : 80 }}
    >

      {/* Upload shapefile */}
      <label className="flex items-center gap-1.5 font-inter text-xs text-slate-500 hover:text-slate-700 cursor-pointer px-2 py-1 rounded hover:bg-slate-200 transition shrink-0" title="Upload shapefile (.zip) as a region">
        {uploadIcon}
        <span>Shapefile</span>
        <input type="file" accept=".zip" className="hidden" onChange={onFileUpload} />
      </label>

      {/* Upload moorings */}
      <label className="flex items-center gap-1.5 font-inter text-xs text-slate-500 hover:text-slate-700 cursor-pointer px-2 py-1 rounded hover:bg-slate-200 transition shrink-0" title="Upload mooring positions (.csv)">
        {uploadIcon}
        <span>Moorings</span>
        <input type="file" accept=".csv" className="hidden" onChange={onMooringUpload} />
      </label>

      <div className="w-px h-5 bg-slate-300 mx-1 shrink-0" />

      {/* Draw region */}
      <button
        onClick={drawing ? onCancelDrawing : onStartDrawing}
        className={`flex items-center gap-1.5 font-inter text-xs px-2 py-1 rounded transition shrink-0 ${
          drawing ? "bg-[#3d5a80] text-white" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200"
        }`}
        title={drawing ? "Cancel drawing" : "Draw a region on the map"}
      >
        {drawIcon}
        <span>{drawing ? "Cancel draw" : "Draw region"}</span>
      </button>

      {drawing && <span className="font-inter text-[11px] text-slate-400 shrink-0">Double-click to finish.</span>}

      <div className="w-px h-5 bg-slate-300 mx-1 shrink-0" />

      {/* Analyse */}
      <button
        onClick={onAnalyze}
        disabled={!canAnalyze || analyzeLoading}
        className="flex items-center gap-1.5 font-inter text-xs px-2 py-1 rounded transition shrink-0 text-slate-500 hover:text-slate-700 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
        title="Analyse the selected region"
      >
        {analyzeLoading ? <span className="inline-block w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" /> : analyzeIcon}
        <span>Analyse</span>
      </button>

      {/* Push zoom + right controls to the right */}
      <div className="flex-1" />

      {/* Zoom */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button onClick={() => onZoomChange(Math.max(1, zoom - 1))} className="text-slate-400 hover:text-slate-600 transition p-0.5" title="Zoom out">
          {zoomOutIcon}
        </button>
        <input type="range" min={1} max={18} step={0.5} value={roundedZoom} onChange={(e) => onZoomChange(Number(e.target.value))} className="panel-slider w-24" />
        <button onClick={() => onZoomChange(Math.min(18, zoom + 1))} className="text-slate-400 hover:text-slate-600 transition p-0.5" title="Zoom in">
          {zoomInIcon}
        </button>
        <span className="font-geologica text-[11px] text-slate-400 w-7 tabular-nums">{roundedZoom}</span>
      </div>

      <div className="w-px h-5 bg-slate-300 mx-1 shrink-0" />

      {/* Base map */}
      <NavBtn active={basemapOpen} onClick={onBasemapToggle} icon={basemapIcon} label="Map" title="Switch base map" />

      {/* Vessel / region style */}
      <NavBtn active={styleOpen} onClick={onStyleToggle} icon={styleIcon} label="Style" title="Style vessel tracks and region dots" />

      {/* Lat / lon */}
      {lat !== null && lon !== null && (
        <>
          <div className="w-px h-5 bg-slate-300 mx-1 shrink-0" />
          <span className="font-inter text-xs text-slate-400 tabular-nums shrink-0">
            {lat.toFixed(4)}°, {lon.toFixed(4)}°
          </span>
        </>
      )}

    </div>
  );
}

export default BottomBar;

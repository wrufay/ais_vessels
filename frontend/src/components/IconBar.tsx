import type { Dispatch, SetStateAction } from "react";
import IconBarButton from "./IconBarButton";

const tracksIcon = (
  <svg
    className="w-4 h-4"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {/* hull */}
    <path d="M3 17 L5 20 L19 20 L21 17 Z" />
    {/* deck / superstructure */}
    <path d="M5 17 L5 13 L14 13 L14 17" />
    {/* cabin */}
    <rect x="7" y="10" width="5" height="3" />
    {/* mast */}
    <line x1="9.5" y1="10" x2="9.5" y2="7" />
  </svg>
);

const mooringIcon = (
  <svg
    className="w-4 h-4"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="5" r="2" />
    <line x1="12" y1="7" x2="12" y2="19" />
    <line x1="8" y1="19" x2="16" y2="19" />
    <line x1="5" y1="15" x2="12" y2="19" />
    <line x1="19" y1="15" x2="12" y2="19" />
  </svg>
);

const regionsIcon = (
  <svg
    className="w-4 h-4"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polygon points="3,6 9,3 15,6 21,3 21,18 15,21 9,18 3,21" />
  </svg>
);

const layersIcon = (
  <svg
    className="w-4 h-4"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
);

function IconBar({
  showVesselPanel,
  showRegionPanel,
  showLayerPanel,
  showMooringPanel,
  setShowVesselPanel,
  setShowRegionPanel,
  setShowMooringPanel,
  setShowLayerPanel,
  measuring,
  setMeasuring,
  drawnPolygon,
  regionLoading,
  viewVesselsMode,
  onAnalyse,
  onAllTraffic,
  onClearTraffic,
  onStartTour,
  registerTarget,
}: {
  showVesselPanel: boolean;
  showRegionPanel: boolean;
  showLayerPanel: boolean;
  showMooringPanel: boolean;
  measuring: boolean;
  drawnPolygon: object | null;
  regionLoading: boolean;
  viewVesselsMode: boolean;
  setShowVesselPanel: Dispatch<SetStateAction<boolean>>;
  setShowRegionPanel: Dispatch<SetStateAction<boolean>>;
  setShowMooringPanel: Dispatch<SetStateAction<boolean>>;
  setMeasuring: Dispatch<SetStateAction<boolean>>;
  setShowLayerPanel: Dispatch<SetStateAction<boolean>>;
  onAnalyse: () => void;
  onAllTraffic: () => void;
  onClearTraffic: () => void;
  onStartTour: () => void;
  registerTarget: (key: string) => (el: HTMLElement | null) => void;
}) {
  return (
    <div className="absolute top-1/2 -translate-y-1/2 z-20 flex flex-col gap-2 rounded-r-lg shadow-sm bg-[#fcfffd]/90 py-4 px-3 text-center justify-center items-center">

      <button
        onClick={onStartTour}
        className="w-full font-inter text-slate-600 text-[9px] px-1 py-0.5 border border-slate-400 rounded-full bg-white/80"
      >
        Tour
      </button>

      <button
        onClick={() => setMeasuring((m) => !m)}
        className="w-full font-inter text-slate-600 text-[9px] px-1 py-0.5 border border-slate-400 rounded-full bg-white/80"
      >
        {measuring ? "Cancel" : "Measure"}
      </button>

      <hr className="w-full border-slate-200 my-0.5" />

      <div ref={registerTarget("iconTracks")}>
        <IconBarButton
          label="Tracks"
          title="View individual vessels displayed on the map."
          icon={tracksIcon}
          active={showVesselPanel}
          onClick={() => {
            setShowVesselPanel((p) => !p);
            setShowRegionPanel(false);
            setShowMooringPanel(false);
            setShowLayerPanel(false);
          }}
        />
      </div>

      <div ref={registerTarget("iconMoorings")}>
        <IconBarButton
          label="Moorings"
          title="View and manage mooring locations on the map."
          icon={mooringIcon}
          active={showMooringPanel}
          onClick={() => {
            setShowMooringPanel((p) => !p);
            setShowVesselPanel(false);
            setShowRegionPanel(false);
            setShowLayerPanel(false);
          }}
        />
      </div>

      <div ref={registerTarget("iconRegions")}>
        <IconBarButton
          label="Regions"
          title="Analyze pre-defined and custom-select regions."
          icon={regionsIcon}
          active={showRegionPanel}
          onClick={() => {
            setShowRegionPanel((p) => !p);
            setShowVesselPanel(false);
            setShowMooringPanel(false);
            setShowLayerPanel(false);
          }}
        />
      </div>

      <div ref={registerTarget("iconMap")}>
        <IconBarButton
          label="Map"
          title="Switch base map and toggle data overlays."
          icon={layersIcon}
          active={showLayerPanel}
          onClick={() => {
            setShowLayerPanel((p) => !p);
            setShowVesselPanel(false);
            setShowRegionPanel(false);
            setShowMooringPanel(false);
          }}
        />
      </div>

      <hr className="w-full border-slate-200 my-0.5" />

      <div ref={registerTarget("iconAnalyseGroup")} className="w-full flex flex-col gap-2">
        <button
          title="Generate plots of daily mean speed, types and vessel traffic density heat-map."
          disabled={!drawnPolygon || regionLoading}
          onClick={onAnalyse}
          className="w-full font-inter text-slate-600 text-[9px] px-1 py-0.5 border border-slate-400 rounded-full bg-white/80 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {regionLoading ? "..." : "Analyse"}
        </button>
        <button
          title="See all vessel traffic in selected region"
          disabled={!drawnPolygon || regionLoading}
          onClick={onAllTraffic}
          className="w-full font-inter text-slate-600 text-[9px] px-1 py-0.5 border border-slate-400 rounded-full bg-white/80 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          All traffic
        </button>
        <button
          title="Clear region traffic dots"
          disabled={!viewVesselsMode}
          onClick={onClearTraffic}
          className="w-full font-inter text-slate-600 text-[9px] px-1 py-0.5 border border-slate-400 rounded-full bg-white/80 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Clear
        </button>
      </div>

      <hr className="w-full border-slate-200 my-0.5" />
      {/* legend */}
      <div className="text-[9px] font-semibold text-slate-400 mb-0.5">Speed (kn)</div>
      {([["#0a8754", "< 3"], ["#ffc857", "3–10"], ["#ee6c4d", "> 10"]] as const).map(([color, label]) => (
        <div key={label} className="flex items-center justify-center gap-1.5 text-[9px] text-slate-400 w-full">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
          {label}
        </div>
      ))}
    </div>
  );
}

export default IconBar;

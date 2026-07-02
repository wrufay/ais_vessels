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

const customizeIcon = (
  <svg
    className="w-4 h-4"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

function IconBar({
  showVesselPanel,
  showRegionPanel,
  showLayerPanel,
  showCustomizePanel,
  setShowVesselPanel,
  setShowRegionPanel,
  setShowMooringPanel,
  setShowLayerPanel,
  setShowCustomizePanel,
}: {
  showVesselPanel: boolean;
  showRegionPanel: boolean;
  showLayerPanel: boolean;
  showCustomizePanel: boolean;
  setShowVesselPanel: Dispatch<SetStateAction<boolean>>;
  setShowRegionPanel: Dispatch<SetStateAction<boolean>>;
  setShowMooringPanel: Dispatch<SetStateAction<boolean>>;
  setShowLayerPanel: Dispatch<SetStateAction<boolean>>;
  setShowCustomizePanel: Dispatch<SetStateAction<boolean>>;
}) {
  return (
    <div className="absolute top-1/2 -translate-y-1/2 z-20 flex flex-col gap-2 rounded-r-lg shadow-sm bg-[#fcfffd]/90 py-4 px-3 text-center justify-center items-center">
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
          setShowCustomizePanel(false);
        }}
      />

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
          setShowCustomizePanel(false);
        }}
      />

      <IconBarButton
        label="Overlay"
        title="Display overlaid features on the map (e.g. moorings, bathymetry)"
        icon={layersIcon}
        active={showLayerPanel}
        onClick={() => {
          setShowLayerPanel((p) => !p);
          setShowVesselPanel(false);
          setShowRegionPanel(false);
          setShowMooringPanel(false);
          setShowCustomizePanel(false);
        }}
      />

      <IconBarButton
        label="Settings"
        title="Customize map appearance"
        icon={customizeIcon}
        active={showCustomizePanel}
        onClick={() => {
          setShowCustomizePanel((p) => !p);
          setShowVesselPanel(false);
          setShowRegionPanel(false);
          setShowMooringPanel(false);
          setShowLayerPanel(false);
        }}
      />

      <hr className="w-full border-slate-200 my-0.5" />

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

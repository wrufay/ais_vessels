import type { Dispatch, SetStateAction } from "react";
import IconBarButton from "./IconBarButton";

const tracksIcon = (
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
);

const regionsIcon = (
  <svg
    className="w-5 h-5"
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
    className="w-5 h-5"
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
  setShowVesselPanel,
  setShowRegionPanel,
  setShowMooringPanel,
  setShowLayerPanel,
}: {
  showVesselPanel: boolean;
  showRegionPanel: boolean;
  showLayerPanel: boolean;
  setShowVesselPanel: Dispatch<SetStateAction<boolean>>;
  setShowRegionPanel: Dispatch<SetStateAction<boolean>>;
  setShowMooringPanel: Dispatch<SetStateAction<boolean>>;
  setShowLayerPanel: Dispatch<SetStateAction<boolean>>;
}) {
  return (
    <div className="absolute left-4 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-4 bg-white/85 py-5 px-3 rounded-full text-center justify-center items-center">
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

      {/* Todo with draw region: remove the button, have it be a feature under regions. perhaps next to the regions text */}

      {/* important logic to carry over to other button:
      onClick={drawing ? cancelDrawing : startDrawing}

      className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition text-white ${
            drawing
              ? "bg-[#ee6c4d] hover:bg-[#c4462a]"
              : "bg-[#3d5a80] hover:bg-[#293241]"
          }`} */}

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
        }}
      />
    </div>
  );
}

export default IconBar;

import type { Dispatch, SetStateAction } from "react";
import IconBarButton from "./IconBarButton";
import { SPEED_STYLE } from "../utils/mapStyles";

const sunIcon = (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
);

const moonIcon = (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
  </svg>
);

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

const impactsIcon = (
  <svg
    className="w-4 h-4"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="9" opacity="0.6" />
  </svg>
);

function IconBar({
  showVesselPanel,
  showRegionPanel,
  showLayerPanel,
  showMooringPanel,
  showImpactsPanel,
  setShowVesselPanel,
  setShowRegionPanel,
  setShowMooringPanel,
  setShowLayerPanel,
  setShowImpactsPanel,
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
  isDark,
  toggleTheme,
  innerRef,
}: {
  showVesselPanel: boolean;
  showRegionPanel: boolean;
  showLayerPanel: boolean;
  showMooringPanel: boolean;
  showImpactsPanel: boolean;
  measuring: boolean;
  drawnPolygon: object | null;
  regionLoading: boolean;
  viewVesselsMode: boolean;
  setShowVesselPanel: Dispatch<SetStateAction<boolean>>;
  setShowRegionPanel: Dispatch<SetStateAction<boolean>>;
  setShowMooringPanel: Dispatch<SetStateAction<boolean>>;
  setMeasuring: Dispatch<SetStateAction<boolean>>;
  setShowLayerPanel: Dispatch<SetStateAction<boolean>>;
  setShowImpactsPanel: Dispatch<SetStateAction<boolean>>;
  onAnalyse: () => void;
  onAllTraffic: () => void;
  onClearTraffic: () => void;
  onStartTour: () => void;
  registerTarget: (key: string) => (el: HTMLElement | null) => void;
  isDark: boolean;
  toggleTheme: () => void;
  innerRef?: (el: HTMLDivElement | null) => void;
}) {
  // Only one panel is open at a time -- toggling one closes the other 4.
  const panelSetters = [setShowVesselPanel, setShowRegionPanel, setShowMooringPanel, setShowLayerPanel, setShowImpactsPanel];
  function togglePanel(setShow: Dispatch<SetStateAction<boolean>>) {
    panelSetters.forEach((setter) => (setter === setShow ? setter((p) => !p) : setter(false)));
  }

  return (
    // Outer/inner both full viewport height now (not centered to content
    // height) -- a fixed-position sidebar, not a floating pill, so other
    // overlays (cursor coordinates, OL's zoom control) can measure and
    // offset past its width reliably instead of guessing where its
    // vertically-centered box happens to start/end. Inner still scrolls
    // instead of clipping if content ever exceeds the viewport height.
    // z-30, not z-20 like the side panels -- otherwise the left-anchored
    // params panel (also left-0) would render on top of it and block the
    // icon buttons while open, same reasoning as the persistent top-right
    // chevron already being z-30 above the right-side panels.
    <div ref={innerRef} className="absolute inset-y-0 left-0 z-30 flex">
    <div className="h-full overflow-y-auto flex flex-col gap-2 shadow-sm bg-[#fcfffd]/90 dark:bg-slate-900/90 py-4 px-3 text-center items-center">

      <button
        onClick={onStartTour}
        className="w-full font-inter text-slate-600 dark:text-slate-300 text-[9px] px-1 py-0.5 border border-slate-400 dark:border-slate-600 rounded-full bg-white/80 dark:bg-slate-900/80"
      >
        Tour
      </button>

      <button
        onClick={() => setMeasuring((m) => !m)}
        className="w-full font-inter text-slate-600 dark:text-slate-300 text-[9px] px-1 py-0.5 border border-slate-400 dark:border-slate-600 rounded-full bg-white/80 dark:bg-slate-900/80"
      >
        {measuring ? "Cancel" : "Measure"}
      </button>

      {/* Tracks..Clear as one block, centered in whatever space is left
          between the top (Tour/Measure) and bottom (speed legend/theme)
          groups -- my-auto (not justify-center on the outer flex) so that
          if content ever overflows a short viewport, the auto margins
          collapse to 0 instead of clipping the top of the block out of
          scroll range the way justify-center would. */}
      <div className="w-full flex flex-col items-center gap-2 my-auto">
        <hr className="w-full border-slate-200 dark:border-slate-700 my-0.5" />

        <div ref={registerTarget("iconTracks")}>
          <IconBarButton
            label="Tracks"
            title="View individual vessels displayed on the map."
            icon={tracksIcon}
            active={showVesselPanel}
            onClick={() => togglePanel(setShowVesselPanel)}
          />
        </div>

        <div ref={registerTarget("iconMoorings")}>
          <IconBarButton
            label="Moorings"
            title="View and manage mooring locations on the map."
            icon={mooringIcon}
            active={showMooringPanel}
            onClick={() => togglePanel(setShowMooringPanel)}
          />
        </div>

        <div ref={registerTarget("iconRegions")}>
          <IconBarButton
            label="Regions"
            title="Analyze pre-defined and custom-select regions."
            icon={regionsIcon}
            active={showRegionPanel}
            onClick={() => togglePanel(setShowRegionPanel)}
          />
        </div>

        <div ref={registerTarget("iconMap")}>
          <IconBarButton
            label="Map"
            title="Switch base map and toggle data overlays."
            icon={layersIcon}
            active={showLayerPanel}
            onClick={() => togglePanel(setShowLayerPanel)}
          />
        </div>

        <div ref={registerTarget("iconImpacts")}>
          <IconBarButton
            label="Impacts"
            title="Calculate and view underwater noise impacts on marine species."
            icon={impactsIcon}
            active={showImpactsPanel}
            onClick={() => togglePanel(setShowImpactsPanel)}
          />
        </div>

        <hr className="w-full border-slate-200 dark:border-slate-700 my-0.5" />

        <div ref={registerTarget("iconAnalyseGroup")} className="w-full flex flex-col gap-2">
          <button
            title="Generate plots of daily mean speed, types and vessel traffic density heat-map."
            disabled={!drawnPolygon || regionLoading}
            onClick={onAnalyse}
            className="w-full font-inter text-slate-600 dark:text-slate-300 text-[9px] px-1 py-0.5 border border-slate-400 dark:border-slate-600 rounded-full bg-white/80 dark:bg-slate-900/80 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {regionLoading ? "..." : "Analyse"}
          </button>
          <button
            title="See all vessel traffic in selected region"
            disabled={!drawnPolygon || regionLoading}
            onClick={onAllTraffic}
            className="w-full font-inter text-slate-600 dark:text-slate-300 text-[9px] px-1 py-0.5 border border-slate-400 dark:border-slate-600 rounded-full bg-white/80 dark:bg-slate-900/80 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            All traffic
          </button>
          <button
            title="Clear region traffic dots"
            disabled={!viewVesselsMode}
            onClick={onClearTraffic}
            className="w-full font-inter text-slate-600 dark:text-slate-300 text-[9px] px-1 py-0.5 border border-slate-400 dark:border-slate-600 rounded-full bg-white/80 dark:bg-slate-900/80 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Speed legend + theme toggle -- glued to the bottom (this is the
          last flex child, right after the my-auto block above, so it
          naturally lands flush against the bar's bottom edge). */}
      <hr className="w-full border-slate-200 dark:border-slate-700 my-0.5" />
      <div className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 mb-0.5">Speed (kn)</div>
      {([
        [SPEED_STYLE.fill.slow, `< ${SPEED_STYLE.thresholds.mid}`],
        [SPEED_STYLE.fill.mid, `${SPEED_STYLE.thresholds.mid}–${SPEED_STYLE.thresholds.fast}`],
        [SPEED_STYLE.fill.fast, `> ${SPEED_STYLE.thresholds.fast}`],
      ] as const).map(([color, label]) => (
        <div key={label} className="flex items-center justify-center gap-1.5 text-[9px] text-slate-400 dark:text-slate-500 w-full">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
          {label}
        </div>
      ))}

      <hr className="w-full border-slate-200 dark:border-slate-700 my-0.5" />

      <button
        onClick={toggleTheme}
        title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        className="text-slate-600 dark:text-slate-300"
      >
        {isDark ? sunIcon : moonIcon}
      </button>
    </div>
    </div>
  );
}

export default IconBar;

import type { RefObject } from "react";
import type VectorSource from "ol/source/Vector";
import { type PresetRegion, CHA_REGIONS, WEA_REGIONS } from "../data/regions";
import { drawnRegionLabel, TRACK_DEFAULT_COLOR } from "../utils/mapStyles";
import PanelHeader from "./PanelHeader";
import RegionListItem from "./RegionListItem";
import SizeOpacityPanel from "./SizeOpacityPanel";

interface UserRegion {
  name: string;
  geojson: object;
  type: string;
}

// The Regions side-panel's content (everything inside <SidePanel>, which
// Map.tsx still renders directly since its open/width/registerTarget props
// are shared across all 4 side panels). Draw/upload controls, the
// CHA/WEA/Uploaded/Your-regions lists, and size/opacity controls for drawn
// region dots.
function RegionsPanel({
  registerTarget,
  drawing,
  startDrawing,
  cancelDrawing,
  onShapefileUpload,
  viewVesselsMode,
  regionDisplayMode,
  setRegionDisplayMode,
  regionListElRef,
  regionListHeight,
  clickedRegionNames,
  regionName,
  onRegionCheckboxClick,
  uploadedRegions,
  userSelectedRegions,
  setUserSelectedRegions,
  setDrawnPolygon,
  setRegionName,
  drawSourceRef,
  regionTrackSourceRef,
  setViewVesselsMode,
  setRegionStats,
  onRegionListResizeMouseDown,
  regionDotOpen,
  setRegionDotOpen,
  regionDotSize,
  setRegionDotSize,
  regionDotOpacity,
  setRegionDotOpacity,
}: {
  registerTarget: (key: string) => (el: HTMLElement | null) => void;
  drawing: boolean;
  startDrawing: () => void;
  cancelDrawing: () => void;
  onShapefileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  viewVesselsMode: boolean;
  regionDisplayMode: "grey" | "type" | "speed" | "vessel";
  setRegionDisplayMode: (mode: "grey" | "type" | "speed" | "vessel") => void;
  regionListElRef: RefObject<HTMLDivElement | null>;
  regionListHeight: number | null;
  clickedRegionNames: Set<string>;
  regionName: string | null;
  onRegionCheckboxClick: (r: { name: string; geojson: object }) => void;
  uploadedRegions: PresetRegion[];
  userSelectedRegions: UserRegion[];
  setUserSelectedRegions: (fn: (prev: UserRegion[]) => UserRegion[]) => void;
  setDrawnPolygon: (v: object | null) => void;
  setRegionName: (v: string | null) => void;
  drawSourceRef: RefObject<VectorSource>;
  regionTrackSourceRef: RefObject<VectorSource>;
  setViewVesselsMode: (v: boolean) => void;
  setRegionStats: (v: null) => void;
  onRegionListResizeMouseDown: (e: React.MouseEvent) => void;
  regionDotOpen: boolean;
  setRegionDotOpen: (fn: (prev: boolean) => boolean) => void;
  regionDotSize: number;
  setRegionDotSize: (v: number) => void;
  regionDotOpacity: number;
  setRegionDotOpacity: (v: number) => void;
}) {
  return (
    <>
      <div className="px-5 pt-8 shrink-0">
        <PanelHeader
          name="Regions"
          description="Select one or more regions to display them on the map."
        />

        <div ref={registerTarget("regionCustomize")} className="mt-4 mb-4 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <button
              onClick={drawing ? cancelDrawing : startDrawing}
              className="font-inter text-slate-600 dark:text-slate-300 text-xs px-2 py-0.5 border border-slate-400 dark:border-slate-600 rounded-full"
            >
              {drawing ? "Cancel" : "Draw"}
            </button>
            <label className="font-stack-headline text-xs text-slate-600 dark:text-slate-300">
              {drawing ? "Double-click to finish" : "Click map to add points"}
            </label>
          </div>
          <div className="flex items-center justify-between">
            <label className="font-inter text-slate-600 dark:text-slate-300 text-xs px-2 py-0.5 border border-slate-400 dark:border-slate-600 rounded-full cursor-pointer">
              Upload
              <input type="file" accept=".zip" className="hidden" onChange={onShapefileUpload} />
            </label>
            <label className="font-stack-headline text-xs text-slate-600 dark:text-slate-300">
             Shapefile (.zip)
            </label>
          </div>

          {viewVesselsMode && (
            <div className="flex items-center gap-1.5">
              {(["grey", "type", "speed", "vessel"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setRegionDisplayMode(mode)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium font-geologica transition ${
                    regionDisplayMode === mode
                      ? "bg-[#3d5a80] text-white"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  {mode === "grey" ? "Uniform" : mode === "type" ? "Type" : mode === "speed" ? "Speed" : "Vessel"}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div ref={regionListElRef} style={{ height: regionListHeight ?? undefined }} className="overflow-y-auto min-h-0 px-2 pb-4">
        {/* CHA section */}
        <div className="px-3 pt-3 pb-1 text-[11px] font-semibold font-geologica text-slate-400 dark:text-slate-500 uppercase tracking-wider">
          Critical Habitat Areas
        </div>
        {CHA_REGIONS.map((r) => (
          <RegionListItem
            key={r.name}
            label={r.name}
            dotColor="#3d5a80"
            tagLabel="CHA"
            checked={clickedRegionNames.has(r.name)}
            highlighted={regionName === r.name}
            onClick={() => onRegionCheckboxClick(r)}
          />
        ))}

        {/* WEA section */}
        <div className="px-3 pt-3 pb-1 text-[11px] font-semibold font-geologica text-slate-400 dark:text-slate-500 uppercase tracking-wider">
          Wind Energy Areas
        </div>
        {WEA_REGIONS.map((r) => (
          <RegionListItem
            key={r.name}
            label={r.name}
            dotColor="#ee6c4d"
            tagLabel="WEA"
            checked={clickedRegionNames.has(r.name)}
            highlighted={regionName === r.name}
            onClick={() => onRegionCheckboxClick(r)}
          />
        ))}

        {/* Uploaded regions */}
        {uploadedRegions.length > 0 && (
          <>
            <div className="px-3 pt-4 pb-1 text-[11px] font-semibold font-geologica text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Uploaded
            </div>
            {uploadedRegions.map((r) => (
              <RegionListItem
                key={r.name}
                label={r.name}
                dotColor="#9b59b6"
                tagLabel="Uploaded"
                checked={clickedRegionNames.has(r.name)}
                highlighted={regionName === r.name}
                onClick={() => onRegionCheckboxClick(r)}
              />
            ))}
          </>
        )}

        {/* Your regions (drawn) — at bottom */}
        {userSelectedRegions.length > 0 && (
          <>
            <div className="px-3 pt-4 pb-1 text-[11px] font-semibold font-geologica text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Your regions
            </div>
            {userSelectedRegions.map((r) => (
              <RegionListItem
                key={r.name}
                label={drawnRegionLabel(r.geojson)}
                dotColor="#98c1d9"
                tagLabel="Drawn"
                checked={clickedRegionNames.has(r.name)}
                highlighted={regionName === r.name}
                onClick={() => onRegionCheckboxClick(r)}
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
                    setViewVesselsMode(false);
                    setRegionStats(null);
                  }
                }}
              />
            ))}
          </>
        )}
      </div>
      <div
        onMouseDown={onRegionListResizeMouseDown}
        className="h-1.5 mx-2 -my-0.5 rounded-full cursor-row-resize hover:bg-[#98c1d9]/40 active:bg-[#98c1d9]/60"
      />
      <div className="border-t border-slate-100 dark:border-slate-800 mx-2 mt-2" />
      <div className="px-3 py-3 flex flex-col gap-1">
        <SizeOpacityPanel
          open={regionDotOpen}
          onToggle={() => setRegionDotOpen((p) => !p)}
          preview={
            <div className="rounded-full shrink-0" style={{ width: regionDotSize * 2, height: regionDotSize * 2, opacity: regionDotOpacity, background: TRACK_DEFAULT_COLOR }} />
          }
          size={regionDotSize}
          onSizeChange={setRegionDotSize}
          sizeMin={2}
          sizeMax={14}
          opacity={regionDotOpacity}
          onOpacityChange={setRegionDotOpacity}
        />
      </div>
    </>
  );
}

export default RegionsPanel;

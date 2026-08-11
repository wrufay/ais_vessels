import type { RefObject } from "react";
import type Map from "ol/Map";
import type VectorSource from "ol/source/Vector";
import { fromLonLat } from "ol/proj";
import { type Mooring, AMAR_MOORINGS } from "../data/moorings";
import { makeMooringCanvas } from "../utils/mapStyles";
import PanelHeader from "./PanelHeader";
import DateRangePicker from "./DateRangePicker";
import SizeOpacityPanel from "./SizeOpacityPanel";

// The Moorings side-panel's content (everything inside <SidePanel>, which
// Map.tsx still renders directly since its open/width/registerTarget props
// are shared across all 4 side panels). Lists AMAR + uploaded moorings for
// the selected date range, click-to-popup, and the size/opacity controls
// for their map markers.
function MooringPanel({
  registerTarget,
  start,
  end,
  setStart,
  setEnd,
  onMooringUpload,
  onDownloadMooringTemplate,
  mooringListElRef,
  mooringListHeight,
  onMooringListResizeMouseDown,
  uploadedMoorings,
  highlightedMooringRef,
  mooringSourceRef,
  mooringPopup,
  setMooringPopup,
  mapObj,
  mooringOpen,
  setMooringOpen,
  mooringSize,
  setMooringSize,
  mooringOpacity,
  setMooringOpacity,
}: {
  registerTarget: (key: string) => (el: HTMLElement | null) => void;
  start: string;
  end: string;
  setStart: (v: string) => void;
  setEnd: (v: string) => void;
  onMooringUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDownloadMooringTemplate: () => void;
  mooringListElRef: RefObject<HTMLDivElement | null>;
  mooringListHeight: number | null;
  onMooringListResizeMouseDown: (e: React.MouseEvent) => void;
  uploadedMoorings: Mooring[];
  highlightedMooringRef: RefObject<string | null>;
  mooringSourceRef: RefObject<VectorSource>;
  mooringPopup: { x: number; y: number; mooring: Mooring } | null;
  setMooringPopup: (v: { x: number; y: number; mooring: Mooring } | null) => void;
  mapObj: RefObject<Map | null>;
  mooringOpen: boolean;
  setMooringOpen: (fn: (prev: boolean) => boolean) => void;
  mooringSize: number;
  setMooringSize: (v: number) => void;
  mooringOpacity: number;
  setMooringOpacity: (v: number) => void;
}) {
  function clickMooring(m: Mooring) {
    if (mooringPopup?.mooring.name === m.name) {
      setMooringPopup(null);
      return;
    }
    const pixel = mapObj.current?.getPixelFromCoordinate(fromLonLat([m.lon, m.lat]));
    if (pixel) setMooringPopup({ x: pixel[0], y: pixel[1], mooring: m });
  }

  function renderMooringRow(m: Mooring) {
    return (
      <div
        key={m.name}
        className="px-3 py-2.5 rounded-sm hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
        onMouseEnter={() => { highlightedMooringRef.current = m.name; mooringSourceRef.current.changed(); }}
        onMouseLeave={() => { highlightedMooringRef.current = null; mooringSourceRef.current.changed(); }}
        onClick={() => clickMooring(m)}
      >
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#293241] inline-block shrink-0" />
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{m.name}</span>
        </div>
        <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{m.depth}m · {m.deployment} → {m.recovery}</div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-5 pt-8 shrink-0">
        <PanelHeader
          name="Moorings"
          description="Filter by date to see active mooring locations."
          className="mb-4"
        />
        <DateRangePicker start={start} end={end} onStartChange={setStart} onEndChange={setEnd} />
        <div ref={registerTarget("mooringUpload")} className="mt-3 flex flex-row justify-between items-center">
          <label className="font-inter text-slate-600 dark:text-slate-300 text-xs px-2 py-0.5 border border-slate-400 dark:border-slate-600 rounded-full cursor-pointer">
            Upload
            <input type="file" accept=".csv" className="hidden" onChange={onMooringUpload} />
          </label>
          <span onClick={onDownloadMooringTemplate} className="font-stack-headline text-xs text-slate-600 dark:text-slate-300 border-b border-slate-400 dark:border-slate-600 cursor-pointer">
            CSV template
          </span>
        </div>
      </div>
      <div ref={mooringListElRef} style={{ height: mooringListHeight ?? undefined }} className="overflow-y-auto min-h-0 px-2 pb-4 mt-4">
        <div className="px-3 pt-1 pb-1 text-[11px] font-semibold font-geologica text-slate-400 dark:text-slate-500 uppercase tracking-wider">AMAR</div>
        {AMAR_MOORINGS.filter((m) => m.deployment <= end && m.recovery >= start).length === 0 && (
          <p className="text-xs text-slate-400 dark:text-slate-500 px-3 py-1">None active in this period.</p>
        )}
        {AMAR_MOORINGS.filter((m) => m.deployment <= end && m.recovery >= start).map(renderMooringRow)}
        {uploadedMoorings.length > 0 && (
          <>
            <div className="px-3 pt-3 pb-1 text-[11px] font-semibold font-geologica text-slate-400 dark:text-slate-500 uppercase tracking-wider">Uploaded</div>
            {uploadedMoorings.filter((m) => m.deployment <= end && m.recovery >= start).length === 0 && (
              <p className="text-xs text-slate-400 dark:text-slate-500 px-3 py-1">None active in this period.</p>
            )}
            {uploadedMoorings.filter((m) => m.deployment <= end && m.recovery >= start).map(renderMooringRow)}
          </>
        )}
      </div>
      <div
        onMouseDown={onMooringListResizeMouseDown}
        className="h-1.5 mx-2 -my-0.5 rounded-full cursor-row-resize hover:bg-[#98c1d9]/40 active:bg-[#98c1d9]/60"
      />
      <div className="border-t border-slate-100 dark:border-slate-800 mx-2 mt-2" />
      <div className="px-3 py-3 flex flex-col gap-1 shrink-0">
        <SizeOpacityPanel
          open={mooringOpen}
          onToggle={() => setMooringOpen((p) => !p)}
          preview={
            <img src={makeMooringCanvas(false, mooringSize).toDataURL()} style={{ opacity: mooringOpacity, width: mooringSize * 2, height: mooringSize * 2 }} />
          }
          size={mooringSize}
          onSizeChange={setMooringSize}
          sizeMin={2}
          sizeMax={20}
          opacity={mooringOpacity}
          onOpacityChange={setMooringOpacity}
        />
      </div>
    </div>
  );
}

export default MooringPanel;

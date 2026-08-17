import type { RefObject } from "react";
import { Virtuoso } from "react-virtuoso";
import type VectorSource from "ol/source/Vector";
import { type Vessel, formatRelativeTime } from "../Map";
import { classifyType, SPEED_STYLE } from "../utils/mapStyles";
import { TYPE_COLORS } from "../data/vesselTypeColors";
import type { VesselFilters } from "./VesselTypeFilterModal";
import PanelHeader from "./PanelHeader";
import DateRangePicker from "./DateRangePicker";
import CollapsibleHeader from "./CollapsibleHeader";
import SizeOpacityPanel from "./SizeOpacityPanel";

// The Tracks side-panel's content (everything inside <SidePanel>, which
// Map.tsx still renders directly since its open/width/registerTarget props
// are shared across all 4 side panels). Search/date filters, the
// virtualized vessel list (Virtuoso -- there can be thousands of vessels),
// and size/opacity controls for the track dots.
function TracksPanel({
  registerTarget,
  ccgLastPositionAt,
  start,
  end,
  setStart,
  setEnd,
  search,
  setSearch,
  vesselListOpen,
  setVesselListOpen,
  filtered,
  vessels,
  filters,
  setDraftFilters,
  setShowTypeFilter,
  vesselListHeight,
  selected,
  setSelected,
  sourceRef,
  setPointCount,
  pointCount,
  pointTotal,
  loadRoute,
  onVesselListResizeMouseDown,
  vesselOpen,
  setVesselOpen,
  vesselSize,
  setVesselSize,
  vesselOpacity,
  setVesselOpacity,
}: {
  registerTarget: (key: string) => (el: HTMLElement | null) => void;
  ccgLastPositionAt: string | null;
  start: string;
  end: string;
  setStart: (v: string) => void;
  setEnd: (v: string) => void;
  search: string;
  setSearch: (v: string) => void;
  vesselListOpen: boolean;
  setVesselListOpen: (fn: (prev: boolean) => boolean) => void;
  filtered: Vessel[];
  vessels: Vessel[];
  filters: VesselFilters;
  setDraftFilters: (v: VesselFilters) => void;
  setShowTypeFilter: (v: boolean) => void;
  vesselListHeight: number;
  selected: Vessel | null;
  setSelected: (v: Vessel | null) => void;
  sourceRef: RefObject<VectorSource>;
  setPointCount: (v: number | null) => void;
  pointCount: number | null;
  pointTotal: number | null;
  loadRoute: (vessel?: Vessel) => void;
  onVesselListResizeMouseDown: (e: React.MouseEvent) => void;
  vesselOpen: boolean;
  setVesselOpen: (fn: (prev: boolean) => boolean) => void;
  vesselSize: number;
  setVesselSize: (v: number) => void;
  vesselOpacity: number;
  setVesselOpacity: (v: number) => void;
}) {
  return (
    <>
      <div ref={registerTarget("vesselSearch")} className="px-5 pt-8 shrink-0">
        <PanelHeader
          description="Click a vessel to see its track."
          name="Tracks"
        />
        <div className="text-[11px] text-slate-400 dark:text-slate-500 -mt-2 mb-3">
          {ccgLastPositionAt
            ? `Live AIS (CCG) updated ${formatRelativeTime(ccgLastPositionAt)}`
            : "Live AIS (CCG) feed not available"}
        </div>
        <DateRangePicker
          start={start}
          end={end}
          onStartChange={setStart}
          onEndChange={setEnd}
        />

        {/* Search for a vessel input bar */}
        <div className="relative mb-4">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-slate-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className="w-full bg-slate-50 dark:bg-slate-800 border border-transparent rounded-sm pl-9 pr-3 py-2.5 text-sm placeholder:text-slate-400 dark:text-slate-500 focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-[#98c1d9] focus:ring-2 focus:ring-[#98c1d9]/20 transition"
            placeholder="Search name, MMSI, or type…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div ref={registerTarget("vesselList")} className="flex flex-col min-h-0">
      <div className="px-3 shrink-0">
        <CollapsibleHeader
          open={vesselListOpen}
          onToggle={() => setVesselListOpen((p) => !p)}
          label="Vessels"
          trailing={
            <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
              {filtered.length !== vessels.length
                ? `${filtered.length} / ${vessels.length}`
                : `${vessels.length}`}
            </span>
          }
        />
      </div>
      {vesselListOpen && (
        <>
          <div className="flex items-center justify-between px-5 py-2 text-xs font-medium text-slate-400 dark:text-slate-500 shrink-0">
            <button
              onClick={() => {
                setDraftFilters({ ...filters, type: new Set(filters.type) });
                setShowTypeFilter(true);
              }}
              className={`uppercase tracking-wide transition ${
                filters.type.size > 0 ||
                filters.source !== "all" ||
                filters.dfo !== "all"
                  ? "text-[#3d5a80]"
                  : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
              }`}
            >
              {(() => {
                const n =
                  filters.type.size +
                  (filters.source !== "all" ? 1 : 0) +
                  (filters.dfo !== "all" ? 1 : 0);
                return n > 0 ? `${n} filter${n > 1 ? "s" : ""}` : "Filter by…";
              })()}
            </button>
          </div>
          <div
            style={{ height: vesselListHeight }}
            className="px-2 min-h-0"
          >
          <Virtuoso
            style={{ height: "100%", overflowX: "hidden" }}
            data={filtered}
            components={{
              EmptyPlaceholder: () => (
                <p className="text-sm text-slate-400 dark:text-slate-500 p-6 text-center">
                  {vessels.length === 0 ? "Loading vessels…" : "No vessels match your search."}
                </p>
              ),
            }}
            itemContent={(_i, v) => {
          const type = classifyType(v.ship_type);
          const color = TYPE_COLORS[type] ?? TYPE_COLORS.unknown;
          const active = selected?.mmsi === v.mmsi;
          return (
            <button
              id={`vessel-item-${v.mmsi}`}
              onClick={() => {
                if (active) {
                  setSelected(null);
                  sourceRef.current.clear();
                  setPointCount(null);
                } else {
                  setSelected(v);
                  sourceRef.current.clear();
                  setPointCount(null);
                  loadRoute(v);
                }
              }}
              className={`w-full text-left px-3 py-2.5 rounded-sm mb-0.5 transition ${
                active ? "bg-slate-100 dark:bg-slate-800" : "hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              <div className={`font-inter text-xs truncate ${active ? "text-[#293241]" : "text-slate-600 dark:text-slate-300"}`}>
                {v.vessel_name || "Unknown vessel"}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-500 dark:text-slate-400 capitalize font-geologica">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                  {type}
                </span>
                <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">{v.mmsi}</span>
              </div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 tabular-nums">
                {active && pointCount !== null && pointTotal !== null && pointTotal > pointCount
                  ? `showing ${pointCount.toLocaleString()} / ${pointTotal.toLocaleString()} pts`
                  : `${v.point_count.toLocaleString()} pts in range`}
              </div>
            </button>
          );
        }}
          />
          </div>
          <div
            onMouseDown={onVesselListResizeMouseDown}
            className="h-1.5 mx-2 -my-0.5 rounded-full cursor-row-resize hover:bg-[#98c1d9]/40 active:bg-[#98c1d9]/60"
          />
        </>
      )}
      </div>
      <div className="border-t border-slate-100 dark:border-slate-800 mx-2 mt-2" />
      <div ref={registerTarget("vesselSize")} className="px-3 py-3 flex flex-col gap-1">
        {/* Vessel tracks sizing */}
        <SizeOpacityPanel
          open={vesselOpen}
          onToggle={() => setVesselOpen((p) => !p)}
          preview={
            <div className="flex items-center gap-1">
              {([SPEED_STYLE.fill.slow, SPEED_STYLE.fill.mid, SPEED_STYLE.fill.fast] as const).map((color) => (
                <div key={color} className="rounded-full" style={{ width: vesselSize * 2, height: vesselSize * 2, background: color, opacity: vesselOpacity }} />
              ))}
            </div>
          }
          size={vesselSize}
          onSizeChange={setVesselSize}
          sizeMin={2}
          sizeMax={14}
          opacity={vesselOpacity}
          onOpacityChange={setVesselOpacity}
        />
      </div>
    </>
  );
}

export default TracksPanel;

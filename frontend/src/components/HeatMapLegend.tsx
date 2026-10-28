// Colour scale of the region traffic heat map. The scale is set per run from
// the region's own traffic (analysis/plots.py), so the numbers change each time.
function HeatMapLegend({
  vmin,
  vmax,
  rightOffset,
  bottomOffset,
}: {
  vmin: number;
  vmax: number;
  // Keeps the legend clear of an open right-side panel, or of the feedback
  // and attribution buttons in the bottom-right corner when none is open.
  rightOffset: number;
  // Lifts the legend above the scale bar, which shows with the Impacts panel.
  bottomOffset: number;
}) {
  // Log scale: the middle of the bar is the geometric mean, not the average
  const mid = Math.sqrt(vmin * vmax);
  const fmt = (v: number) => (v < 10 ? v.toFixed(1) : Math.round(v).toString());

  return (
    <div
      style={{ right: rightOffset, bottom: bottomOffset }}
      className="absolute z-10 w-[108px] rounded-md border border-slate-200 dark:border-slate-700 bg-white/85 dark:bg-slate-900/85 px-[7px] py-[3px] shadow-sm font-inter transition-[right] duration-300 ease-in-out"
    >
      <div className="text-[9px] font-medium text-slate-600 dark:text-slate-300 mb-0.5">AIS pings per cell</div>
      <div className="heat-gradient-bar h-[5px] rounded-full w-full" />
      <div className="flex justify-between text-[9px] text-slate-500 dark:text-slate-400 tabular-nums">
        <span>{fmt(vmin)}</span>
        <span>{fmt(mid)}</span>
        <span>{fmt(vmax)}</span>
      </div>
    </div>
  );
}

export default HeatMapLegend;

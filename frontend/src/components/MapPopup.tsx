import type { ReactNode } from "react";

// The small card that appears next to the cursor when a vessel point or
// mooring is clicked -- positioned at the click pixel, with a title and a
// list of PopupRow label/value lines.
function MapPopup({
  x,
  y,
  title,
  children,
}: {
  x: number;
  y: number;
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className="absolute z-30 bg-white dark:bg-slate-900 ring-1 ring-slate-900/5 rounded-sm shadow-sm px-4 py-3 text-xs pointer-events-none animate-scale-in"
      style={{ left: x + 12, top: y - 8 }}
    >
      <div className="font-semibold text-[#3d5a80] mb-1.5">{title}</div>
      <div className="text-slate-600 dark:text-slate-300 space-y-1 tabular-nums">
        {children}
      </div>
    </div>
  );
}

export default MapPopup;

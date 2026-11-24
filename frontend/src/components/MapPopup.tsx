import type { ReactNode } from "react";

// The small card that appears next to the cursor when a vessel point or
// mooring is clicked -- positioned at the click pixel, with a title and a
// list of PopupRow label/value lines.
function MapPopup({
  x,
  y,
  title,
  selectable = false,
  children,
}: {
  x: number;
  y: number;
  title: ReactNode;
  // Takes the mouse so its text can be selected and copied. Otherwise
  // the mouse passes through to the map (a drag over it pans the map).
  selectable?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`absolute z-30 bg-white dark:bg-slate-900 ring-1 ring-slate-900/5 rounded-sm shadow-sm px-4 py-3 text-xs animate-scale-in ${
        selectable ? "select-text cursor-text" : "pointer-events-none"
      }`}
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

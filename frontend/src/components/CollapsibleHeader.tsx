import type { ReactNode } from "react";

// The "▶ label ... trailing preview" toggle button used at the top of every
// collapsible sub-section (Vessels list, the 3 "Change size" panels, Base
// map). Only the header row is shared -- each section's body differs too
// much (a virtualized list, size/opacity sliders, a radio list) to be
// worth forcing into one shared wrapper.
function CollapsibleHeader({
  open,
  onToggle,
  label,
  trailing,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  trailing?: ReactNode;
}) {
  return (
    <button onClick={onToggle} className="flex items-center gap-2 w-full py-1.5 text-left">
      <span className={`text-[9px] text-slate-400 dark:text-slate-500 transition-transform duration-150 ${open ? "rotate-90" : ""}`}>▶</span>
      <span className="text-xs text-slate-600 dark:text-slate-300 flex-1">{label}</span>
      {trailing}
    </button>
  );
}

export default CollapsibleHeader;

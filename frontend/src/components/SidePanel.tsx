import type { ReactNode } from "react";
import { useDragResize } from "../useDragResize";

export const PANEL_MIN_WIDTH = 240;
export const PANEL_MAX_WIDTH = 480;
export const PANEL_DEFAULT_WIDTH = 288;

function SidePanel({
  open,
  children,
  width,
  onWidthChange,
  innerRef,
  side = "right",
  offset = 0,
}: {
  open: boolean;
  children: ReactNode;
  width: number;
  onWidthChange: (width: number) => void;
  innerRef?: (el: HTMLDivElement | null) => void;
  side?: "left" | "right";
  // Extra px to push the panel in from its anchored edge -- e.g. the left
  // params panel sits past IconBar's own width instead of covering it.
  offset?: number;
}) {
  // Dragging the handle toward the panel's anchored edge has to *increase*
  // width -- for a right-anchored panel that's its left-edge handle moving
  // left (invert), for a left-anchored panel it's its right-edge handle
  // moving right (not inverted).
  const onHandleMouseDown = useDragResize({
    axis: "x",
    invert: side === "right",
    min: PANEL_MIN_WIDTH,
    max: PANEL_MAX_WIDTH,
    getStart: () => width,
    onChange: onWidthChange,
  });

  // `translate-x-full` alone is only 100% of the panel's *own* width --
  // it ignores `offset`, so a closed left panel's near edge lands exactly
  // at its anchored edge (flush against IconBar) instead of clearing past
  // it, leaving it sitting directly behind IconBar rather than off screen.
  // Computed inline (not a Tailwind class) so it can factor in the
  // dynamic offset via calc().
  const closedTransform =
    side === "right" ? `translateX(calc(100% + ${offset}px))` : `translateX(calc(-100% - ${offset}px))`;

  return (
    <div
      ref={innerRef}
      style={{ width, [side]: offset, transform: open ? "translateX(0)" : closedTransform }}
      className="absolute top-0 h-full bg-white dark:bg-slate-900 z-20 flex flex-col shadow-sm transition-transform duration-300 ease-in-out"
    >
      <div
        onMouseDown={onHandleMouseDown}
        className={`absolute ${side === "right" ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2"} top-0 h-full w-1.5 cursor-col-resize z-10 hover:bg-[#98c1d9]/40 active:bg-[#98c1d9]/60`}
      />
      {children}
    </div>
  );
}

export default SidePanel;

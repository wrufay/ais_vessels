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

  return (
    <div
      ref={innerRef}
      style={{ width, [side]: offset }}
      className={`absolute top-0 h-full bg-white dark:bg-slate-900 z-20 flex flex-col shadow-sm transition-transform duration-300 ease-in-out ${
        open ? "translate-x-0" : side === "right" ? "translate-x-full" : "-translate-x-full"
      }`}
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

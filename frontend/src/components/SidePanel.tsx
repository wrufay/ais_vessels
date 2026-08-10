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
}: {
  open: boolean;
  children: ReactNode;
  width: number;
  onWidthChange: (width: number) => void;
  innerRef?: (el: HTMLDivElement | null) => void;
}) {
  const onHandleMouseDown = useDragResize({
    axis: "x",
    invert: true,
    min: PANEL_MIN_WIDTH,
    max: PANEL_MAX_WIDTH,
    getStart: () => width,
    onChange: onWidthChange,
  });

  return (
    <div
      ref={innerRef}
      style={{ width }}
      className={`absolute right-0 top-0 h-full bg-white dark:bg-slate-900 z-20 flex flex-col shadow-sm transition-transform duration-300 ease-in-out ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div
        onMouseDown={onHandleMouseDown}
        className="absolute left-0 top-0 h-full w-1.5 -translate-x-1/2 cursor-col-resize z-10 hover:bg-[#98c1d9]/40 active:bg-[#98c1d9]/60"
      />
      {children}
    </div>
  );
}

export default SidePanel;

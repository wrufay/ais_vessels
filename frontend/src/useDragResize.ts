import { useRef } from "react";

interface UseDragResizeOptions {
  axis: "x" | "y";
  min: number;
  max: number;
  // True when dragging toward the panel's anchored edge should *increase*
  // the value -- e.g. SidePanel is anchored on the right, so dragging its
  // left-edge handle further left (decreasing clientX) has to increase width.
  invert?: boolean;
  // Reads the value to start the drag from. A function (not a plain value)
  // so callers whose state can start out null (e.g. a list height not yet
  // measured) can fall back to a DOM ref's current size.
  getStart: () => number;
  onChange: (value: number) => void;
}

// Shared mousedown -> mousemove -> mouseup drag-to-resize logic. Used by
// SidePanel's width handle and the vessel/region/mooring list height
// handles in Map.tsx -- each differs only in axis, clamp range, and where
// the dragged value comes from/goes to.
export function useDragResize({ axis, min, max, invert = false, getStart, onChange }: UseDragResizeOptions) {
  const dragRef = useRef<{ startPos: number; startValue: number } | null>(null);

  return function onMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    const startPos = axis === "x" ? e.clientX : e.clientY;
    dragRef.current = { startPos, startValue: getStart() };

    function onMouseMove(ev: MouseEvent) {
      if (!dragRef.current) return;
      const pos = axis === "x" ? ev.clientX : ev.clientY;
      const rawDelta = pos - dragRef.current.startPos;
      const delta = invert ? -rawDelta : rawDelta;
      const next = Math.min(max, Math.max(min, dragRef.current.startValue + delta));
      onChange(next);
    }
    function onMouseUp() {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };
}

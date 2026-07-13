import { useRef, type ReactNode } from "react";

export const PANEL_MIN_WIDTH = 240;
export const PANEL_MAX_WIDTH = 480;
export const PANEL_DEFAULT_WIDTH = 288;

function SidePanel({
  open,
  children,
  width,
  onWidthChange,
}: {
  open: boolean;
  children: ReactNode;
  width: number;
  onWidthChange: (width: number) => void;
}) {
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  function onHandleMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: width };

    function onMouseMove(ev: MouseEvent) {
      if (!dragRef.current) return;
      const delta = dragRef.current.startX - ev.clientX;
      const next = Math.min(
        PANEL_MAX_WIDTH,
        Math.max(PANEL_MIN_WIDTH, dragRef.current.startWidth + delta)
      );
      onWidthChange(next);
    }
    function onMouseUp() {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  return (
    <div
      style={{ width }}
      className={`absolute right-0 top-0 h-full bg-white z-20 flex flex-col shadow-sm transition-transform duration-300 ease-in-out ${
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

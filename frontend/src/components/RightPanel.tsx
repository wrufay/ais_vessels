import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 256;

function RightPanel({
  open,
  onClose,
  onOpen,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onOpen: () => void;
  children: ReactNode;
}) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [animate, setAnimate] = useState(true);
  const dragging = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth <= 10) {
        dragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        setWidth(DEFAULT_WIDTH);
        setAnimate(false);
        onClose();
        return;
      }
      setWidth(Math.min(MAX_WIDTH, newWidth));
    };
    const onMouseUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onClose]);

  return (
    <>
      {!open && (
        <button
          onClick={onOpen}
          className="fixed right-0 top-1/2 -translate-y-1/2 z-30 bg-white shadow-md rounded-l-md px-1 py-3 text-slate-400 hover:text-slate-600 transition"
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}
      <div
        style={{ width }}
        className={`absolute right-0 top-0 bottom-11 bg-white z-20 flex flex-col shadow-sm ${animate ? "transition-transform duration-300 ease-in-out" : ""} ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        onTransitionEnd={() => setAnimate(true)}
      >
        {/* Drag handle */}
        <div
          onMouseDown={onMouseDown}
          className="absolute left-0 top-0 h-full w-1 cursor-ew-resize hover:bg-slate-200 transition-colors"
        />
        {children}
      </div>
    </>
  );
}

export default RightPanel;

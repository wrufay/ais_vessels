import type { ReactNode } from "react";
import XIcon from "./XIcon";

function SidePanel({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className={`absolute right-0 top-0 h-full w-72 bg-white z-20 flex flex-col shadow-xl transition-transform duration-300 ease-in-out ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <button onClick={onClose} className="absolute top-3 right-3 text-slate-400">
        <XIcon />
      </button>
      {children}
    </div>
  );
}

export default SidePanel;

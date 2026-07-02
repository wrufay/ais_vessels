import type { ReactNode } from "react";

function SidePanel({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className={`absolute right-0 top-0 h-full w-72 bg-white z-20 flex flex-col shadow-sm transition-transform duration-300 ease-in-out ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      {children}
    </div>
  );
}

export default SidePanel;

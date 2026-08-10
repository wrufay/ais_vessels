import type { ReactNode } from "react";

// One "label   value" line inside a MapPopup card.
function PopupRow({
  label,
  labelWidth = "w-16",
  children,
}: {
  label: string;
  labelWidth?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <span className={`text-slate-400 dark:text-slate-500 inline-block ${labelWidth}`}>{label}</span>
      {children}
    </div>
  );
}

export default PopupRow;

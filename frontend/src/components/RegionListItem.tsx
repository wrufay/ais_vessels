import ClosePanelBtn from "./ClosePanelBtn";

function RegionListItem({
  label,
  dotColor,
  tagLabel,
  checked,
  highlighted,
  onClick,
  onRemove,
}: {
  label: string;
  dotColor: string;
  tagLabel: string;
  checked: boolean;
  highlighted: boolean;
  onClick: () => void;
  onRemove?: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-sm cursor-pointer transition ${
        highlighted ? "bg-slate-100" : "hover:bg-slate-50"
      }`}
      onClick={onClick}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onClick}
        onClick={(e) => e.stopPropagation()}
        className="accent-slate-600 w-3.5 h-3.5 shrink-0 cursor-pointer"
      />
      <div className={`min-w-0 ${onRemove ? "flex-1" : ""}`}>
        <div className={`text-sm font-inter text-slate-600 ${onRemove ? "truncate" : ""}`}>
          {label}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ background: dotColor }} />
          <span className="text-[11px] text-slate-400 font-geologica">{tagLabel}</span>
        </div>
      </div>
      {onRemove && (
        <ClosePanelBtn onClick={onRemove} displayType="cross" />
      )}
    </div>
  );
}

export default RegionListItem;

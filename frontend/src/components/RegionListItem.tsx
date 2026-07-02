import ClosePanelBtn from "./ClosePanelBtn";

function RegionListItem({
  label,
  dotColor,
  tagLabel,
  active,
  onClick,
  onRemove,
}: {
  label: string;
  dotColor: string;
  tagLabel: string;
  active: boolean;
  onClick: () => void;
  onRemove?: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className={`flex items-center ${onRemove ? "justify-between" : ""} gap-3 px-3 py-2.5 rounded-sm cursor-pointer transition ${
        active ? "bg-slate-100" : "hover:bg-slate-50"
      }`}
      onClick={onClick}
    >
      <div className={onRemove ? "flex-1 min-w-0" : ""}>
        <div className={`text-sm font-inter text-slate-600 ${onRemove ? "truncate" : ""}`}>
          {label}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: dotColor }} />
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

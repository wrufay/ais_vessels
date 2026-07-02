const dateInputClass =
  "bg-slate-50 border border-transparent rounded-sm px-3 py-2 text-sm focus:outline-none focus:bg-white focus:border-[#98c1d9] focus:ring-2 focus:ring-[#98c1d9]/20 transition";

function DateRangePicker({
  start,
  end,
  onStartChange,
  onEndChange,
  className = "mb-4",
}: {
  start: string;
  end: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={`grid grid-cols-2 gap-2 ${className}`}>
      <label className="flex flex-col gap-1">
        <span className="text-slate-400 text-xs font-medium font-geologica uppercase tracking-wide">
          Start
        </span>
        <input
          type="date"
          className={dateInputClass}
          value={start}
          onChange={(e) => onStartChange(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-slate-400 text-xs font-medium font-geologica uppercase tracking-wide">
          End
        </span>
        <input
          type="date"
          className={dateInputClass}
          value={end}
          onChange={(e) => onEndChange(e.target.value)}
        />
      </label>
    </div>
  );
}

export default DateRangePicker;

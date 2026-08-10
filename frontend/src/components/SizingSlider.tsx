// One "label + range slider + synced number input" row, used for the
// Size/Opacity controls in each "Change size" panel (vessel tracks, region
// dots, moorings). This component only handles the displayed number and its
// unit (e.g. 0-100 with "%") -- if the underlying value is stored
// differently (opacity is stored as 0-1, not 0-100), the caller converts on
// the way in and out via `value`/`onChange`.
function SizingSlider({
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-slate-400 dark:text-slate-500 w-14 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="panel-slider w-24"
      />
      <div className="flex items-center shrink-0">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value))))}
          className="w-7 text-[11px] text-slate-400 dark:text-slate-500 text-right bg-transparent border-b border-slate-200 dark:border-slate-700 outline-none tabular-nums"
        />
        <span className="text-[11px] text-slate-400 dark:text-slate-500">{unit}</span>
      </div>
    </div>
  );
}

export default SizingSlider;

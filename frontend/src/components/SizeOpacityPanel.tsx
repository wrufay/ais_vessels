import type { ReactNode } from "react";
import CollapsibleHeader from "./CollapsibleHeader";

// One "label + range slider + synced number input" row. Only used within
// SizeOpacityPanel below, for its Size/Opacity controls -- this component
// only handles the displayed number and its unit (e.g. 0-100 with "%"); if
// the underlying value is stored differently (opacity is stored as 0-1, not
// 0-100), the caller converts on the way in and out via `value`/`onChange`.
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

// The "Change size" collapsible section repeated for vessel tracks, region
// dots, and moorings: a header with a live preview, and Size/Opacity
// sliders underneath. Opacity is stored as 0-1 everywhere else in the app
// (that's what OpenLayers expects), so this takes/returns 0-1 and does the
// 0-100 display conversion internally rather than making each caller repeat it.
function SizeOpacityPanel({
  open,
  onToggle,
  preview,
  size,
  onSizeChange,
  sizeMin,
  sizeMax,
  opacity,
  onOpacityChange,
}: {
  open: boolean;
  onToggle: () => void;
  preview: ReactNode;
  size: number;
  onSizeChange: (value: number) => void;
  sizeMin: number;
  sizeMax: number;
  opacity: number;
  onOpacityChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col">
      <CollapsibleHeader open={open} onToggle={onToggle} label="Change size" trailing={preview} />
      {open && (
        <div className="pl-4 pr-1 flex flex-col gap-2 pb-1">
          <SizingSlider label="Size" value={size} min={sizeMin} max={sizeMax} unit="px" onChange={onSizeChange} />
          <SizingSlider label="Opacity" value={Math.round(opacity * 100)} min={0} max={100} unit="%" onChange={(v) => onOpacityChange(v / 100)} />
        </div>
      )}
    </div>
  );
}

export default SizeOpacityPanel;

import type { ReactNode } from "react";

function SizingSlider({
  label,
  value,
  min = 2,
  max = 10,
  onChange,
  preview,
  accent = "accent-[#3d5a80]",
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
  preview: ReactNode;
  accent?: string;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-slate-400 font-fraunces">{label}</span>
        <div className="flex items-center gap-2">
          {preview}
          <span className="text-xs text-slate-400 tabular-nums">{value}px</span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-full cursor-pointer ${accent}`}
      />
    </div>
  );
}

export default SizingSlider;

import type { ReactNode } from "react";
import CollapsibleHeader from "./CollapsibleHeader";
import SizingSlider from "./SizingSlider";

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

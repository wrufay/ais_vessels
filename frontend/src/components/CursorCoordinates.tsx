const boxClass =
  "bg-[#fcfffd]/60 dark:bg-slate-900/60 rounded-sm px-1.5 py-0.5 text-xs text-slate-600 dark:text-slate-300 font-inter";

function CursorCoordinates({
  lat,
  lon,
  leftOffset,
  zoneLabels = [],
}: {
  lat: number | null;
  lon: number | null;
  // IconBar is a permanent full-height left sidebar and the noise-impact
  // params panel can extend past it -- without this the readout sits at
  // literal x=0 and ends up hidden underneath both. Animated so it slides
  // along with the params panel's own open/close transition.
  leftOffset: number;
  // Noise-impact zone(s) under the cursor, one line each, shown in their
  // own box above the lat/lon (so the lat/lon never moves when it comes
  // and goes). More than one only when zones have the same shape.
  zoneLabels?: string[];
}) {
  if (lat === null || lon === null) return null;

  return (
    <div
      style={{ left: leftOffset }}
      className="absolute bottom-0 z-10 flex flex-col items-start gap-[3px] pointer-events-none transition-[left] duration-300 ease-in-out"
    >
      {zoneLabels.length > 0 && (
        <div className={`${boxClass} whitespace-nowrap`}>
          {zoneLabels.map((label, i) => (
            <div key={i}>{label}</div>
          ))}
        </div>
      )}
      <div className={boxClass}>
        {lat.toFixed(4)}°, {lon.toFixed(4)}°
      </div>
    </div>
  );
}

export default CursorCoordinates;

function CursorCoordinates({
  lat,
  lon,
  leftOffset,
}: {
  lat: number | null;
  lon: number | null;
  // IconBar is a permanent full-height left sidebar and the noise-impact
  // params panel can extend past it -- without this the readout sits at
  // literal x=0 and ends up hidden underneath both. Animated so it slides
  // along with the params panel's own open/close transition.
  leftOffset: number;
}) {
  if (lat === null || lon === null) return null;

  return (
    <div
      style={{ left: leftOffset }}
      className="absolute bottom-0 z-10 bg-[#fcfffd]/60 dark:bg-slate-900/60 rounded-sm px-1.5 py-0.5 text-xs text-slate-600 dark:text-slate-300 font-inter transition-[left] duration-300 ease-in-out"
    >
      {lat.toFixed(4)}°, {lon.toFixed(4)}°
    </div>
  );
}

export default CursorCoordinates;

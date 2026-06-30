function CursorCoordinates({
  lat,
  lon,
}: {
  lat: number | null;
  lon: number | null;
}) {
  if (lat === null || lon === null) return null;

  return (
    <div className="absolute bottom-5 left-5 z-10 bg-white/90 backdrop-blur-md rounded-sm shadow-lg shadow-slate-900/5 ring-1 ring-slate-900/5 px-3 py-1.5 text-xs text-slate-600 font-mono">
      {lat.toFixed(4)}°, {lon.toFixed(4)}°
    </div>
  );
}

export default CursorCoordinates;

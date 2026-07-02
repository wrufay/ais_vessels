function CursorCoordinates({
  lat,
  lon,
}: {
  lat: number | null;
  lon: number | null;
}) {
  if (lat === null || lon === null) return null;

  return (
    <div className="absolute top-2 left-10 z-10 bg-white/90 backdrop-blur-md rounded-sm px-1.5 py-0.5 text-xs text-slate-600 font-inter">
      {lat.toFixed(4)}°, {lon.toFixed(4)}°
    </div>
  );
}

export default CursorCoordinates;

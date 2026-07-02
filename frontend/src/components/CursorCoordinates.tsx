function CursorCoordinates({
  lat,
  lon,
}: {
  lat: number | null;
  lon: number | null;
}) {
  if (lat === null || lon === null) return null;

  return (
    <div className="absolute bottom-0 left-0 z-10 bg-[#fcfffd]/60 rounded-sm px-1.5 py-0.5 text-xs text-gray-600 font-inter">
      {lat.toFixed(4)}°, {lon.toFixed(4)}°
    </div>
  );
}

export default CursorCoordinates;

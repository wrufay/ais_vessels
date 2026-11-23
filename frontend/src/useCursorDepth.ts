import { useCallback, useRef, useState } from "react";

const API = import.meta.env.VITE_API_URL ?? "";

// Ask only once the mouse rests this long, so moving across the map doesn't
// send a request per pixel.
const PAUSE_MS = 150;

// Area covered by the bathymetry files (W, S, E, N); see
// analysis/bathymetry.py. Outside it the answer is always "no depth".
const DEPTH_BBOX = [-71, 40, -42, 61.2];

// Owns the water depth under the cursor for CursorCoordinates. Map.tsx's
// pointermove handler calls cursorMoved; the depth clears while moving and
// comes back after a short pause (a stale depth from the last spot would be
// wrong for the new one). null = moving, over land, or outside the data.
export function useCursorDepth() {
  const [depth, setDepth] = useState<number | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const requestRef = useRef<AbortController | null>(null);

  const cursorMoved = useCallback((lat: number, lon: number) => {
    window.clearTimeout(timerRef.current);
    requestRef.current?.abort();
    setDepth(null);
    const [w, s, e, n] = DEPTH_BBOX;
    if (lon < w || lon > e || lat < s || lat > n) return;
    timerRef.current = window.setTimeout(() => {
      const request = new AbortController();
      requestRef.current = request;
      fetch(`${API}/api/depth?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`, { signal: request.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => setDepth(j?.depth_m ?? null))
        .catch(() => {});
    }, PAUSE_MS);
  }, []);

  return { depth, cursorMoved };
}

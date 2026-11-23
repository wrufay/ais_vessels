import { useCallback, useRef, useState } from "react";

const API = import.meta.env.VITE_API_URL ?? "";

// While the mouse moves, ask at most this often (one request at a time), so
// the depth follows the cursor without a request per pixel.
const MIN_GAP_MS = 100;

// Area covered by the bathymetry files (W, S, E, N); see
// analysis/bathymetry.py. Outside it the answer is always "no depth".
const DEPTH_BBOX = [-71, 40, -42, 61.2];

// Owns the water depth under the cursor for CursorCoordinates. Map.tsx's
// pointermove handler calls cursorMoved. The last depth stays shown until the
// answer for a newer spot arrives, so while moving fast it can trail the
// cursor slightly; once a request finishes, the latest spot is always asked
// next, so it settles on the right value. null = over land or outside the data.
export function useCursorDepth() {
  const [depth, setDepth] = useState<number | null>(null);
  const wantedRef = useRef<{ lat: number; lon: number } | null>(null); // latest spot not asked about yet
  const busyRef = useRef(false);
  const lastSentRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);
  // Bumped when the cursor leaves the data area, so an answer still on its
  // way for a spot inside it doesn't show up afterwards.
  const epochRef = useRef(0);

  const ask = useCallback(() => {
    const spot = wantedRef.current;
    if (!spot || busyRef.current) return;
    const wait = lastSentRef.current + MIN_GAP_MS - Date.now();
    if (wait > 0) {
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(ask, wait);
      return;
    }
    wantedRef.current = null;
    busyRef.current = true;
    lastSentRef.current = Date.now();
    const epoch = epochRef.current;
    fetch(`${API}/api/depth?lat=${spot.lat.toFixed(4)}&lon=${spot.lon.toFixed(4)}`, { signal: AbortSignal.timeout(5000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (epoch === epochRef.current) setDepth(j?.depth_m ?? null); })
      .catch(() => {})
      .finally(() => {
        busyRef.current = false;
        ask();
      });
  }, []);

  const cursorMoved = useCallback((lat: number, lon: number) => {
    const [w, s, e, n] = DEPTH_BBOX;
    if (lon < w || lon > e || lat < s || lat > n) {
      wantedRef.current = null;
      window.clearTimeout(timerRef.current);
      epochRef.current += 1;
      setDepth(null);
      return;
    }
    wantedRef.current = { lat, lon };
    ask();
  }, [ask]);

  return { depth, cursorMoved };
}

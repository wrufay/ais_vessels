import { useEffect, useRef, useState } from "react";
import type ImageLayer from "ol/layer/Image";
import ImageStatic from "ol/source/ImageStatic";
import { fromLonLat } from "ol/proj";

// Fixed geographic bounds of the noise raster overlay -- was previously
// computed twice independently (once for the initial layer, once inside the
// effect that rebuilds its source), which is the exact kind of duplication
// that risks drifting if only one copy gets updated.
export const NOISE_EXTENT = [
  ...fromLonLat([-69.5, 41.0]),
  ...fromLonLat([-59.0, 46.0]),
] as [number, number, number, number];

// wind_noise has no depth dimension -- its GeoTIFFs only exist as one
// `_d10` folder per freq, which is what every wind request asks for.
const NO_DEPTH_VARIABLES = new Set(["wind_noise"]);
export const variableHasDepth = (variable: string) => !NO_DEPTH_VARIABLES.has(variable);

// Owns all state and side effects for the ocean noise raster overlay --
// which variable/date/freq/depth is showing, its opacity, the fetched
// list of available combinations, and rebuilding the layer's image source
// whenever any of those change. Pulled out of Map.tsx because it's large
// (12 state values, several effects) but fully self-contained: nothing
// outside noise-related UI reads or writes any of it except noiseLayerRef,
// which the map-init effect still needs to build the actual OpenLayers
// layer and include it in the map's layer list.
export function useNoiseLayer(apiBase: string) {
  const noiseLayerRef = useRef<ImageLayer<ImageStatic> | null>(null);
  // Map.tsx assigns noiseLayerRef.current in its own map-init effect, which
  // runs AFTER this hook's effects on first mount (registered later in the
  // same render) -- so the overlay-building effect below would otherwise
  // hit its `if (!noiseLayerRef.current) return` on the one and only time
  // its other dependencies start out already valid, and never get a second
  // chance to build the real overlay. A plain ref mutation doesn't trigger
  // a re-run on its own; this state flag (flipped by Map.tsx right after
  // assigning the ref) does.
  const [noiseLayerReady, setNoiseLayerReady] = useState(false);
  const [showNoise, setShowNoise] = useState(false);
  const [noiseOpacity, setNoiseOpacity] = useState(0.5);
  const [noiseLoading, setNoiseLoading] = useState(false);
  const [noiseVariable, setNoiseVariableState] = useState("combined_noise");
  const [noiseDate, setNoiseDate] = useState("2020-02");
  const [noiseFreq, setNoiseFreq] = useState(50);
  const [noiseDepth, setNoiseDepth] = useState(10);
  const [noiseRange, setNoiseRange] = useState<{ vmin: number; vmax: number; depth: number } | null>(null);
  const [noiseVminOverride, setNoiseVminOverride] = useState<number | "" | null>(null);
  const [noiseVmaxOverride, setNoiseVmaxOverride] = useState<number | "" | null>(null);
  const [noiseAvailable, setNoiseAvailable] = useState<Record<string, { freq: number; depth: number }[]>>({});
  const [noiseDates, setNoiseDates] = useState<string[]>([]);

  // Variables have very different dB ranges, so a scale typed in for one
  // would be meaningless for the next -- go back to auto on every switch.
  const setNoiseVariable = (variable: string) => {
    setNoiseVariableState(variable);
    setNoiseVminOverride(null);
    setNoiseVmaxOverride(null);
  };
  // Depth sent to the API. noiseDepth itself is left alone for depthless
  // variables, so switching to wind and back keeps the user's depth.
  const requestDepth = variableHasDepth(noiseVariable)
    ? noiseDepth
    : (noiseAvailable[noiseVariable]?.[0]?.depth ?? 10);

  useEffect(() => {
    noiseLayerRef.current?.setVisible(showNoise);
  }, [showNoise]);

  useEffect(() => {
    fetch(`${apiBase}/api/noise/available`)
      .then((r) => r.json())
      .then(setNoiseAvailable)
      .catch(() => {});
  }, [apiBase]);

  useEffect(() => {
    const options = noiseAvailable[noiseVariable];
    if (!options || options.length === 0) return;
    const freqs = [...new Set(options.map((o) => o.freq))].sort((a, b) => a - b);
    if (!freqs.includes(noiseFreq)) setNoiseFreq(freqs[0]);
    if (!variableHasDepth(noiseVariable)) return;
    const depths = [...new Set(options.filter((o) => o.freq === (freqs.includes(noiseFreq) ? noiseFreq : freqs[0])).map((o) => o.depth))].sort((a, b) => a - b);
    if (!depths.includes(noiseDepth)) setNoiseDepth(depths[0]);
  }, [noiseVariable, noiseAvailable]);

  useEffect(() => {
    // ignore a reply that lands after the user has already moved on
    let stale = false;
    fetch(`${apiBase}/api/noise/dates?variable=${noiseVariable}&freq=${noiseFreq}&depth=${requestDepth}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((dates: string[]) => {
        if (stale) return;
        setNoiseDates(dates);
        if (dates.length > 0 && !dates.includes(noiseDate)) setNoiseDate(dates[dates.length - 1]);
      })
      .catch(() => {});
    return () => { stale = true; };
  }, [noiseVariable, noiseFreq, requestDepth]);

  useEffect(() => {
    if (!noiseLayerRef.current) return;
    let url = `${apiBase}/api/noise/overlay?date=${noiseDate}&variable=${noiseVariable}&freq=${noiseFreq}&depth=${requestDepth}`;
    if (noiseVminOverride !== null && noiseVminOverride !== "") url += `&vmin=${noiseVminOverride}`;
    if (noiseVmaxOverride !== null && noiseVmaxOverride !== "") url += `&vmax=${noiseVmaxOverride}`;
    const newSource = new ImageStatic({ url, imageExtent: NOISE_EXTENT, projection: "EPSG:3857" });
    newSource.on("imageloadstart", () => setNoiseLoading(true));
    newSource.on(["imageloadend", "imageloaderror"], () => setNoiseLoading(false));
    noiseLayerRef.current.setSource(newSource);

    let stale = false;
    fetch(`${apiBase}/api/noise/range?date=${noiseDate}&variable=${noiseVariable}&freq=${noiseFreq}&depth=${requestDepth}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!stale) setNoiseRange(data); })
      .catch(() => { if (!stale) setNoiseRange(null); });
    return () => { stale = true; };
  }, [noiseDate, noiseVariable, noiseFreq, requestDepth, noiseVminOverride, noiseVmaxOverride, noiseLayerReady]);

  useEffect(() => {
    noiseLayerRef.current?.setOpacity(noiseOpacity);
  }, [noiseOpacity]);

  return {
    noiseLayerRef,
    setNoiseLayerReady,
    showNoise, setShowNoise,
    noiseOpacity, setNoiseOpacity,
    noiseLoading, setNoiseLoading,
    noiseVariable, setNoiseVariable,
    noiseDate, setNoiseDate,
    noiseFreq, setNoiseFreq,
    noiseDepth, setNoiseDepth,
    noiseRange,
    noiseVminOverride, setNoiseVminOverride,
    noiseVmaxOverride, setNoiseVmaxOverride,
    noiseAvailable,
    noiseDates,
  };
}

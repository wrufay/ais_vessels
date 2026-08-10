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
  const [showNoise, setShowNoise] = useState(false);
  const [noiseOpacity, setNoiseOpacity] = useState(0.5);
  const [noiseLoading, setNoiseLoading] = useState(false);
  const [noiseVariable, setNoiseVariable] = useState("combined_noise");
  const [noiseDate, setNoiseDate] = useState("2020-02");
  const [noiseFreq, setNoiseFreq] = useState(50);
  const [noiseDepth, setNoiseDepth] = useState(10);
  const [noiseRange, setNoiseRange] = useState<{ vmin: number; vmax: number; depth: number } | null>(null);
  const [noiseVminOverride, setNoiseVminOverride] = useState<number | "" | null>(null);
  const [noiseVmaxOverride, setNoiseVmaxOverride] = useState<number | "" | null>(null);
  const [noiseAvailable, setNoiseAvailable] = useState<Record<string, { freq: number; depth: number }[]>>({});
  const [noiseDates, setNoiseDates] = useState<string[]>([]);

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
    const depths = [...new Set(options.filter((o) => o.freq === (freqs.includes(noiseFreq) ? noiseFreq : freqs[0])).map((o) => o.depth))].sort((a, b) => a - b);
    if (!depths.includes(noiseDepth)) setNoiseDepth(depths[0]);
  }, [noiseVariable, noiseAvailable]);

  useEffect(() => {
    fetch(`${apiBase}/api/noise/dates?variable=${noiseVariable}&freq=${noiseFreq}&depth=${noiseDepth}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((dates: string[]) => {
        setNoiseDates(dates);
        if (dates.length > 0 && !dates.includes(noiseDate)) setNoiseDate(dates[dates.length - 1]);
      })
      .catch(() => {});
  }, [noiseVariable, noiseFreq, noiseDepth]);

  useEffect(() => {
    if (!noiseLayerRef.current) return;
    let url = `${apiBase}/api/noise/overlay?date=${noiseDate}&variable=${noiseVariable}&freq=${noiseFreq}&depth=${noiseDepth}`;
    if (noiseVminOverride !== null && noiseVminOverride !== "") url += `&vmin=${noiseVminOverride}`;
    if (noiseVmaxOverride !== null && noiseVmaxOverride !== "") url += `&vmax=${noiseVmaxOverride}`;
    const newSource = new ImageStatic({ url, imageExtent: NOISE_EXTENT, projection: "EPSG:3857" });
    newSource.on("imageloadstart", () => setNoiseLoading(true));
    newSource.on(["imageloadend", "imageloaderror"], () => setNoiseLoading(false));
    noiseLayerRef.current.setSource(newSource);

    fetch(`${apiBase}/api/noise/range?date=${noiseDate}&variable=${noiseVariable}&freq=${noiseFreq}&depth=${noiseDepth}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setNoiseRange(data))
      .catch(() => setNoiseRange(null));
  }, [noiseDate, noiseVariable, noiseFreq, noiseDepth, noiseVminOverride, noiseVmaxOverride]);

  useEffect(() => {
    noiseLayerRef.current?.setOpacity(noiseOpacity);
  }, [noiseOpacity]);

  return {
    noiseLayerRef,
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

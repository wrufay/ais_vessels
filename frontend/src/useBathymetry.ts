import { useEffect, useRef, useState } from "react";
import type TileLayer from "ol/layer/Tile";

// Owns on/off, opacity, and loading state for the DFO seabed-depth WMS
// overlay, and syncs the first two onto the already-built layer via
// bathyLayerRef. Same split as useNoiseLayer: the actual TileLayer/TileWMS
// (with its EPSG:4326 tile grid) is built once inside Map.tsx's map-init
// effect, which also wires the tileloadstart/tileloadend listeners straight
// to setBathyLoading from here -- this hook only owns the reactive part
// (visibility/opacity) that runs whenever the state changes afterward.
export function useBathymetry() {
  const bathyLayerRef = useRef<TileLayer | null>(null);
  const [showBathymetry, setShowBathymetry] = useState(false);
  const [bathyOpacity, setBathyOpacity] = useState(0.75);
  const [bathyLoading, setBathyLoading] = useState(false);

  useEffect(() => {
    bathyLayerRef.current?.setVisible(showBathymetry);
  }, [showBathymetry]);

  useEffect(() => {
    bathyLayerRef.current?.setOpacity(bathyOpacity);
  }, [bathyOpacity]);

  return {
    bathyLayerRef,
    showBathymetry, setShowBathymetry,
    bathyOpacity, setBathyOpacity,
    bathyLoading, setBathyLoading,
  };
}

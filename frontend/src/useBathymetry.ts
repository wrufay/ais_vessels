import { useEffect, useRef, useState } from "react";
import type TileLayer from "ol/layer/Tile";

// Owns on/off, opacity, and loading state for the DFO seabed-depth WMS
// overlay, and syncs the first two onto the already-built layer via
// bathyLayerRef. Same split as useNoiseLayer: the actual TileLayer/TileWMS
// (with its EPSG:4326 tile grid) is built once inside Map.tsx's map-init
// effect, which also wires the tileloadstart/tileloadend listeners straight
// to setBathyLoading from here -- this hook only owns the reactive part
// (visibility/opacity) that runs whenever the state changes afterward.
//
// The layer itself is left visible:true permanently (see Map.tsx) so tiles
// for whatever's in view start preloading the moment the map mounts, rather
// than only starting once the user first flips this on. That means on/off
// has to be driven through opacity here (0 when off), not setVisible --
// setVisible(false) would stop the preloading it's there for.
export function useBathymetry() {
  const bathyLayerRef = useRef<TileLayer | null>(null);
  const [showBathymetry, setShowBathymetry] = useState(false);
  const [bathyOpacity, setBathyOpacity] = useState(0.75);
  const [bathyLoading, setBathyLoading] = useState(false);

  useEffect(() => {
    bathyLayerRef.current?.setOpacity(showBathymetry ? bathyOpacity : 0);
  }, [showBathymetry, bathyOpacity]);

  return {
    bathyLayerRef,
    showBathymetry, setShowBathymetry,
    bathyOpacity, setBathyOpacity,
    bathyLoading, setBathyLoading,
  };
}

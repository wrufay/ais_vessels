import { useRef } from "react";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import LineString from "ol/geom/LineString";
import { getLength } from "ol/sphere";
import VectorSource from "ol/source/Vector";
import { Style, Stroke, Fill, Text } from "ol/style";
import { useStateRef } from "./useStateRef";

// Owns state/refs for the click-click distance measuring tool, plus the
// click/pointermove handling logic for it. Unlike useNoiseLayer/
// useBathymetry, this isn't a standalone effect -- the map's shared click
// and pointermove handlers in Map.tsx already branch on other concerns
// (CHA regions, vessel/mooring points), so this hook only owns the
// measuring-specific handler bodies; Map.tsx still calls them from inside
// its `if (measuringRef.current) { ...; return; }` branches, same as
// before extraction. The VectorLayer that renders measureSourceRef also
// stays defined in Map.tsx's map-init effect, same split as the noise/
// bathymetry layers.
export function useMeasureTool() {
  const measureSourceRef = useRef(new VectorSource());
  const measureStartRef = useRef<number[] | null>(null);
  const measureLineFeatureRef = useRef<Feature | null>(null);
  const [measuring, setMeasuring, measuringRef] = useStateRef(false, (m) => {
    if (!m) {
      measureStartRef.current = null;
      measureLineFeatureRef.current = null;
      measureSourceRef.current.clear();
    }
  });

  function handleMeasureClick(coordinate: number[]) {
    if (!measureStartRef.current) {
      measureSourceRef.current.clear();
      measureStartRef.current = coordinate;
      const dot = new Feature({ geometry: new Point(coordinate) });
      measureSourceRef.current.addFeature(dot);
      const line = new Feature({ geometry: new LineString([coordinate, coordinate]) });
      measureSourceRef.current.addFeature(line);
      measureLineFeatureRef.current = line;
      return;
    }

    const line = measureLineFeatureRef.current;
    const start = measureStartRef.current;
    if (line && start) {
      const lineGeom = line.getGeometry() as LineString;
      lineGeom.setCoordinates([start, coordinate]);
      const metres = getLength(lineGeom, { projection: "EPSG:3857" });
      const label = metres >= 1000
        ? `${(metres / 1000).toFixed(2)} km`
        : `${Math.round(metres)} m`;
      const mid = [(start[0] + coordinate[0]) / 2, (start[1] + coordinate[1]) / 2];
      const labelFeature = new Feature({ geometry: new Point(mid) });
      labelFeature.setStyle(new Style({
        text: new Text({
          text: label,
          font: "bold 11px Inter, sans-serif",
          fill: new Fill({ color: "#fff" }),
          backgroundFill: new Fill({ color: "rgba(41,50,65,0.85)" }),
          backgroundStroke: new Stroke({ color: "rgba(41,50,65,0.9)", width: 1 }),
          padding: [3, 5, 3, 5],
          offsetY: -14,
        }),
      }));
      measureSourceRef.current.addFeature(labelFeature);
    }
    measureSourceRef.current.addFeature(new Feature({ geometry: new Point(coordinate) }));
    measureStartRef.current = null;
    measureLineFeatureRef.current = null;
  }

  function handleMeasurePointerMove(coordinate: number[]) {
    if (measureStartRef.current && measureLineFeatureRef.current) {
      (measureLineFeatureRef.current.getGeometry() as LineString).setCoordinates([
        measureStartRef.current,
        coordinate,
      ]);
    }
  }

  return {
    measureSourceRef,
    measuring, setMeasuring, measuringRef,
    handleMeasureClick,
    handleMeasurePointerMove,
  };
}

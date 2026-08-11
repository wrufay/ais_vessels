import { useCallback, useMemo, useRef, useState, type RefObject } from "react";
import { createTourSteps } from "./tour/steps";

// Guided tour — generic key -> DOM element registry. Steps (see tour/steps.tsx)
// reference elements by key; registerTarget/getTourTarget are how any element
// anywhere in Map.tsx's tree (icon bar or side panels) opts in as a tour
// target, by doing `ref={registerTarget("someKey")}`.
//
// Two targets (mooringList/regionList) reuse refs owned by the list-resize
// logic in Map.tsx instead of getting a second ref on the same element --
// those two refs, and the panel-opening callbacks tourSteps needs, are the
// only things this hook takes as params; everything else is self-contained.
export function useTour({
  mooringListElRef,
  regionListElRef,
  openVesselPanel,
  openMooringPanel,
  openRegionPanel,
  openMapPanel,
}: {
  mooringListElRef: RefObject<HTMLDivElement | null>;
  regionListElRef: RefObject<HTMLDivElement | null>;
  openVesselPanel: () => void;
  openMooringPanel: () => void;
  openRegionPanel: () => void;
  openMapPanel: () => void;
}) {
  const [tourActive, setTourActive] = useState(false);
  const tourTargetsRef = useRef<Record<string, HTMLElement | null>>({});

  const registerTarget = useCallback(
    (key: string) => (el: HTMLElement | null) => {
      tourTargetsRef.current[key] = el;
    },
    []
  );

  const getTourTarget = useCallback((key: string): HTMLElement | null => {
    if (key === "mooringList") return mooringListElRef.current;
    if (key === "regionList") return regionListElRef.current;
    return tourTargetsRef.current[key] ?? null;
  }, [mooringListElRef, regionListElRef]);

  const tourSteps = useMemo(
    () =>
      createTourSteps({
        openVesselPanel,
        openMooringPanel,
        openRegionPanel,
        openMapPanel,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return { tourActive, setTourActive, registerTarget, getTourTarget, tourSteps };
}

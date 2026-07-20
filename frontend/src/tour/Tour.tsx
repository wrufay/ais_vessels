import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { TourStep } from "./types";
import TourOverlay from "./TourOverlay";
import TourCallout from "./TourCallout";

// SidePanel slides in over 300ms (see SidePanel.tsx's duration-300) — re-measure
// the target once that settles, in case a step's onEnter opened a panel.
const REPOSITION_DELAY_MS = 320;

function Tour({
  active,
  steps,
  getTarget,
  onClose,
}: {
  active: boolean;
  steps: TourStep[];
  getTarget: (key: string) => HTMLElement | null;
  onClose: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[stepIndex];

  const goTo = useCallback(
    (i: number) => setStepIndex(Math.min(steps.length - 1, Math.max(0, i))),
    [steps.length]
  );

  useEffect(() => {
    if (active) setStepIndex(0);
  }, [active]);

  useEffect(() => {
    if (!active || !step) return;
    step.onEnter?.();
    const measure = () => {
      const el = step.target ? getTarget(step.target) : null;
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    const t = setTimeout(measure, REPOSITION_DELAY_MS);
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
    };
    // step is looked up fresh from steps/stepIndex each run; no need to list it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIndex, getTarget]);

  useEffect(() => {
    if (!active) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") goTo(stepIndex + 1);
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") goTo(stepIndex - 1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, stepIndex, goTo, onClose]);

  if (!active || !step) return null;

  return createPortal(
    <>
      {step.dim !== false && <TourOverlay rect={rect} />}
      <TourCallout
        key={step.id}
        rect={rect}
        title={step.title}
        body={step.body}
        stepIndex={stepIndex}
        totalSteps={steps.length}
        onBack={() => goTo(stepIndex - 1)}
        onNext={() => (stepIndex === steps.length - 1 ? onClose() : goTo(stepIndex + 1))}
        onClose={onClose}
        onDotClick={goTo}
      />
    </>,
    document.body
  );
}

export default Tour;

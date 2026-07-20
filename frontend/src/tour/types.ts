import type { ReactNode } from "react";

export interface TourStep {
  /** Stable key, also used as the React key so callout re-mounts (and re-animates) per step. */
  id: string;
  /** Key resolved via the target registry (see Tour's getTarget prop) to the DOM element to spotlight. Null = centered, no spotlight (e.g. the intro step). */
  target: string | null;
  title: string;
  body: ReactNode;
  /** Side effect to run when this step becomes active — e.g. opening the panel it lives in. */
  onEnter?: () => void;
}

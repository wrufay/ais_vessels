import { useState } from "react";

// Owns state for the noise-impact feature: the "Impacts" side panel, its
// parameter-input modal, and a fake "running" state for the Run button
// (first pass -- there's no real model wired up yet, see handleRun). The
// modal itself is just titled card shells right now (no parameters defined
// yet), so there's no parameter state to own here either -- add it back
// once Scenario/Pile driving/Species actually have fields.
export function useNoiseImpact() {
  const [showImpactsPanel, setShowImpactsPanel] = useState(false);
  const [showParamsModal, setShowParamsModal] = useState(false);

  const [running, setRunning] = useState(false);
  function handleRun() {
    // Nothing actually runs yet -- this just simulates a brief loading
    // state so the button/interaction can be reviewed before the real
    // model call is wired up.
    setRunning(true);
    setTimeout(() => setRunning(false), 1200);
  }

  return {
    showImpactsPanel, setShowImpactsPanel,
    showParamsModal, setShowParamsModal,
    running, handleRun,
  };
}

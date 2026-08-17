import ClosePanelBtn from "./ClosePanelBtn";

const CARD_TITLES = ["Scenario", "Pile driving", "Species"] as const;

const runIcon = (
  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="6,4 20,12 6,20" />
  </svg>
);

// The noise-impact parameter modal -- Scenario / Pile driving / Species,
// laid out as three cards side by side (stacking on narrow screens) per the
// "scroll, not tabs or a step wizard" call. First pass: just the titled
// card shells at a fixed height, no fields yet -- there's nothing defined
// to put in them. Run doesn't call a real model either, it just simulates
// a brief loading state (see useNoiseImpact's handleRun).
function NoiseImpactModal({
  running,
  onRun,
  onClose,
}: {
  running: boolean;
  onRun: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-lg shadow-sm w-full max-w-4xl max-h-[85vh] flex flex-col animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-7 pt-6 pb-5 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div>
            <h2 className="text-xl font-inter font-semibold text-slate-800 dark:text-slate-100">
              Parameter input
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Please select the following:</p>
          </div>
          <ClosePanelBtn onClick={onClose} displayType="cross" />
        </div>

        <div className="overflow-y-auto px-7 py-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {CARD_TITLES.map((title) => (
              <div
                key={title}
                className="h-64 shrink-0 border border-slate-200 dark:border-slate-700 rounded-lg p-4"
              >
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end px-7 py-5 border-t border-slate-100 dark:border-slate-800 shrink-0">
          <button
            onClick={onRun}
            disabled={running}
            className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#3d5a80] text-white text-sm font-medium hover:bg-[#293241] transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {running ? (
              <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              runIcon
            )}
            {running ? "Running…" : "Run"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default NoiseImpactModal;

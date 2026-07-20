import type { ReactNode } from "react";

const WIDTH = 288;
const MARGIN = 12;

function calloutStyle(rect: DOMRect | null): React.CSSProperties {
  if (!rect) {
    return {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: WIDTH,
    };
  }
  const spaceBelow = window.innerHeight - rect.bottom;
  const top =
    spaceBelow > 220 ? rect.bottom + MARGIN : Math.max(MARGIN, rect.top - MARGIN - 220);
  const left = Math.min(
    Math.max(MARGIN, rect.left + rect.width / 2 - WIDTH / 2),
    window.innerWidth - WIDTH - MARGIN
  );
  return { position: "fixed", top, left, width: WIDTH };
}

function TourCallout({
  rect,
  title,
  body,
  stepIndex,
  totalSteps,
  onNext,
  onBack,
  onClose,
  onDotClick,
}: {
  rect: DOMRect | null;
  title: string;
  body: ReactNode;
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onBack: () => void;
  onClose: () => void;
  onDotClick: (index: number) => void;
}) {
  return (
    <div
      style={calloutStyle(rect)}
      className="z-[102] bg-white shadow-xl p-4 flex flex-col gap-3 animate-slide-up"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] font-semibold text-[#3d5a80] uppercase tracking-wide">
            Step {stepIndex + 1} of {totalSteps}
          </div>
          <h3 className="text-sm font-semibold text-slate-700 mt-0.5">{title}</h3>
        </div>
        <button
          onClick={onClose}
          aria-label="Close tour"
          className="text-slate-400 hover:text-slate-600 shrink-0"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="text-xs text-slate-500 leading-relaxed">{body}</div>

      <div className="flex items-center justify-center gap-1.5">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <button
            key={i}
            onClick={() => onDotClick(i)}
            aria-label={`Go to step ${i + 1}`}
            className={`h-1.5 rounded-full transition-all ${
              i === stepIndex ? "w-4 bg-[#3d5a80]" : "w-1.5 bg-slate-300 hover:bg-slate-400"
            }`}
          />
        ))}
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          disabled={stepIndex === 0}
          className="text-xs font-inter text-slate-600 px-2.5 py-1 border border-slate-300 rounded-full disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Back
        </button>
        <button
          onClick={onNext}
          className="text-xs font-inter text-white bg-[#3d5a80] px-3 py-1 rounded-full hover:bg-[#2e4460] transition"
        >
          {stepIndex === totalSteps - 1 ? "Done" : "Next"}
        </button>
      </div>
    </div>
  );
}

export default TourCallout;

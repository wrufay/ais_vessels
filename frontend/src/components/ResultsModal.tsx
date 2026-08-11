import type { RegionStats } from "../Map";
import ClosePanelBtn from "./ClosePanelBtn";
import PlotFigure from "./PlotFigure";

// The region-analysis results card, opened after "Analyse" finishes running
// on a drawn/selected region. Shows the vessel/position counts and the
// three generated plots (or a message if there's no activity). Only ever
// shown/hidden by Map.tsx's showResults/closingResults pair, which also
// drive its enter/exit animation classes.
function ResultsModal({
  closing,
  regionStats,
  regionName,
  start,
  end,
  regionTime,
  onClose,
  onDownloadPlot,
}: {
  closing: boolean;
  regionStats: RegionStats;
  regionName: string | null;
  start: string;
  end: string;
  regionTime: number | null;
  onClose: () => void;
  onDownloadPlot: (base64: string, filename: string) => void;
}) {
  return (
    <div
      className={`absolute inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 ${
        closing ? "animate-fade-out" : "animate-fade-in"
      }`}
      onClick={onClose}
    >
      {/* actual white area */}
      <div
        className={`bg-white dark:bg-slate-900 rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col ${
          closing ? "animate-scale-out" : "animate-scale-in"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-7 pt-6 pb-5 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div>
            <h2 className="text-xl font-inter font-semibold text-slate-800 dark:text-slate-100">
              {regionName ?? "Region Analysis"}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              <span className="font-medium text-slate-600 dark:text-slate-300">
                Selected: {regionStats.unique_vessels}
              </span>{" "}
              vessels ·{" "}
              <span className="font-medium text-slate-600 dark:text-slate-300">
                {regionStats.total_positions.toLocaleString()}
              </span>{" "}
              positions · {start} to {end}
              {regionTime !== null && (
                <span className="text-slate-400 dark:text-slate-500">
                  {" "}
                  · {(regionTime / 1000).toFixed(1)}s
                </span>
              )}
            </p>
          </div>
          <ClosePanelBtn onClick={onClose} displayType="cross" />
        </div>
        <div className="overflow-y-auto px-7 py-6 space-y-7">
          {regionStats.total_positions === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-10">
              No vessel activity found in this region for the selected
              dates.
            </p>
          ) : (
            <>
              {(
                [
                  { key: "vessel_types", caption: "Breakdown of vessel types by day.", filename: "vessels_by_type.png" },
                  { key: "speed_overall", caption: "Mean speed of all vessels, daily.", filename: "mean_speed.png" },
                  { key: "vessel_density", caption: "Regional traffic displayed in a heat map.", filename: "vessel_density.png" },
                ] as const
              ).map(({ key, caption, filename }) => {
                const base64 = regionStats.plots?.[key];
                return base64 && (
                  <PlotFigure key={key} caption={caption} base64={base64} filename={filename} onDownload={onDownloadPlot} />
                );
              })}
              {regionStats.plots?.vessel_density_error && (
                <p className="text-xs text-slate-400 dark:text-slate-500 italic px-1">
                  {regionStats.plots.vessel_density_error}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ResultsModal;

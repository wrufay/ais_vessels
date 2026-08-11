import ClosePanelBtn from "./ClosePanelBtn";
import { TYPE_COLORS } from "../data/vesselTypeColors";

export interface VesselFilters {
  type: Set<string>;
  source: string;
  dfo: string;
}

const VESSEL_TYPES = [
  "cargo",
  "tanker",
  "fishing",
  "passenger",
  "search & rescue",
  "other",
  "unknown",
] as const;

// The "Filter vessels" modal, opened from the vessel-type pill in the
// Tracks panel. Edits a draft copy of the filters (draftFilters) that only
// commits to the real filters state on "Apply" -- "Reset"/closing without
// applying just discards the draft, same behaviour as before extraction.
function VesselTypeFilterModal({
  draftFilters,
  setDraftFilters,
  onApply,
  onClose,
}: {
  draftFilters: VesselFilters;
  setDraftFilters: React.Dispatch<React.SetStateAction<VesselFilters>>;
  onApply: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-lg shadow-sm w-full max-w-sm animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
            Filter vessels
          </h2>
          <ClosePanelBtn onClick={onClose} displayType="cross" />
        </div>
        <div className="px-6 py-5 flex flex-col gap-5">
          {/* Vessel type — pills */}
          <div className="flex flex-col gap-2">
            <span className="text-sm text-slate-600 dark:text-slate-300">Vessel type</span>
            <div className="flex flex-wrap gap-1.5">
              {VESSEL_TYPES.map((t) => {
                const on = draftFilters.type.has(t);
                const color = TYPE_COLORS[t];
                return (
                  <button
                    key={t}
                    onClick={() =>
                      setDraftFilters((prev) => {
                        const next = new Set(prev.type);
                        on ? next.delete(t) : next.add(t);
                        return { ...prev, type: next };
                      })
                    }
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium font-geologica border transition ${
                      on
                        ? "border-transparent text-white"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600"
                    }`}
                    style={on ? { backgroundColor: color } : {}}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{
                        backgroundColor: on
                          ? "rgba(255,255,255,0.7)"
                          : color,
                      }}
                    />
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                );
              })}
            </div>
          </div>
          {/* Dropdowns for the other two */}
          {/* Commented out (not removed) -- AIS source / DFO vessel filters
              aren't working correctly right now and would confuse users.
          {[
            {
              key: "source" as const,
              label: "AIS source",
              options: [
                { value: "all", label: "All sources" },
                { value: "terrestrial", label: "Terrestrial" },
                { value: "satellite", label: "Satellite" },
              ],
            },
            {
              key: "dfo" as const,
              label: "DFO vessels",
              options: [
                { value: "all", label: "All vessels" },
                { value: "dfo", label: "DFO only" },
                { value: "non-dfo", label: "Non-DFO only" },
              ],
            },
          ].map(({ key, label, options }) => (
            <div
              key={key}
              className="flex items-center justify-between gap-4"
            >
              <span className="text-sm text-slate-600 dark:text-slate-300 shrink-0">
                {label}
              </span>
              <select
                value={draftFilters[key]}
                onChange={(e) =>
                  setDraftFilters((prev) => ({
                    ...prev,
                    [key]: e.target.value,
                  }))
                }
                className="text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2.5 py-1.5 outline-none focus:border-[#98c1d9] focus:ring-2 focus:ring-[#98c1d9]/20 transition cursor-pointer"
              >
                {options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
          */}
        </div>
        <div className="flex items-center justify-between px-6 pb-5">
          <button
            onClick={() =>
              setDraftFilters({
                type: new Set(),
                source: "all",
                dfo: "all",
              })
            }
            className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition"
          >
            Reset
          </button>
          <button
            onClick={onApply}
            className="px-4 py-1.5 rounded-full bg-[#3d5a80] text-white text-sm font-medium hover:bg-[#293241] transition"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

export default VesselTypeFilterModal;

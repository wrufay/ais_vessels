import { useState } from "react";
import ClosePanelBtn from "./ClosePanelBtn";
import PanelHeader from "./PanelHeader";
import CollapsibleHeader from "./CollapsibleHeader";
import type { NoiseImpactSite, NoiseImpactOptions } from "../useNoiseImpact";

const runIcon = (
  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="6,4 20,12 6,20" />
  </svg>
);

const resetIcon = (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 1 2.64 6.36" />
    <polyline points="3 8 3 12 7 12" />
  </svg>
);

const inputClass =
  "text-sm text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2.5 py-1.5 outline-none focus:border-[#98c1d9] focus:ring-2 focus:ring-[#98c1d9]/20 transition";

// A plain checkbox list, no caret -- used for Impact types / Metrics,
// which are short enough (4 and 2 items) that collapsing them just adds an
// extra click for no space savings. Hearing groups is the one category
// long/structured enough to warrant carets (see
// CollapsibleCheckboxCategoryList below).
function CheckboxList({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 py-1.5">
        <span className="text-xs text-slate-600 dark:text-slate-300 flex-1">{label}</span>
        {selected.length < options.length && (
          <button
            type="button"
            onClick={() => options.forEach((o) => !selected.includes(o) && onToggle(o))}
            className="text-[10px] text-[#3d5a80] dark:text-[#98c1d9] hover:underline"
          >
            Select all
          </button>
        )}
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => options.forEach((o) => selected.includes(o) && onToggle(o))}
            className="text-[10px] text-[#3d5a80] dark:text-[#98c1d9] hover:underline"
          >
            Unselect all
          </button>
        )}
        <span className="text-[11px] text-slate-400 dark:text-slate-500">
          {selected.length}/{options.length}
        </span>
      </div>
      <div className="flex flex-col gap-0.5 pl-1 pb-1">
        {options.map((o) => (
          <label key={o} className="flex items-center gap-2 py-0.5 cursor-pointer">
            <input
              type="checkbox"
              checked={selected.includes(o)}
              onChange={() => onToggle(o)}
              className="accent-[#3d5a80] w-3.5 h-3.5 rounded shrink-0"
            />
            <span className="text-xs text-slate-600 dark:text-slate-300">{o}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// Hearing groups (HearingGroup enum in enums.py) fall into natural taxonomic
// categories -- grouping them makes a 9-item list scannable. Matched by
// substring against the exact strings the backend returns (which themselves
// must match Noise_Impact_Thresholds.xlsx exactly, per that enum's own
// comment), with "Other" as a catch-all so a future new hearing group in the
// workbook still shows up somewhere instead of silently vanishing.
const HEARING_GROUP_CATEGORIES: { label: string; match: (o: string) => boolean }[] = [
  { label: "Cetaceans", match: (o) => o.includes("Cetaceans") },
  { label: "Fish", match: (o) => o.startsWith("Fish") },
  { label: "Other", match: () => true },
];

function groupHearingGroups(options: string[]): { label: string; options: string[] }[] {
  const groups = HEARING_GROUP_CATEGORIES.map((c) => ({ label: c.label, options: [] as string[] }));
  options.forEach((o) => {
    const group = groups.find((_, i) => HEARING_GROUP_CATEGORIES[i].match(o));
    (group ?? groups[groups.length - 1]).options.push(o);
  });
  return groups.filter((g) => g.options.length > 0);
}

// Same caret-toggle list as CollapsibleCheckboxList, but with the options
// pre-split into their own nested caret-toggle sub-groups (see
// groupHearingGroups) -- used only for hearing groups, the one category
// with enough items (9) and a real taxonomy to make sub-grouping worth it.
function CollapsibleCheckboxCategoryList({
  label,
  options,
  selected,
  onToggle,
  categoryOpen,
  onToggleCategory,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  categoryOpen: Record<string, boolean>;
  onToggleCategory: (category: string) => void;
}) {
  const groups = groupHearingGroups(options);
  return (
    <div>
      <div className="flex items-center gap-2 py-1.5">
        <span className="text-xs text-slate-600 dark:text-slate-300 flex-1">{label}</span>
        <span className="text-[11px] text-slate-400 dark:text-slate-500">
          {selected.length}/{options.length}
        </span>
      </div>
      <div className="flex flex-col gap-0.5 pl-1 pb-1">
        {groups.map((g) => {
          const groupOpen = categoryOpen[g.label] ?? false;
          const selectedInGroup = g.options.filter((o) => selected.includes(o)).length;
          return (
            <div key={g.label}>
              <CollapsibleHeader
                open={groupOpen}
                onToggle={() => onToggleCategory(g.label)}
                label={g.label}
                trailing={
                  <span className="flex items-center gap-2">
                    {/* CollapsibleHeader's whole row is itself a <button>,
                        so these can't be real nested <button>s -- clickable
                        spans with stopPropagation (so they don't also
                        trigger the caret toggle) instead. */}
                    {groupOpen && selectedInGroup < g.options.length && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          g.options.forEach((o) => !selected.includes(o) && onToggle(o));
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter" && e.key !== " ") return;
                          e.stopPropagation();
                          e.preventDefault();
                          g.options.forEach((o) => !selected.includes(o) && onToggle(o));
                        }}
                        className="text-[10px] text-[#3d5a80] dark:text-[#98c1d9] hover:underline cursor-pointer"
                      >
                        Select all
                      </span>
                    )}
                    {groupOpen && selectedInGroup > 0 && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          g.options.forEach((o) => selected.includes(o) && onToggle(o));
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter" && e.key !== " ") return;
                          e.stopPropagation();
                          e.preventDefault();
                          g.options.forEach((o) => selected.includes(o) && onToggle(o));
                        }}
                        className="text-[10px] text-[#3d5a80] dark:text-[#98c1d9] hover:underline cursor-pointer"
                      >
                        Unselect all
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      {selectedInGroup}/{g.options.length}
                    </span>
                  </span>
                }
              />
              {groupOpen && (
                <div className="flex flex-col gap-0.5 pl-3 pb-1">
                  {g.options.map((o) => (
                    <label key={o} className="flex items-center gap-2 py-0.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selected.includes(o)}
                        onChange={() => onToggle(o)}
                        className="accent-[#3d5a80] w-3.5 h-3.5 rounded shrink-0"
                      />
                      <span className="text-xs text-slate-600 dark:text-slate-300">{o}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <input
        type="number"
        value={value}
        step={step ?? 1}
        onChange={(e) => onChange(Number(e.target.value))}
        className={inputClass}
      />
    </label>
  );
}

type Tab = "scenario" | "pile" | "species";
const TABS: { id: Tab; label: string }[] = [
  { id: "scenario", label: "Scenario" },
  { id: "pile", label: "Pile driving" },
  { id: "species", label: "Species" },
];

// The noise-impact parameter panel -- Scenario / Pile driving / Species,
// as tabs (rather than the three-card side-by-side layout this replaced --
// see wireframe.png), since a side panel is too narrow to lay them out
// side by side. Tabs map 1:1 onto the backend's three param groups
// (analysis/noise_impact.py -> TLModelParams / NoiseLevelParams /
// ExposureAssessmentParams): Scenario picks which precomputed site to use
// (site is a dropdown, not a map click -- see useNoiseImpact's module
// docstring), Pile driving is the noise-source params, Species is which
// hearing groups/impact types/metrics/depth range to evaluate thresholds
// for. Lives in the left SidePanel (Map.tsx) instead of a modal so it can
// stay open alongside the Impacts results panel on the right.
function NoiseImpactParamsPanel({
  sites,
  options,
  site,
  setSite,
  hearingGroups,
  onToggleHearingGroup,
  impactTypes,
  onToggleImpactType,
  metrics,
  onToggleMetric,
  depthMin,
  setDepthMin,
  depthMax,
  setDepthMax,
  splPeak,
  setSplPeak,
  selSingleStrike,
  setSelSingleStrike,
  nStrikesPerPile,
  setNStrikesPerPile,
  running,
  error,
  onRun,
  onReset,
  onClose,
}: {
  sites: Record<string, NoiseImpactSite>;
  options: NoiseImpactOptions;
  site: string;
  setSite: (v: string) => void;
  hearingGroups: string[];
  onToggleHearingGroup: (v: string) => void;
  impactTypes: string[];
  onToggleImpactType: (v: string) => void;
  metrics: string[];
  onToggleMetric: (v: string) => void;
  depthMin: number;
  setDepthMin: (v: number) => void;
  depthMax: number;
  setDepthMax: (v: number) => void;
  splPeak: number;
  setSplPeak: (v: number) => void;
  selSingleStrike: number;
  setSelSingleStrike: (v: number) => void;
  nStrikesPerPile: number;
  setNStrikesPerPile: (v: number) => void;
  running: boolean;
  error: string | null;
  onRun: () => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const siteMeta = sites[site];
  const [hearingGroupCategoryOpen, setHearingGroupCategoryOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(HEARING_GROUP_CATEGORIES.map((c) => [c.label, true]))
  );
  const [tab, setTab] = useState<Tab>("scenario");

  // Every category needs at least one selection, and the source-level
  // fields need real (positive) values -- a compute call with an empty
  // category always comes back with zero zones, and a 0 dB/0-strike
  // source is meaningless, so there's nothing to gain from letting Run
  // fire before all of these are actually set.
  const missing: string[] = [];
  if (!site) missing.push("a site");
  if (hearingGroups.length === 0) missing.push("a hearing group");
  if (impactTypes.length === 0) missing.push("an impact type");
  if (metrics.length === 0) missing.push("a metric");
  if (!(splPeak > 0)) missing.push("a peak SPL");
  if (!(selSingleStrike > 0)) missing.push("an SEL/strike");
  if (!(nStrikesPerPile > 0)) missing.push("strikes/pile");
  const canRun = missing.length === 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-start justify-between px-5 pt-8 pb-4 shrink-0">
        <PanelHeader name="Parameters" description="Configure the noise-impact model run." className="" />
        <ClosePanelBtn onClick={onClose} displayType="cross" />
      </div>

      <div className="flex px-5 gap-1 shrink-0 border-b border-slate-100 dark:border-slate-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition ${
              tab === t.id
                ? "border-[#3d5a80] text-[#3d5a80] dark:border-[#98c1d9] dark:text-[#98c1d9]"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
        {tab === "scenario" && (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">Site</span>
              <select
                value={site}
                onChange={(e) => setSite(e.target.value)}
                className={`${inputClass} cursor-pointer`}
              >
                {Object.keys(sites).length === 0 && <option value="">Loading…</option>}
                {Object.keys(sites).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            {siteMeta && (
              <div className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
                Source: {siteMeta.src_lat.toFixed(3)}, {siteMeta.src_lon.toFixed(3)}
                <br />
                {siteMeta.src_depth}m depth · {siteMeta.src_freq}Hz · {siteMeta.noise_date}
                <br />
                Precomputed transmission-loss model — location isn't adjustable yet.
              </div>
            )}
            {siteMeta?.using_fixture_data && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400 rounded-md px-2.5 py-2 text-[11px] leading-relaxed">
                Using synthetic placeholder data — the real ~950MB dataset
                isn't available on this machine, so results here aren't
                scientifically meaningful (fine for UI development).
              </div>
            )}
          </div>
        )}

        {tab === "pile" && (
          <div className="flex flex-col gap-2.5">
            <NumberField label="Peak SPL (dB)" value={splPeak} onChange={setSplPeak} />
            <NumberField label="SEL / strike (dB)" value={selSingleStrike} onChange={setSelSingleStrike} />
            <NumberField label="Strikes / pile" value={nStrikesPerPile} onChange={setNStrikesPerPile} />
            <div className="text-xs text-slate-400 dark:text-slate-500">
              1 pile · 24-hour assessment period
            </div>
          </div>
        )}

        {tab === "species" && (
          <div className="flex flex-col gap-1">
            <CollapsibleCheckboxCategoryList
              label="Hearing groups"
              options={options.hearing_groups}
              selected={hearingGroups}
              onToggle={onToggleHearingGroup}
              categoryOpen={hearingGroupCategoryOpen}
              onToggleCategory={(category) =>
                setHearingGroupCategoryOpen((prev) => ({ ...prev, [category]: !(prev[category] ?? false) }))
              }
            />
            <CheckboxList
              label="Impact types"
              options={options.impact_types}
              selected={impactTypes}
              onToggle={onToggleImpactType}
            />
            <CheckboxList
              label="Metrics"
              options={options.metrics}
              selected={metrics}
              onToggle={onToggleMetric}
            />
            <div className="grid grid-cols-2 gap-2.5 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <NumberField label="Depth min (m)" value={depthMin} onChange={setDepthMin} step={0.1} />
              <NumberField label="Depth max (m)" value={depthMax} onChange={setDepthMax} step={0.1} />
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mx-5 mb-3 px-3 py-2 rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-600 dark:text-red-400 shrink-0">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
        {!canRun && !running && (
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            Missing {missing.join(", ")}
          </span>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={onRun}
            disabled={running || !canRun}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-1.5 rounded-full bg-[#3d5a80] text-white text-sm font-medium hover:bg-[#293241] transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {running ? (
              <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              runIcon
            )}
            {running ? "Running…" : "Run"}
          </button>
          <button
            onClick={onReset}
            disabled={running}
            title="Reset parameters"
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full border border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {resetIcon}
          </button>
        </div>
      </div>
    </div>
  );
}

export default NoiseImpactParamsPanel;

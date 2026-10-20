import { useState, type FormEvent } from "react";
import ClosePanelBtn from "../ClosePanelBtn";
import PanelHeader from "../PanelHeader";
import CollapsibleHeader from "../CollapsibleHeader";
import { pairKey, pairMetrics, runnablePairs } from "../../useNoiseImpact";
import type {
  NoiseImpactSite,
  NoiseImpactOptions,
  NoiseImpactInfo,
  NoiseImpactCustomThreshold,
} from "../../useNoiseImpact";

const runIcon = (
  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="6,4 20,12 6,20" />
  </svg>
);

const resetIcon = (
  <svg
    className="w-3.5 h-3.5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 12a9 9 0 1 1 2.64 6.36" />
    <polyline points="3 8 3 12 7 12" />
  </svg>
);

const inputBaseClass =
  "text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2.5 py-1.5 outline-none focus:border-[#98c1d9] focus:ring-2 focus:ring-[#98c1d9]/20 transition";
const inputClass = `text-sm ${inputBaseClass}`;
// Custom thresholds form: same size as the labels around it.
const smallInputClass = `text-xs ${inputBaseClass}`;

// "Something's still required" marker for the summary line at the bottom
// -- individual fields/categories just carry a plain dot instead (see the
// tab buttons below); this fuller icon is reserved for the one place that
// also carries the explanatory text.
function MissingIcon() {
  return (
    <svg
      className="w-3.5 h-3.5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="13" />
      <line x1="12" y1="16" x2="12" y2="16.01" />
    </svg>
  );
}

// A plain checkbox list, no caret -- used for Metrics, which is short
// enough (2 items) that collapsing it just adds an extra click for no
// space savings.
function CheckboxList({
  label,
  options,
  selected,
  onToggle,
  hideSelectAll,
  tooltip,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  // Metrics only has 2 options and defaults to both selected already --
  // select-all/unselect-all buttons don't save a click there, just clutter.
  hideSelectAll?: boolean;
  // Per-option hover text (see NoiseImpactInfo) -- undefined for an option
  // with no matching workbook entry just means no title attribute, not an
  // error.
  tooltip?: (value: string) => string | undefined;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 py-1.5">
        <span className="text-xs text-slate-600 dark:text-slate-300 flex-1">
          {label}
        </span>
        {!hideSelectAll && selected.length < options.length && (
          <button
            type="button"
            onClick={() =>
              options.forEach((o) => !selected.includes(o) && onToggle(o))
            }
            className="text-[10px] text-[#3d5a80] dark:text-[#98c1d9] hover:underline"
          >
            Select all
          </button>
        )}
        {!hideSelectAll && selected.length > 0 && (
          <button
            type="button"
            onClick={() =>
              options.forEach((o) => selected.includes(o) && onToggle(o))
            }
            className="text-[10px] text-[#3d5a80] dark:text-[#98c1d9] hover:underline"
          >
            Unselect all
          </button>
        )}
        <span className="text-[11px] text-[#7c8ca2]">
          {selected.length}/{options.length}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5 pl-1 pb-1">
        {options.map((o) => {
          const on = selected.includes(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() => onToggle(o)}
              title={tooltip?.(o)}
              className={`px-1.5 py-0.5 rounded-full border border-slate-400 text-[11px] font-geologica transition active:scale-95 ${
                on
                  ? "bg-[#3d5a80] text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Hearing groups (HearingGroup enum in enums.py) fall into natural taxonomic
// categories -- grouping the grid's rows makes a 9-item list scannable.
// Matched by substring against the exact strings the backend returns (which
// themselves must match Noise_Impact_Thresholds.xlsx exactly, per that
// enum's own comment), with "Other" as a catch-all so a future new hearing
// group in the workbook still shows up somewhere instead of silently
// vanishing.
const HEARING_GROUP_CATEGORIES: {
  label: string;
  match: (o: string) => boolean;
}[] = [
  { label: "Cetaceans", match: (o) => o.includes("Cetaceans") },
  { label: "Fish", match: (o) => o.startsWith("Fish") },
  { label: "Other", match: () => true },
];

function groupHearingGroups(
  options: string[]
): { label: string; options: string[] }[] {
  const groups = HEARING_GROUP_CATEGORIES.map((c) => ({
    label: c.label,
    options: [] as string[],
  }));
  options.forEach((o) => {
    const group = groups.find((_, i) => HEARING_GROUP_CATEGORIES[i].match(o));
    (group ?? groups[groups.length - 1]).options.push(o);
  });
  return groups.filter((g) => g.options.length > 0);
}

// Hearing group x impact type grid -- each cell is one threshold to pick,
// so a combination the workbook doesn't define (e.g. Mortality for marine
// mammals) can't be picked at all, unlike the separate hearing-group and
// impact-type lists this replaced, which ran every combination of the two.
// A cell is:
//  - a dash: no threshold for any metric;
//  - a grey box: thresholds exist, but not for the ticked metric(s) --
//    stays picked underneath, so re-ticking the metric brings it back;
//  - a checkbox otherwise, tagged "<metric> only" when both metrics are
//    ticked but only one is defined.
// Clicking a row/column name picks (or, if all picked, unpicks) every
// available cell in it. Hover texts come from the workbook (Info sheet
// descriptions, Reference column) -- nothing hardcoded here.
function ThresholdGrid({
  options,
  info,
  metrics,
  pairs,
  setPairs,
}: {
  options: NoiseImpactOptions;
  info: NoiseImpactInfo;
  metrics: string[];
  pairs: string[];
  setPairs: (v: string[]) => void;
}) {
  const impacts = options.impact_types;
  const groups = groupHearingGroups(options.hearing_groups);

  const references = (hg: string) =>
    [
      ...new Set(
        options.thresholds
          .filter((t) => t.hearing_group === hg)
          .map((t) => t.reference)
      ),
    ].join(", ");
  const available = (hg: string, it: string) =>
    pairMetrics(options.thresholds, hg, it).some((m) => metrics.includes(m));

  // Pick every available cell in `cells`, or unpick them if all are picked.
  function toggleAll(cells: [string, string][]) {
    const keys = cells
      .filter(([hg, it]) => available(hg, it))
      .map(([hg, it]) => pairKey(hg, it));
    if (keys.length === 0) return;
    const allPicked = keys.every((k) => pairs.includes(k));
    setPairs(
      allPicked
        ? pairs.filter((p) => !keys.includes(p))
        : [...pairs, ...keys.filter((k) => !pairs.includes(k))]
    );
  }
  function toggleOne(key: string) {
    setPairs(
      pairs.includes(key) ? pairs.filter((p) => p !== key) : [...pairs, key]
    );
  }

  const pickAll = "Click to pick all.";
  const hoverText = (...lines: (string | undefined)[]) =>
    lines.filter(Boolean).join("\n");

  function cell(hg: string, it: string) {
    const defined = pairMetrics(options.thresholds, hg, it);
    const refs = references(hg);
    const cite = refs ? ` (${refs})` : "";
    if (defined.length === 0) {
      return (
        <span
          title={`${it} is undefined for ${hg}${cite}.`}
          className="inline-block w-5 text-xs text-slate-400 dark:text-slate-500 cursor-help"
        >
          –
        </span>
      );
    }
    if (!available(hg, it)) {
      return (
        <span
          title={`${it} ${metrics.join(" and ")} is undefined for ${hg}${cite}.`}
          aria-disabled="true"
          className="inline-block align-middle w-5 h-5 rounded bg-slate-300 dark:bg-slate-600 cursor-not-allowed"
        />
      );
    }
    const key = pairKey(hg, it);
    const on = pairs.includes(key);
    const missing = metrics.filter((m) => !defined.includes(m));
    const only = defined.filter((m) => metrics.includes(m));
    return (
      <>
        <button
          type="button"
          onClick={() => toggleOne(key)}
          title={`${hg} · ${it}`}
          aria-pressed={on}
          className={`inline-flex align-middle items-center justify-center w-5 h-5 rounded border transition active:scale-95 ${
            on
              ? "bg-[#3d5a80] border-[#3d5a80] text-white"
              : "bg-white dark:bg-slate-800 border-slate-400 dark:border-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
          }`}
        >
          {on && (
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="5 12 10 17 19 7" />
            </svg>
          )}
        </button>
        {missing.length > 0 && (
          <span
            title={`${it} ${missing.join(" and ")} is undefined for ${hg}${cite}, so only ${only.join(" and ")} runs.`}
            className="block whitespace-nowrap text-[10px] leading-tight text-slate-500 dark:text-slate-400 cursor-help"
          >
            {only.map((m) => m.split("_")[0]).join("/")} only
          </span>
        )}
      </>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 py-1.5">
        <span className="text-[13px] font-semibold text-slate-600 dark:text-slate-300 flex-1">
          Thresholds
        </span>
        {pairs.length > 0 && (
          <button
            type="button"
            onClick={() => setPairs([])}
            className="text-[10px] text-[#3d5a80] dark:text-[#98c1d9] hover:underline"
          >
            Clear
          </button>
        )}
      </div>
      <p className="text-[11px] text-[#7c8ca2] leading-relaxed pb-1">
        Click a row or column name to pick all of it.
      </p>
      <table className="w-full table-fixed border-collapse">
        <colgroup>
          <col className="w-[36%]" />
        </colgroup>
        <thead>
          <tr>
            <th />
            {impacts.map((it) => (
              <th key={it} className="px-0.5 py-1 font-normal">
                <button
                  type="button"
                  onClick={() =>
                    toggleAll(options.hearing_groups.map((hg) => [hg, it]))
                  }
                  title={hoverText(info.impact_types[it], pickAll)}
                  className="text-[10px] text-slate-500 dark:text-slate-400 hover:text-[#3d5a80] dark:hover:text-[#98c1d9]"
                >
                  {it}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => [
            <tr key={g.label}>
              <td
                colSpan={impacts.length + 1}
                className="pt-2 pb-0.5 text-[10px] text-[#7c8ca2]"
              >
                {g.label}
              </td>
            </tr>,
            ...g.options.map((hg) => (
              <tr key={hg} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <th className="py-1 pl-1 text-left font-normal">
                  <button
                    type="button"
                    onClick={() => toggleAll(impacts.map((it) => [hg, it]))}
                    title={hoverText(info.hearing_groups[hg], pickAll)}
                    className="block w-full text-left text-xs leading-tight break-words text-slate-500 dark:text-slate-400 hover:text-[#3d5a80] dark:hover:text-[#98c1d9]"
                  >
                    {hg.replace(/^Fish - /, "")}
                  </button>
                </th>
                {impacts.map((it) => (
                  <td key={it} className="py-1 text-center align-middle">
                    {cell(hg, it)}
                  </td>
                ))}
              </tr>
            )),
          ])}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-[10px] text-[#7c8ca2]">
        <span>– undefined</span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-slate-300 dark:bg-slate-600" />
          undefined for the ticked metric
        </span>
        <span>Hover to see why</span>
      </div>
    </div>
  );
}

// Same limits as analysis/noise_impact.py's CUSTOM_DB_RANGE /
// CUSTOM_NAME_MAX_LEN -- checked here so a mistake shows up while typing;
// the backend checks again.
const CUSTOM_DB_MIN = 100;
const CUSTOM_DB_MAX = 300;
const CUSTOM_NAME_MAX_LEN = 60;
const METRIC_LABELS: Record<string, string> = {
  SEL_cum: "Cumulative",
  SPL_peak: "Peak",
};

// User-entered thresholds: a name, a metric and a dB value each, compared
// with unweighted noise (a hearing adjustment is just a fixed number of dB
// at the site's single frequency, so it can be folded into the value).
// Run alongside the grid's picks -- see analysis/noise_impact.py's
// _run_custom. A name can have one threshold per metric, like a hearing
// group in the grid.
function CustomThresholds({
  metricOptions,
  customThresholds,
  setCustomThresholds,
}: {
  metricOptions: string[];
  customThresholds: NoiseImpactCustomThreshold[];
  setCustomThresholds: (v: NoiseImpactCustomThreshold[]) => void;
}) {
  const [name, setName] = useState("");
  // "" = not chosen yet: Cumulative, once the metric list has loaded.
  const [metric, setMetric] = useState("");
  const [db, setDb] = useState("");
  const [error, setError] = useState<string | null>(null);
  const chosenMetric =
    metric || (metricOptions.includes("SEL_cum") ? "SEL_cum" : metricOptions[0] ?? "");
  const label = (m: string) => METRIC_LABELS[m] ?? m;

  function add(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    const value = Number(db);
    if (!trimmed) return setError("Enter a name.");
    if (db.trim() === "" || !(value >= CUSTOM_DB_MIN && value <= CUSTOM_DB_MAX))
      return setError(`Enter a threshold between ${CUSTOM_DB_MIN} and ${CUSTOM_DB_MAX} dB.`);
    if (customThresholds.some((t) => t.name === trimmed && t.metric === chosenMetric))
      return setError(`${trimmed} already has a ${label(chosenMetric).toLowerCase()} threshold.`);
    setCustomThresholds([
      ...customThresholds,
      { name: trimmed, metric: chosenMetric, threshold_db: value },
    ]);
    setName("");
    setDb("");
  }

  return (
    <div>
      <div className="flex items-center gap-2 py-1.5">
        <span className="text-[13px] font-semibold text-slate-600 dark:text-slate-300 flex-1">
          Custom thresholds
        </span>
        {customThresholds.length > 0 && (
          <button
            type="button"
            onClick={() => setCustomThresholds([])}
            className="text-[10px] text-[#3d5a80] dark:text-[#98c1d9] hover:underline"
          >
            Clear
          </button>
        )}
      </div>
      <p className="text-[11px] text-[#7c8ca2] leading-relaxed pb-1.5">
        Compared with noise without any hearing adjustment. Include any
        adjustment in the dB value. Not affected by the Metrics setting.
      </p>
      {customThresholds.length > 0 && (
        <ul className="flex flex-col gap-1 pb-2">
          {customThresholds.map((t, i) => (
            <li
              key={`${t.name}|${t.metric}`}
              className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-slate-50 dark:bg-slate-800 text-xs"
            >
              <span className="flex-1 min-w-0">
                <span className="block break-words text-slate-700 dark:text-slate-200">
                  {t.name}
                </span>
                <span className="block text-[11px] text-[#7c8ca2]">
                  {label(t.metric)} ({t.metric}) · {t.threshold_db} dB
                </span>
              </span>
              <button
                type="button"
                onClick={() => setCustomThresholds(customThresholds.filter((_, j) => j !== i))}
                aria-label={`Remove ${t.name} ${label(t.metric).toLowerCase()} threshold`}
                title="Remove"
                className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500 dark:text-slate-400">Name</span>
          <input
            type="text"
            value={name}
            maxLength={CUSTOM_NAME_MAX_LEN}
            placeholder="Right whale"
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            className={smallInputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500 dark:text-slate-400">Metric</span>
          <select
            value={chosenMetric}
            onChange={(e) => {
              setMetric(e.target.value);
              setError(null);
            }}
            className={`${smallInputClass} cursor-pointer`}
          >
            {metricOptions.map((m) => (
              <option key={m} value={m}>
                {label(m)} ({m})
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1 flex-1 min-w-0">
            <span className="text-xs text-slate-500 dark:text-slate-400">dB</span>
            <input
              type="number"
              value={db}
              step={0.1}
              placeholder="162"
              onChange={(e) => {
                setDb(e.target.value);
                setError(null);
              }}
              className={`${smallInputClass} w-full`}
            />
          </label>
          <button
            type="submit"
            className="shrink-0 px-3 py-1.5 rounded-md bg-[#3d5a80] text-white text-xs hover:bg-[#293241] transition active:scale-95"
          >
            Add
          </button>
        </div>
        {error && (
          <span className="text-[11px] text-red-600 dark:text-red-400">{error}</span>
        )}
      </form>
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
  // The box keeps its own raw text so it can sit empty or half-typed (e.g.
  // "" or "-") mid-edit -- feeding Number(e.target.value) straight back as
  // the value turned "" into 0 and snapped the box back to "0" on every
  // keystroke. Only a real number is passed up to the parent; leaving the
  // box blank/invalid restores whatever it held before this edit started
  // (not the last valid keystroke -- backspacing "-0.01" passes through
  // "-0.0", which would otherwise leave it at 0).
  const [text, setText] = useState(String(value));
  const [valueBeforeEdit, setValueBeforeEdit] = useState(value);

  // Pick up changes made from outside (e.g. the Reset button), but leave
  // text alone when it already means the same number (e.g. "-0.0" mid-way
  // to typing "-0.05").
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (Number(text) !== value) setText(String(value));
  }

  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <input
        type="number"
        value={text}
        step={step ?? 1}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          if (raw !== "" && Number.isFinite(Number(raw))) onChange(Number(raw));
        }}
        onFocus={() => setValueBeforeEdit(value)}
        onBlur={() => {
          if (text === "" || !Number.isFinite(Number(text))) {
            setText(String(valueBeforeEdit));
            onChange(valueBeforeEdit);
          }
        }}
        className={inputClass}
      />
    </label>
  );
}

type Tab = "scenario" | "source" | "species";
const TABS: { id: Tab; label: string }[] = [
  { id: "scenario", label: "Scenario" },
  { id: "source", label: "Source" },
  { id: "species", label: "Species" },
];

// The noise-impact parameter panel -- Scenario / Source / Species, as
// tabs (rather than the three-card side-by-side layout this replaced --
// see wireframe.png), since a side panel is too narrow to lay them out
// side by side. Tabs map 1:1 onto the backend's three param groups
// (analysis/noise_impact.py -> TLModelParams / NoiseLevelParams /
// ExposureAssessmentParams): Scenario picks which precomputed site to use
// (site is a dropdown, not a map click -- see useNoiseImpact's module
// docstring), Source is the pile driving source's properties, Species is
// which thresholds (ThresholdGrid)/metrics/depth range to evaluate. Lives in the left SidePanel (Map.tsx) instead of a
// modal so it can stay open alongside the Impacts results panel on the
// right.
function NoiseImpactParamsPanel({
  sites,
  options,
  info,
  site,
  setSite,
  pairs,
  setPairs,
  customThresholds,
  setCustomThresholds,
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
  nPiles,
  assessmentPeriodHours,
  running,
  error,
  onRun,
  onReset,
  onClose,
}: {
  sites: Record<string, NoiseImpactSite>;
  options: NoiseImpactOptions;
  info: NoiseImpactInfo;
  site: string;
  setSite: (v: string) => void;
  pairs: string[];
  setPairs: (v: string[]) => void;
  customThresholds: NoiseImpactCustomThreshold[];
  setCustomThresholds: (v: NoiseImpactCustomThreshold[]) => void;
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
  nPiles: number;
  assessmentPeriodHours: number;
  running: boolean;
  error: string | null;
  onRun: () => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const siteMeta = sites[site];
  const [tab, setTab] = useState<Tab>("scenario");
  // Metrics only has two options (SPL_peak, SEL_cum) and SPL_peak covers
  // the normal case -- collapsed by default so it reads as an advanced/
  // rarely-touched override rather than a peer of hearing groups/impact
  // types.
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Every category needs at least one selection, and the source-level
  // fields need real (positive) values -- a compute call with an empty
  // category always comes back with zero zones, and a 0 dB/0-strike
  // source is meaningless, so there's nothing to gain from letting Run
  // fire before all of these are actually set. Tracked as individual flags
  // so each field/tab can show its own inline dot that updates live, in
  // addition to (not instead of) the summary line at the bottom.
  const siteInvalid = !site;
  // A custom threshold is enough on its own -- it has its own metric.
  const hasCustom = customThresholds.length > 0;
  const metricsInvalid = metrics.length === 0 && !hasCustom;
  // Picked cells greyed out by the metric choice don't count.
  const pairsInvalid =
    !metricsInvalid &&
    !hasCustom &&
    runnablePairs(options.thresholds, pairs, metrics).length === 0;
  const splPeakInvalid = !(splPeak > 0);
  const selSingleStrikeInvalid = !(selSingleStrike > 0);
  const nStrikesPerPileInvalid = !(nStrikesPerPile > 0);
  const nPilesInvalid = !(nPiles > 0);
  const assessmentPeriodInvalid = !(assessmentPeriodHours > 0);

  const pileInvalid =
    splPeakInvalid ||
    selSingleStrikeInvalid ||
    nStrikesPerPileInvalid ||
    nPilesInvalid ||
    assessmentPeriodInvalid;
  const speciesInvalid = pairsInvalid || metricsInvalid;
  const tabInvalid: Record<Tab, boolean> = {
    scenario: siteInvalid,
    source: pileInvalid,
    species: speciesInvalid,
  };
  const canRun = !siteInvalid && !pileInvalid && !speciesInvalid;

  const missing: string[] = [];
  if (siteInvalid) missing.push("a site");
  if (pairsInvalid) missing.push("a threshold");
  if (metricsInvalid) missing.push("a metric");
  if (splPeakInvalid) missing.push("a peak SPL");
  if (selSingleStrikeInvalid) missing.push("an SEL/strike");
  if (nStrikesPerPileInvalid) missing.push("strikes/pile");

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-start justify-between px-5 pt-8 pb-4 shrink-0">
        <PanelHeader
          name="Parameters"
          description="Configure values for the calculation."
          className=""
        />
        <ClosePanelBtn onClick={onClose} displayType="cross" />
      </div>

      <div className="flex px-5 gap-1 shrink-0 border-b border-slate-100 dark:border-slate-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition active:scale-95 rounded-t-md active:bg-slate-100 ${
              tab === t.id
                ? "border-[#3d5a80] text-[#3d5a80] dark:border-[#98c1d9] dark:text-[#98c1d9]"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            {t.label}
            {tabInvalid[t.id] && (
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 dark:bg-red-400 shrink-0" />
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
        {tab === "scenario" && (
          <div className="flex flex-col gap-3">
            <p className="text-[11px] text-[#7c8ca2] leading-relaxed">
              Select the site.
            </p>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Site
              </span>
              <select
                value={site}
                onChange={(e) => setSite(e.target.value)}
                className={`${inputClass} cursor-pointer`}
              >
                {Object.keys(sites).length === 0 && (
                  <option value="">Loading…</option>
                )}
                {Object.keys(sites).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            {siteMeta && (
              <div className="text-xs text-[#7c8ca2] leading-relaxed">
                Source: {siteMeta.src_lat.toFixed(3)},{" "}
                {siteMeta.src_lon.toFixed(3)}
                <br />
                {siteMeta.src_depth}m depth · {siteMeta.src_freq}Hz ·{" "}
                {siteMeta.noise_date}
                <br />
                Precomputed transmission-loss model.
              </div>
            )}
          </div>
        )}

        {tab === "source" && (
          <div className="flex flex-col gap-2.5">
            <p className="text-[11px] text-[#7c8ca2] leading-relaxed">
              Define pile driving source properties.
            </p>
            <NumberField
              label="Peak SPL (dB)"
              value={splPeak}
              onChange={setSplPeak}
            />
            <NumberField
              label="SEL / strike (dB)"
              value={selSingleStrike}
              onChange={setSelSingleStrike}
            />
            <NumberField
              label="Strikes / pile"
              value={nStrikesPerPile}
              onChange={setNStrikesPerPile}
            />
            {/* Not user-adjustable yet -- shown so the request's full
                parameter set isn't hidden, just not editable right now. */}
            <div className="flex flex-col gap-1 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
              <div>Number of piles: {nPiles} (Default)</div>
              <div>
                Assessment period: {assessmentPeriodHours} hours (Default)
              </div>
            </div>
          </div>
        )}

        {tab === "species" && (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] text-[#7c8ca2] leading-relaxed">
              Choose species to view.
            </p>
            
            <ThresholdGrid
              options={options}
              info={info}
              metrics={metrics}
              pairs={pairs}
              setPairs={setPairs}
            />
            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <CustomThresholds
                metricOptions={options.metrics}
                customThresholds={customThresholds}
                setCustomThresholds={setCustomThresholds}
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <NumberField
                label="Depth min (m)"
                value={depthMin}
                onChange={setDepthMin}
                step={0.1}
              />
              <NumberField
                label="Depth max (m)"
                value={depthMax}
                onChange={setDepthMax}
                step={0.1}
              />
            </div>

            <div className="mt-1 pt-2 border-t border-slate-100 dark:border-slate-800">
              <CollapsibleHeader
                open={advancedOpen}
                onToggle={() => setAdvancedOpen((p) => !p)}
                label="Advanced parameters"
              />
              {advancedOpen && (
                <>
                  <p className="text-[11px] text-[#7c8ca2] leading-relaxed pb-1">
                    By default, both metrics run and only the larger impact zone
                    is shown per hearing group. Override this rule by selecting one or both.
                  </p>
                  <CheckboxList
                    label="Metrics"
                    options={options.metrics}
                    selected={metrics}
                    onToggle={onToggleMetric}
                    hideSelectAll
                  />
                </>
              )}
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
          <span className="flex items-center gap-1.5 text-[11px] text-red-600 dark:text-red-400">
            <MissingIcon />
            Missing {missing.join(", ")}
          </span>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={onRun}
            disabled={running || !canRun}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-1.5 rounded-md bg-[#3d5a80] text-white text-sm hover:bg-[#293241] transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {running ? (
              <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-md animate-spin" />
            ) : (
              runIcon
            )}
            {running ? "Running…" : "Run"}
          </button>
          <button
            onClick={onReset}
            disabled={running}
            title="Reset parameters"
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {resetIcon}
          </button>
        </div>
      </div>
    </div>
  );
}

export default NoiseImpactParamsPanel;

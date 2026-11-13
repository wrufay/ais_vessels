import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import ClosePanelBtn from "../ClosePanelBtn";
import PanelHeader from "../PanelHeader";
import {
  CSV_COLUMNS,
  CSV_WEIGHTING_COLUMN,
  decodeCsvBytes,
  parseCsv,
  thresholdsToCsv,
} from "../../utils/customThresholdCsv";
import {
  DEFAULT_DEPTH_MAX,
  DEFAULT_DEPTH_MIN,
  mitigationReductions,
  pairKey,
  levelFromFormula,
  pairMetrics,
  runnablePairs,
} from "../../useNoiseImpact";
import type {
  NoiseImpactSite,
  NoiseImpactOptions,
  NoiseImpactInfo,
  NoiseImpactCustomThreshold,
  NoiseImpactCustomWeighting,
  NoiseImpactMitigationSystem,
  NoiseImpactSourceFormula,
  SourceLevelMode,
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
// Small bubble for section actions (Clear, Reset) -- same look as the
// Analyse / All traffic / Clear buttons in the icon bar.
// Bold heading for each Source-tab section (Peak SPL, Cumulative SEL, Noise
// mitigation) -- same text as SectionToggle's title.
const sectionTitleClass = "text-[13px] font-semibold text-slate-600 dark:text-slate-300";
// Colour for worked-out values (calculated Peak SPL, mitigated levels), so
// they read apart from the numbers typed in the boxes (slate-700 /
// slate-200) -- a mid grey, one step lighter in each mode.
const resultTextClass = "text-slate-500 dark:text-slate-400";
// Amber bar for the Source tab's warnings (inputs outside a reference's
// ranges, a peak SPL reference with no SEL formula).
const warningBarClass =
  "text-[11px] leading-relaxed text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-md px-2 py-1.5";
const pillButtonClass =
  "px-2 py-0.5 rounded-full border border-slate-300 dark:border-slate-600 text-[10px] text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition active:scale-95";

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
  // Leave out when a header above already names the list (Metrics, whose
  // collapsible header carries the label and count) -- drops this header row.
  label?: string;
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
      {label !== undefined && (
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
      )}
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
  open,
  onToggle,
}: {
  options: NoiseImpactOptions;
  info: NoiseImpactInfo;
  metrics: string[];
  pairs: string[];
  setPairs: (v: string[]) => void;
  // Open by default; the count keeps picks visible while folded.
  open: boolean;
  onToggle: () => void;
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
  // Grey cells only appear once a metric is unticked -- the key below only
  // explains them then.
  const anyGreyed = options.hearing_groups.some((hg) =>
    impacts.some(
      (it) => pairMetrics(options.thresholds, hg, it).length > 0 && !available(hg, it)
    )
  );

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
          title={`No ${it} threshold for ${hg}${cite}.`}
          className="inline-block w-5 text-xs text-slate-400 dark:text-slate-500 cursor-help"
        >
          –
        </span>
      );
    }
    if (!available(hg, it)) {
      return (
        <span
          title={`No ${it} ${metrics.join(" and ")} threshold for ${hg}${cite}.`}
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
      <span className="relative inline-block align-middle">
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
        {/* Hangs below the box (absolute) so the box stays centred in the
            row, level with the cells that have no label. */}
        {missing.length > 0 && (
          <span
            title={`No ${it} ${missing.join(" and ")} threshold for ${hg}${cite}, so only ${only.join(" and ")} runs.`}
            className="absolute left-1/2 top-full -translate-x-1/2 whitespace-nowrap text-[9px] leading-tight text-slate-500 dark:text-slate-400 cursor-help"
          >
            {only.map((m) => m.split("_")[0]).join("/")} only
          </span>
        )}
      </span>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 py-1.5">
        <SectionToggle
          open={open}
          onToggle={onToggle}
          title="Thresholds"
          count={
            pairs.length > 0 && (
              <span className="font-normal text-[#7c8ca2]"> ({pairs.length})</span>
            )
          }
        />
        {pairs.length > 0 && (
          <button
            type="button"
            onClick={() => setPairs([])}
            className={pillButtonClass}
          >
            Clear
          </button>
        )}
      </div>
      {open && (
        <>
          <p className="text-[11px] text-[#7c8ca2] leading-relaxed pb-1">
            Click a row or column name to select all.
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
              {groups.map((g, gi) => [
                <tr key={g.label}>
                  {/* No top gap on the first group, so it sits right under
                      the column headings; later groups keep it as a divider. */}
                  <td
                    colSpan={impacts.length + 1}
                    className={`${gi === 0 ? "pt-0" : "pt-2"} pb-0.5 text-[10px] text-[#7c8ca2]`}
                  >
                    {g.label}
                  </td>
                </tr>,
                ...g.options.map((hg) => (
                  <tr key={hg} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <th className="py-1.5 pl-1 text-left font-normal">
                      <button
                        type="button"
                        onClick={() => toggleAll(impacts.map((it) => [hg, it]))}
                        title={hoverText(info.hearing_groups[hg], pickAll)}
                        className="block w-full text-left text-xs leading-snug break-words text-slate-500 dark:text-slate-400 hover:text-[#3d5a80] dark:hover:text-[#98c1d9]"
                      >
                        {hg.replace(/^Fish - /, "")}
                      </button>
                    </th>
                    {impacts.map((it) => (
                      <td key={it} className="py-1.5 text-center align-middle">
                        {cell(hg, it)}
                      </td>
                    ))}
                  </tr>
                )),
              ])}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-[10px] text-[#7c8ca2]">
            <span>– No threshold</span>
            {anyGreyed && (
              <span className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-sm bg-slate-300 dark:bg-slate-600" />
                Not for this metric
              </span>
            )}
            <span>Hover for details</span>
          </div>
        </>
      )}
    </div>
  );
}

// Same limits as analysis/noise_impact.py's CUSTOM_DB_RANGE /
// CUSTOM_NAME_MAX_LEN -- checked here so a mistake shows up while typing;
// the backend checks again.
const CUSTOM_DB_MIN = 100;
const CUSTOM_DB_MAX = 300;
const CUSTOM_NAME_MAX_LEN = 60;
// As in analysis/noise_impact.py: the workbook weights no other metric.
const CUSTOM_WEIGHTED_METRIC = "SEL_cum";
const customRowButtonClass =
  "shrink-0 -my-0.5 w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition";
const METRIC_LABELS: Record<string, string> = {
  SEL_cum: "Cumulative",
  SPL_peak: "Peak",
};
const metricLabel = (m: string) => METRIC_LABELS[m] ?? m;

// The lowest custom colour no threshold in the list is using.
function lowestFreeColor(thresholds: NoiseImpactCustomThreshold[]): number {
  const used = new Set(thresholds.map((t) => t.color_index));
  let colorIndex = 0;
  while (used.has(colorIndex)) colorIndex++;
  return colorIndex;
}

// An imported file's thresholds, or what's wrong with it. Columns are found
// by their heading and others are ignored, so columns can be added to the
// file later without breaking older ones. The checks match the add form's.
// The row numbers count like Excel's, with the heading as row 1. A file with
// no weighting column gives weighting undefined: it says nothing about it.
type ImportedThreshold = Omit<NoiseImpactCustomThreshold, "color_index" | "weighting"> & {
  weighting?: string | null;
};
function readThresholdCsv(
  text: string,
  metricOptions: string[],
  weightings: NoiseImpactCustomWeighting[]
): { thresholds: ImportedThreshold[] } | { error: string } {
  const rows = parseCsv(text);
  const isBlank = (row: string[]) => row.every((cell) => cell.trim() === "");
  const headingRow = rows.findIndex((row) => !isBlank(row));
  const headings = (rows[headingRow] ?? []).map((cell) => cell.trim().toLowerCase());
  const [nameCol, metricCol, dbCol] = CSV_COLUMNS.map((c) => headings.indexOf(c));
  if (nameCol < 0 || metricCol < 0 || dbCol < 0)
    return { error: `Needs columns: ${CSV_COLUMNS.join(", ")}.` };
  const weightingCol = headings.indexOf(CSV_WEIGHTING_COLUMN);

  const thresholds: ImportedThreshold[] = [];
  for (let i = headingRow + 1; i < rows.length; i++) {
    if (isBlank(rows[i])) continue;
    const rowLabel = `Row ${i + 1}:`;
    const name = (rows[i][nameCol] ?? "").trim();
    const metric = (rows[i][metricCol] ?? "").trim();
    // Excel set to some languages, such as French, writes 173,6 for 173.6.
    const value = Number((rows[i][dbCol] ?? "").trim().replace(",", "."));
    // e.g. 173,6 without quotes would otherwise read as 173.
    if (rows[i].slice(headings.length).some((cell) => cell.trim() !== ""))
      return { error: `${rowLabel} more cells than column headings.` };
    if (!name) return { error: `${rowLabel} enter a name.` };
    if (name.length > CUSTOM_NAME_MAX_LEN)
      return { error: `${rowLabel} name is longer than ${CUSTOM_NAME_MAX_LEN} characters.` };
    if (!metricOptions.includes(metric))
      return { error: `${rowLabel} use metric ${metricOptions.join(" or ")}.` };
    if (!(value >= CUSTOM_DB_MIN && value <= CUSTOM_DB_MAX))
      return { error: `${rowLabel} dB must be ${CUSTOM_DB_MIN} to ${CUSTOM_DB_MAX}.` };
    if (thresholds.some((t) => t.name === name && t.metric === metric))
      return { error: `${rowLabel} ${name} already has a ${metricLabel(metric).toLowerCase()} threshold.` };
    const weighting = weightingCol < 0 ? undefined : (rows[i][weightingCol] ?? "").trim() || null;
    if (weighting && !weightings.some((w) => w.hearing_group === weighting))
      return { error: `${rowLabel} unknown weighting.` };
    if (weighting && metric !== CUSTOM_WEIGHTED_METRIC)
      return { error: `${rowLabel} ${metricLabel(metric).toLowerCase()} thresholds are not weighted.` };
    thresholds.push({ name, metric, threshold_db: value, weighting });
  }
  if (thresholds.length === 0) return { error: "This file has no thresholds." };
  return { thresholds };
}

// Foldable section title for the Species tab's four sections (13px bold
// plus the fold arrow). Not the shared CollapsibleHeader, which is a
// smaller sub-section style used app-wide.
function SectionToggle({
  open,
  onToggle,
  title,
  count,
}: {
  open: boolean;
  onToggle: () => void;
  title: string;
  count?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex items-center gap-2 flex-1 text-left"
    >
      <span className={`text-[9px] text-slate-400 dark:text-slate-500 transition-transform duration-150 ${open ? "rotate-90" : ""}`}>▶</span>
      <span className="text-[13px] font-semibold text-slate-600 dark:text-slate-300">
        {title}
        {count}
      </span>
    </button>
  );
}

// User-entered thresholds: a name, a metric, a dB value and optionally one
// of the workbook's hearing weighting curves each. The dB is compared with
// noise weighted by that curve, or unweighted noise without one.
// Run alongside the grid's picks -- see analysis/noise_impact.py's
// _run_custom. A name can have one threshold per metric, like a hearing
// group in the grid. The form below the list both adds a threshold and,
// after a row's pencil is clicked, edits that row.
function CustomThresholds({
  metricOptions,
  weightings,
  site,
  siteFreqHz,
  customThresholds,
  setCustomThresholds,
  open,
  onToggle,
}: {
  metricOptions: string[];
  weightings: NoiseImpactCustomWeighting[];
  // The picked site, for the weighting hint's dB.
  site: string;
  siteFreqHz: number | undefined;
  customThresholds: NoiseImpactCustomThreshold[];
  setCustomThresholds: (v: NoiseImpactCustomThreshold[]) => void;
  // Folded by default -- an optional extra most runs don't need. Added
  // thresholds still run while folded, hence the count in the header.
  open: boolean;
  onToggle: () => void;
}) {
  const [name, setName] = useState("");
  // "" = not chosen yet: Cumulative, once the metric list has loaded.
  const [metric, setMetric] = useState("");
  const [db, setDb] = useState("");
  // "" = none.
  const [weighting, setWeighting] = useState("");
  const [error, setError] = useState<string | null>(null);
  // The row the form is editing; null = the form adds a new one.
  const [editing, setEditing] = useState<NoiseImpactCustomThreshold | null>(null);
  // What the last import did. `list` is the list it left, so the message
  // goes away by itself when the list next changes.
  const [importResult, setImportResult] = useState<{
    message: string;
    isError: boolean;
    list: NoiseImpactCustomThreshold[];
  } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const chosenMetric =
    metric || (metricOptions.includes("SEL_cum") ? "SEL_cum" : metricOptions[0] ?? "");
  const canWeight = chosenMetric === CUSTOM_WEIGHTED_METRIC;
  const chosenWeighting = canWeight ? weighting : "";
  const weightingDb = weightings.find((w) => w.hearing_group === chosenWeighting)?.reduction_db[site];

  function startEditing(t: NoiseImpactCustomThreshold) {
    setEditing(t);
    setName(t.name);
    setMetric(t.metric);
    setDb(String(t.threshold_db));
    setWeighting(t.weighting ?? "");
    setError(null);
    nameRef.current?.focus({ preventScroll: true });
    formRef.current?.scrollIntoView({ block: "nearest" });
  }

  function stopEditing() {
    setEditing(null);
    setName("");
    setMetric("");
    setDb("");
    setWeighting("");
    setError(null);
  }

  // The row being edited went away (its x, Clear or Reset).
  useEffect(() => {
    if (editing && !customThresholds.includes(editing)) stopEditing();
  }, [customThresholds, editing]);

  function submit(e: FormEvent) {
    e.preventDefault();
    // A row being edited doesn't count against its own new values.
    const others = customThresholds.filter((t) => t !== editing);
    const trimmed = name.trim();
    const value = Number(db);
    if (!trimmed) return setError("Enter a name.");
    if (db.trim() === "" || !(value >= CUSTOM_DB_MIN && value <= CUSTOM_DB_MAX))
      return setError(`Enter a threshold between ${CUSTOM_DB_MIN} and ${CUSTOM_DB_MAX} dB.`);
    if (others.some((t) => t.name === trimmed && t.metric === chosenMetric))
      return setError(`${trimmed} already has a ${metricLabel(chosenMetric).toLowerCase()} threshold.`);
    // A new name takes the lowest colour no other name is using; a second
    // threshold for a name already listed shares its colour. An edited row
    // keeps its colour unless that would now mean sharing it with another
    // name (it was renamed away from a name that has another metric).
    let colorIndex = others.find((t) => t.name === trimmed)?.color_index;
    if (colorIndex === undefined) {
      const keepsColor = editing && !others.some((t) => t.color_index === editing.color_index);
      colorIndex = keepsColor ? editing.color_index : lowestFreeColor(others);
    }
    const entry = {
      name: trimmed,
      metric: chosenMetric,
      threshold_db: value,
      weighting: chosenWeighting || null,
      color_index: colorIndex,
    };
    if (editing) {
      setCustomThresholds(customThresholds.map((t) => (t === editing ? entry : t)));
      stopEditing();
      return;
    }
    setCustomThresholds([...customThresholds, entry]);
    setName("");
    setDb("");
    // Not kept like the metric: left on, it would silently weight the next one.
    setWeighting("");
  }

  function exportCsv() {
    const blob = new Blob([thresholdsToCsv(customThresholds)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "custom_thresholds.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // Adds the file's thresholds to the list; one whose name and metric are
  // already listed updates that row's dB and weighting (a file with no
  // weighting column leaves the row's weighting). A file with any bad row changes
  // nothing, so a list is never left half loaded without anyone noticing.
  async function importCsv(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // so picking the same file again still fires
    if (!file) return;
    const fail = (message: string) =>
      setImportResult({ message, isError: true, list: customThresholds });
    let parsed;
    try {
      parsed = readThresholdCsv(decodeCsvBytes(await file.arrayBuffer()), metricOptions, weightings);
    } catch {
      return fail("This file could not be read.");
    }
    if ("error" in parsed) return fail(parsed.error);

    let list = customThresholds;
    let added = 0;
    let updated = 0;
    for (const t of parsed.thresholds) {
      const same = list.find((c) => c.name === t.name && c.metric === t.metric);
      if (same) {
        const newWeighting = t.weighting === undefined ? same.weighting : t.weighting;
        if (same.threshold_db === t.threshold_db && same.weighting === newWeighting) continue;
        list = list.map((c) =>
          c === same ? { ...c, threshold_db: t.threshold_db, weighting: newWeighting } : c
        );
        updated++;
      } else {
        const colorIndex = list.find((c) => c.name === t.name)?.color_index ?? lowestFreeColor(list);
        list = [...list, { ...t, weighting: t.weighting ?? null, color_index: colorIndex }];
        added++;
      }
    }
    const counts = [added > 0 && `${added} added`, updated > 0 && `${updated} updated`].filter(Boolean);
    setCustomThresholds(list);
    setImportResult({
      message: counts.length > 0 ? `${counts.join(", ")}.` : "No changes.",
      isError: false,
      list,
    });
  }

  return (
    <div>
      <div className="flex items-center gap-2 py-1.5">
        <SectionToggle
          open={open}
          onToggle={onToggle}
          title="Custom thresholds"
          count={
            customThresholds.length > 0 && (
              <span className="font-normal text-[#7c8ca2]"> ({customThresholds.length})</span>
            )
          }
        />
        {customThresholds.length > 0 && (
          <button
            type="button"
            onClick={() => setCustomThresholds([])}
            className={pillButtonClass}
          >
            Clear
          </button>
        )}
      </div>
      {open && (
        <>
          <p className="text-[11px] text-[#7c8ca2] leading-relaxed pb-1.5">
            Not affected by the Metrics setting.
          </p>
          {customThresholds.length > 0 && (
            <ul className="flex flex-col gap-1 pb-2">
              {customThresholds.map((t, i) => (
                <li
                  key={`${t.name}|${t.metric}`}
                  className={`px-2.5 py-1 rounded-md bg-slate-50 dark:bg-slate-800 text-xs ${
                    t === editing ? "ring-1 ring-inset ring-[#98c1d9]" : ""
                  }`}
                >
                  <span className="flex items-start gap-px">
                    <span className="flex-1 min-w-0 pr-1 break-words text-slate-700 dark:text-slate-200">
                      {t.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => startEditing(t)}
                      aria-label={`Edit ${t.name} ${metricLabel(t.metric).toLowerCase()} threshold`}
                      title="Edit"
                      className={customRowButtonClass}
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomThresholds(customThresholds.filter((_, j) => j !== i))}
                      aria-label={`Remove ${t.name} ${metricLabel(t.metric).toLowerCase()} threshold`}
                      title="Remove"
                      className={customRowButtonClass}
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="6" y1="6" x2="18" y2="18" />
                        <line x1="18" y1="6" x2="6" y2="18" />
                      </svg>
                    </button>
                  </span>
                  <span className="block text-[11px] text-[#7c8ca2]">
                    {metricLabel(t.metric)} ({t.metric}) · {t.threshold_db} dB
                  </span>
                  {t.weighting && (
                    <span className="block text-[11px] text-[#7c8ca2]">Weighted: {t.weighting}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <form ref={formRef} onSubmit={submit} className="flex flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">Name</span>
              <input
                ref={nameRef}
                type="text"
                value={name}
                maxLength={CUSTOM_NAME_MAX_LEN}
                placeholder="e.g. whale"
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
                    {metricLabel(m)} ({m})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">Weighting</span>
              <select
                value={chosenWeighting}
                disabled={!canWeight}
                onChange={(e) => {
                  setWeighting(e.target.value);
                  setError(null);
                }}
                className={`${smallInputClass} ${canWeight ? "cursor-pointer" : "opacity-60"}`}
              >
                <option value="">None</option>
                {weightings.map((w) => (
                  <option key={w.hearing_group} value={w.hearing_group}>
                    {w.hearing_group}
                  </option>
                ))}
              </select>
              {!canWeight && (
                <span className="text-[11px] text-[#7c8ca2]">
                  {metricLabel(chosenMetric)} thresholds are not weighted.
                </span>
              )}
              {weightingDb !== undefined && (
                <span className="text-[11px] text-[#7c8ca2]">
                  Lowers the noise by {weightingDb.toFixed(1)} dB at {siteFreqHz} Hz.
                </span>
              )}
            </label>
            <div className="flex items-end gap-2">
              <label className="flex flex-col gap-1 flex-1 min-w-0">
                <span className="text-xs text-slate-500 dark:text-slate-400">dB</span>
                <input
                  type="number"
                  value={db}
                  step={0.1}
                  placeholder="e.g. 162.5"
                  onChange={(e) => {
                    setDb(e.target.value);
                    setError(null);
                  }}
                  className={`${smallInputClass} w-full`}
                />
              </label>
              {editing && (
                <button
                  type="button"
                  onClick={stopEditing}
                  className="shrink-0 px-2 py-1.5 rounded-md border border-slate-300 dark:border-slate-600 text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition active:scale-95"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                className="shrink-0 px-3 py-1.5 rounded-md bg-[#3d5a80] text-white text-xs hover:bg-[#293241] transition active:scale-95"
              >
                {editing ? "Save" : "Add"}
              </button>
            </div>
            {error && (
              <span className="text-[11px] text-red-600 dark:text-red-400">{error}</span>
            )}
          </form>
          <div className="flex items-center gap-2 pt-2">
            <button type="button" onClick={() => fileRef.current?.click()} className={pillButtonClass}>
              Import CSV
            </button>
            {customThresholds.length > 0 && (
              <button type="button" onClick={exportCsv} className={pillButtonClass}>
                Export CSV
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={importCsv}
              className="hidden"
            />
          </div>
          {importResult?.list === customThresholds && (
            <div className={`pt-1 text-[11px] ${importResult.isError ? "text-red-600 dark:text-red-400" : "text-[#7c8ca2]"}`}>
              <div>{importResult.message}</div>
              {importResult.isError && <div>Nothing was imported.</div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Noise mitigation (Source tab): pick a system, then a slider sets how well
// it works, from the low end to the high end of its published ranges. The
// dB it takes off and the source levels the model will get are shown as
// the slider moves.
function MitigationField({
  systems,
  system,
  setSystem,
  level,
  setLevel,
  splPeak,
  selSingleStrike,
}: {
  systems: NoiseImpactMitigationSystem[];
  system: string;
  setSystem: (v: string) => void;
  level: number;
  setLevel: (v: number) => void;
  // null while "Calculate" has no result yet.
  splPeak: number | null;
  selSingleStrike: number | null;
}) {
  const picked = systems.find((m) => m.key === system);
  const cut = picked && mitigationReductions(picked, level);
  return (
    <div className="flex flex-col gap-2 mt-2 pt-2.5 border-t border-slate-100 dark:border-slate-800">
      <label className="flex flex-col gap-2">
        <span className={sectionTitleClass}>Noise mitigation</span>
        <select
          value={system}
          onChange={(e) => setSystem(e.target.value)}
          className={`${smallInputClass} cursor-pointer`}
        >
          <option value="">None</option>
          {systems.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      {picked && cut && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Effectiveness
            </span>
            <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
              −{cut.il_peak_db} dB peak · −{cut.il_sel_db} dB SEL
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(level * 100)}
            onChange={(e) => setLevel(Number(e.target.value) / 100)}
            aria-label="Effectiveness"
            className="panel-slider w-full"
          />
          <div className="flex justify-between text-[11px] text-[#7c8ca2]">
            <span>
              Low (−{picked.il_peak_db[0]} / −{picked.il_sel_db[0]})
            </span>
            <span>
              High (−{picked.il_peak_db[1]} / −{picked.il_sel_db[1]})
            </span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 rounded-md px-2 py-1.5 leading-relaxed">
            {/* The source levels the model gets: the inputs minus the cut. */}
            Mitigated:{" "}
            <span className={`font-semibold whitespace-nowrap ${resultTextClass}`}>
              {splPeak === null ? "–" : Math.round((splPeak - cut.il_peak_db) * 10) / 10} dB peak ·{" "}
              {selSingleStrike === null ? "–" : Math.round((selSingleStrike - cut.il_sel_db) * 10) / 10} dB SEL
            </span>
          </div>
          {picked.current_sensitive && (
            <p className="text-[11px] text-[#7c8ca2] leading-relaxed">
              Bubble curtains work less well in strong currents.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// A source level (Source tab: Peak SPL, SEL / strike): typed in ("Enter
// value"), or worked out from its own hammer energy and pile diameter with a
// published formula ("Calculate"),
// which shows its result; clicking the result row (closed by default)
// shows the formula with the numbers in it and the ranges the formula was
// fitted on (it still runs outside them).
// "Compare references" (closed by default) lists every formula's result
// for the same hammer and pile, to show how much they disagree; clicking a
// row picks that reference (the model runs with the picked one alone). When
// energy or diameter is outside the picked reference's ranges, a warning
// bar says which, and how many other references do cover them.
function SourceLevelField({
  title,
  levelLabel,
  formulas,
  mode,
  setMode,
  value,
  setValue,
  reference,
  setReference,
  energyKj,
  setEnergyKj,
  diameterM,
  setDiameterM,
  notice,
}: {
  // Section heading, and the name of the level ("SEL / strike").
  title: string;
  levelLabel: string;
  formulas: NoiseImpactSourceFormula[];
  mode: SourceLevelMode;
  setMode: (v: SourceLevelMode) => void;
  value: number;
  setValue: (v: number) => void;
  reference: string;
  setReference: (v: string) => void;
  energyKj: number;
  setEnergyKj: (v: number) => void;
  diameterM: number;
  setDiameterM: (v: number) => void;
  // An extra warning shown in "Calculate" mode under the result, above the
  // range warning (two lines: what, and what it means), or null for none.
  notice?: { title: string; hint: string } | null;
}) {
  const picked = formulas.find((f) => f.key === reference);
  const result = picked ? levelFromFormula(picked, energyKj, diameterM) : null;
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  // Every formula's result, and whether energy and diameter lie inside
  // the ranges it was fitted on (⚠ when not). Only used once result is
  // set, so energy and diameter are above 0 and each value is a number.
  const compared = formulas.map((f) => ({
    formula: f,
    db: levelFromFormula(f, energyKj, diameterM) ?? 0,
    inRange:
      f.energy_kj[0] <= energyKj && energyKj <= f.energy_kj[1] &&
      f.diameter_m[0] <= diameterM && diameterM <= f.diameter_m[1],
  }));
  const comparedDbs = compared.map((c) => c.db);
  // What the warning bar names: the picked reference's inputs that are
  // outside its ranges, and how many other references cover both inputs.
  const energyOut =
    !!picked && (energyKj < picked.energy_kj[0] || energyKj > picked.energy_kj[1]);
  const diameterOut =
    !!picked && (diameterM < picked.diameter_m[0] || diameterM > picked.diameter_m[1]);
  const othersCovering = compared.filter((c) => c.inRange && c.formula.key !== reference).length;
  const modes: { id: SourceLevelMode; label: string }[] = [
    { id: "value", label: "Enter value" },
    { id: "formula", label: "Calculate" },
  ];
  return (
    <div className="flex flex-col gap-2">
      <span className={sectionTitleClass}>{title}</span>
      <div className="flex p-0.5 rounded-md bg-slate-100 dark:bg-slate-800">
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            aria-pressed={mode === m.id}
            className={`flex-1 py-1 rounded text-[11px] transition active:scale-95 ${
              mode === m.id
                ? "bg-white dark:bg-slate-700 text-[#3d5a80] dark:text-[#98c1d9] font-semibold shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      {mode === "value" ? (
        <NumberField label={`${levelLabel} (dB)`} value={value} onChange={setValue} small />
      ) : (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Reference
            </span>
            <select
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className={`${smallInputClass} cursor-pointer`}
            >
              {formulas.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <NumberField
            label="Hammer energy (kJ)"
            value={energyKj}
            onChange={setEnergyKj}
            step={100}
            small
          />
          <NumberField
            label="Pile diameter (m)"
            value={diameterM}
            onChange={setDiameterM}
            step={0.1}
            small
          />
          {picked && (
            <div className="text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 rounded-md px-2 py-1.5 leading-relaxed">
              {result === null ? (
                <span className="text-red-600 dark:text-red-400">
                  {!(energyKj > 0) && !(diameterM > 0)
                    ? "Hammer energy and pile diameter must be greater than 0."
                    : !(energyKj > 0)
                      ? "Hammer energy must be greater than 0 kJ."
                      : "Pile diameter must be greater than 0 m."}
                </span>
              ) : (
                // Label left, value right -- same look as the mitigation
                // "Effectiveness" row.
                <button
                  type="button"
                  onClick={() => setDetailsOpen((p) => !p)}
                  aria-expanded={detailsOpen}
                  className="w-full flex items-baseline justify-between gap-2 text-left hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <span className="flex items-center gap-2 text-xs">
                    <span className={`text-[9px] text-slate-400 dark:text-slate-500 transition-transform duration-150 ${detailsOpen ? "rotate-90" : ""}`}>▶</span>
                    {levelLabel}
                  </span>
                  <span className={`text-[13px] font-medium ${resultTextClass}`}>
                    {result.toFixed(1)} dB
                  </span>
                </button>
              )}
              {(result === null || detailsOpen) && (
                <div>
                  {result !== null && (
                    <>
                      = {picked.a} + {picked.b_e}·log({energyKj}) + {picked.c_d}·log({diameterM})
                      <br />
                    </>
                  )}
                  Reference covers {picked.diameter_m[0]}–{picked.diameter_m[1]} m,{" "}
                  {picked.energy_kj[0]}–{picked.energy_kj[1]} kJ
                </div>
              )}
            </div>
          )}
          {notice && (
            <div className={warningBarClass}>
              ⚠ {notice.title}
              <span className="block mt-0.5 text-amber-700 dark:text-amber-400">{notice.hint}</span>
            </div>
          )}
          {picked && result !== null && (energyOut || diameterOut) && (
            <div className={warningBarClass}>
              ⚠{" "}
              {diameterOut && (
                <>
                  Pile diameter <span className="font-semibold">{diameterM} m</span>
                </>
              )}
              {diameterOut && energyOut && " and hammer energy "}
              {!diameterOut && energyOut && "Hammer energy "}
              {energyOut && <span className="font-semibold">{energyKj} kJ</span>}{" "}
              {diameterOut && energyOut ? "are" : "is"} outside this reference's range (
              {[
                diameterOut && `${picked.diameter_m[0]}–${picked.diameter_m[1]} m`,
                energyOut && `${picked.energy_kj[0]}–${picked.energy_kj[1]} kJ`,
              ]
                .filter(Boolean)
                .join(", ")}
              ).
              <span className="block mt-0.5 text-amber-700 dark:text-amber-400">
                {othersCovering === 0
                  ? "No reference covers these inputs."
                  : `${othersCovering} other reference${othersCovering === 1 ? " covers" : "s cover"} these inputs.`}
              </span>
            </div>
          )}
          {result !== null && (
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => setCompareOpen((p) => !p)}
                aria-expanded={compareOpen}
                className="flex items-center gap-2 self-start text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <span className={`text-[9px] text-slate-400 dark:text-slate-500 transition-transform duration-150 ${compareOpen ? "rotate-90" : ""}`}>▶</span>
                Compare references
              </button>
              {compareOpen && (
                <>
                  <div className="flex flex-col text-[11px]">
                    {compared.map(({ formula, db, inRange }) => (
                      <button
                        key={formula.key}
                        type="button"
                        onClick={() => setReference(formula.key)}
                        aria-pressed={formula.key === reference}
                        title={formula.key === reference ? undefined : "Use this reference"}
                        className={`flex justify-between gap-2 px-1 py-0.5 rounded text-left transition ${
                          formula.key === reference
                            ? "bg-[#e0ecf5] dark:bg-slate-700 font-semibold"
                            : "hover:bg-slate-100 dark:hover:bg-slate-800"
                        } ${
                          inRange
                            ? formula.key === reference
                              ? "text-[#1e3a5f] dark:text-slate-100"
                              : "text-slate-600 dark:text-slate-300"
                            : "text-amber-700 dark:text-amber-400"
                        }`}
                      >
                        <span>
                          {formula.label}
                          {!inRange && " ⚠"}
                        </span>
                        <span className="tabular-nums whitespace-nowrap">{db.toFixed(1)} dB</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-[#7c8ca2] leading-relaxed">
                    Spread {Math.min(...comparedDbs).toFixed(1)}–
                    {Math.max(...comparedDbs).toFixed(1)} dB.
                    {compared.some((c) => !c.inRange) &&
                      " ⚠ = outside that reference's pile or energy range."}
                  </p>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step,
  small,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  // 12px text to match its label (see smallInputClass).
  small?: boolean;
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
        className={small ? smallInputClass : inputClass}
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
  peakSplMode,
  setPeakSplMode,
  peakSplReference,
  setPeakSplReference,
  peakEnergyKj,
  setPeakEnergyKj,
  peakDiameterM,
  setPeakDiameterM,
  peakSplUsed,
  selSingleStrike,
  setSelSingleStrike,
  selMode,
  setSelMode,
  selReference,
  setSelReference,
  selEnergyKj,
  setSelEnergyKj,
  selDiameterM,
  setSelDiameterM,
  selUsed,
  syncCalculation,
  onToggleSyncCalculation,
  nStrikesPerPile,
  setNStrikesPerPile,
  nPiles,
  assessmentPeriodHours,
  mitigationSystem,
  setMitigationSystem,
  mitigationLevel,
  setMitigationLevel,
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
  peakSplMode: SourceLevelMode;
  setPeakSplMode: (v: SourceLevelMode) => void;
  peakSplReference: string;
  setPeakSplReference: (v: string) => void;
  peakEnergyKj: number;
  setPeakEnergyKj: (v: number) => void;
  peakDiameterM: number;
  setPeakDiameterM: (v: number) => void;
  // What the model gets: splPeak, or the formula's result (null if none).
  peakSplUsed: number | null;
  selSingleStrike: number;
  setSelSingleStrike: (v: number) => void;
  selMode: SourceLevelMode;
  setSelMode: (v: SourceLevelMode) => void;
  selReference: string;
  setSelReference: (v: string) => void;
  selEnergyKj: number;
  setSelEnergyKj: (v: number) => void;
  selDiameterM: number;
  setSelDiameterM: (v: number) => void;
  // The same for SEL / strike.
  selUsed: number | null;
  syncCalculation: boolean;
  onToggleSyncCalculation: () => void;
  nStrikesPerPile: number;
  setNStrikesPerPile: (v: number) => void;
  nPiles: number;
  assessmentPeriodHours: number;
  mitigationSystem: string;
  setMitigationSystem: (v: string) => void;
  mitigationLevel: number;
  setMitigationLevel: (v: number) => void;
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
  const [depthOpen, setDepthOpen] = useState(true);
  const [thresholdsOpen, setThresholdsOpen] = useState(true);
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);

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
  // The model's depths run from 0 at the surface downwards (negative).
  // Positive values match no depth at all and quietly give 0 km2 zones,
  // so they're blocked here; min > max is rejected by the backend anyway.
  const depthError =
    depthMin > 0 || depthMax > 0
      ? "Depths must be negative (below the surface)."
      : depthMin > depthMax
        ? "Depth min must be smaller than Depth max."
        : null;
  // A peak SPL reference with no SEL formula (Reinhall & Dahl): remind the
  // user that SEL can't use it, and say what SEL uses instead.
  const peakReferenceLabel = options.peak_spl_formulas.find((f) => f.key === peakSplReference)?.label;
  const selReferenceLabel = options.sel_strike_formulas.find((f) => f.key === selReference)?.label;
  const peakNoSelNotice =
    peakReferenceLabel && !options.sel_strike_formulas.some((f) => f.key === peakSplReference)
      ? {
          title: `${peakReferenceLabel} has no SEL formula.`,
          hint:
            selMode === "formula" && selReferenceLabel
              ? `SEL uses ${selReferenceLabel}.`
              : "SEL is entered as a value.",
        }
      : null;
  const splPeakInvalid = !(peakSplUsed !== null && peakSplUsed > 0);
  const selSingleStrikeInvalid = !(selUsed !== null && selUsed > 0);
  const nStrikesPerPileInvalid = !(nStrikesPerPile > 0);
  const nPilesInvalid = !(nPiles > 0);
  const assessmentPeriodInvalid = !(assessmentPeriodHours > 0);

  const pileInvalid =
    splPeakInvalid ||
    selSingleStrikeInvalid ||
    nStrikesPerPileInvalid ||
    nPilesInvalid ||
    assessmentPeriodInvalid;
  const speciesInvalid = pairsInvalid || metricsInvalid || depthError !== null;
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
  if (depthError) missing.push("a valid depth range");
  if (splPeakInvalid)
    missing.push(peakSplMode === "value" ? "a peak SPL" : "valid peak SPL inputs");
  if (selSingleStrikeInvalid)
    missing.push(selMode === "value" ? "an SEL/strike" : "valid SEL inputs");
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
            <button
              type="button"
              role="switch"
              aria-checked={syncCalculation}
              onClick={onToggleSyncCalculation}
              className="flex items-center justify-between gap-2 text-left"
            >
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Sync SPL and SEL calculation
              </span>
              <span
                className={`relative shrink-0 w-8 h-[18px] rounded-full border-2 transition-colors ${
                  syncCalculation ? "border-emerald-500" : "border-slate-400 dark:border-slate-500"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full shadow transition-transform ${
                    syncCalculation
                      ? "bg-emerald-500 translate-x-[14px]"
                      : "bg-slate-400 dark:bg-slate-500 translate-x-0"
                  }`}
                />
              </span>
            </button>
            <SourceLevelField
              title="Peak SPL"
              levelLabel="Peak SPL"
              formulas={options.peak_spl_formulas}
              mode={peakSplMode}
              setMode={setPeakSplMode}
              value={splPeak}
              setValue={setSplPeak}
              reference={peakSplReference}
              setReference={setPeakSplReference}
              energyKj={peakEnergyKj}
              setEnergyKj={setPeakEnergyKj}
              diameterM={peakDiameterM}
              setDiameterM={setPeakDiameterM}
              notice={peakNoSelNotice}
            />
            <div className="flex flex-col gap-2 mt-2 pt-2.5 border-t border-slate-100 dark:border-slate-800">
              <SourceLevelField
                title="Cumulative SEL"
                levelLabel="SEL / strike"
                formulas={options.sel_strike_formulas}
                mode={selMode}
                setMode={setSelMode}
                value={selSingleStrike}
                setValue={setSelSingleStrike}
                reference={selReference}
                setReference={setSelReference}
                energyKj={selEnergyKj}
                setEnergyKj={setSelEnergyKj}
                diameterM={selDiameterM}
                setDiameterM={setSelDiameterM}
              />
              <NumberField
                label="Strikes / pile"
                value={nStrikesPerPile}
                onChange={setNStrikesPerPile}
                small
              />
            </div>
            <MitigationField
              systems={options.mitigation_systems}
              system={mitigationSystem}
              setSystem={setMitigationSystem}
              level={mitigationLevel}
              setLevel={setMitigationLevel}
              splPeak={peakSplUsed}
              selSingleStrike={selUsed}
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
            {/* Depth applies to both the grid and custom thresholds, so it
                comes first. Metrics only changes the grid, so it sits right
                under it; custom thresholds are the optional extra, last. */}
            <div>
              <div className="flex items-center gap-2 py-1.5">
                <SectionToggle
                  open={depthOpen}
                  onToggle={() => setDepthOpen((p) => !p)}
                  title="Exposure depth"
                />
                {(depthMin !== DEFAULT_DEPTH_MIN || depthMax !== DEFAULT_DEPTH_MAX) && (
                  <button
                    type="button"
                    onClick={() => {
                      setDepthMin(DEFAULT_DEPTH_MIN);
                      setDepthMax(DEFAULT_DEPTH_MAX);
                    }}
                    className={pillButtonClass}
                  >
                    Reset
                  </button>
                )}
              </div>
              {depthOpen && (
                <>
                  <p className="text-[11px] text-[#7c8ca2] leading-relaxed pb-1.5">
                    Noise is averaged over this depth range.
                  </p>
                  <div className="grid grid-cols-2 gap-2.5">
                    <NumberField
                      label="Depth min (m)"
                      value={depthMin}
                      onChange={setDepthMin}
                      step={0.1}
                      small
                    />
                    <NumberField
                      label="Depth max (m)"
                      value={depthMax}
                      onChange={setDepthMax}
                      step={0.1}
                      small
                    />
                  </div>
                </>
              )}
              {/* Outside the fold so a bad value can't hide. */}
              {depthError && (
                <span className="block pt-1.5 text-[11px] text-red-600 dark:text-red-400">
                  {depthError}
                </span>
              )}
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <ThresholdGrid
                options={options}
                info={info}
                metrics={metrics}
                pairs={pairs}
                setPairs={setPairs}
                open={thresholdsOpen}
                onToggle={() => setThresholdsOpen((p) => !p)}
              />
            </div>
            <div className="mt-1 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 py-1.5">
                <SectionToggle
                  open={metricsOpen}
                  onToggle={() => setMetricsOpen((p) => !p)}
                  title="Metrics"
                />
                <span className="text-[11px] text-[#7c8ca2]">
                  {metrics.length}/{options.metrics.length}
                </span>
              </div>
              {metricsOpen && (
                <>
                  <p className="text-[11px] text-[#7c8ca2] leading-relaxed pb-1">
                    Both metrics run. The larger zone is shown, the smaller is
                    hidden in the results. Untick one to run only the other.
                  </p>
                  <CheckboxList
                    options={options.metrics}
                    selected={metrics}
                    onToggle={onToggleMetric}
                    hideSelectAll
                  />
                </>
              )}
            </div>
            <div className="mt-1 pt-2 border-t border-slate-100 dark:border-slate-800">
              <CustomThresholds
                metricOptions={options.metrics}
                weightings={options.custom_weightings}
                site={site}
                siteFreqHz={siteMeta?.src_freq}
                customThresholds={customThresholds}
                setCustomThresholds={setCustomThresholds}
                open={customOpen}
                onToggle={() => setCustomOpen((p) => !p)}
              />
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

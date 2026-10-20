import { useEffect, useState } from "react";

export interface NoiseImpactSite {
  src_lon: number;
  src_lat: number;
  src_depth: number;
  src_freq: number;
  noise_date: string;
}

// One row of the workbook's Thresholds sheet that the package can run
// (see analysis/noise_impact.py's _list_thresholds).
export interface NoiseImpactThreshold {
  hearing_group: string;
  impact: string;
  metric: string;
  reference: string;
}

export interface NoiseImpactOptions {
  hearing_groups: string[];
  impact_types: string[];
  metrics: string[];
  thresholds: NoiseImpactThreshold[];
}

// Hover-tooltip text, keyed by the same strings as NoiseImpactOptions --
// sourced from the thresholds workbook's own Info sheet (see
// analysis/noise_impact.py's list_parameter_info), not duplicated here.
export interface NoiseImpactInfo {
  hearing_groups: Record<string, string>;
  impact_types: Record<string, string>;
}

export interface NoiseImpactZone {
  hearing_group: string;
  impact: string;
  metric: string;
  threshold_db: number;
  area_km2: number;
  // Mean/std of the zone boundary's raw per-azimuth distances, in km --
  // same "Radius = mean ± std" convention ns_pile_driving_noise_mapping's
  // own reference plots use (not an equivalent-circle-from-area estimate).
  radius_km: number;
  radius_std_km: number;
  geometry: object | null; // GeoJSON Polygon, or null if the threshold was never exceeded
  // Custom thresholds only (impact "Custom", hearing_group = the user's
  // name): which distinct custom name this is, in order -- picks its colour
  // (see zoneColor). null for workbook thresholds.
  custom_index: number | null;
}

// A user-entered threshold (Species tab), sent with the run and compared
// with unweighted noise -- see analysis/noise_impact.py's _run_custom.
export interface NoiseImpactCustomThreshold {
  name: string;
  metric: string;
  threshold_db: number;
}

export interface NoiseImpactResult {
  source: { lon: number; lat: number };
  zones: NoiseImpactZone[];
}

// Download formats -- keys of analysis/noise_impact.py's EXPORT_FORMATS.
export const EXPORT_FORMATS = [
  { value: "shp", label: "Shapefile (.shp)" },
  { value: "gpkg", label: "GeoPackage (.gpkg)" },
] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number]["value"];

export function zoneKey(z: { hearing_group: string; impact: string; metric: string }): string {
  return `${z.hearing_group}|${z.impact}|${z.metric}`;
}

// A threshold-grid cell: one hearing group + one impact type.
export function pairKey(hearingGroup: string, impact: string): string {
  return `${hearingGroup}|${impact}`;
}

// Metrics the workbook defines a threshold for, for one grid cell.
export function pairMetrics(
  thresholds: NoiseImpactThreshold[],
  hearingGroup: string,
  impact: string
): string[] {
  return thresholds
    .filter((t) => t.hearing_group === hearingGroup && t.impact === impact)
    .map((t) => t.metric);
}

// A picked cell only runs if it has a threshold for a ticked metric -- a
// cell that doesn't stays picked (so re-ticking the metric brings it
// back) but is left out of the run.
export function runnablePairs(
  thresholds: NoiseImpactThreshold[],
  pairs: string[],
  metrics: string[]
): string[] {
  const runnable = new Set(
    thresholds
      .filter((t) => metrics.includes(t.metric))
      .map((t) => pairKey(t.hearing_group, t.impact))
  );
  return pairs.filter((p) => runnable.has(p));
}

// Owns state for the noise-impact feature: the "Impacts" side panel, its
// parameter-input modal (Scenario/Pile driving/Species cards), and the run
// against POST /api/noise-impact/compute. Site is a dropdown, not a map
// click -- each site is a transmission-loss model already run offline for
// a fixed source location (see analysis/noise_impact.py's module
// docstring), so there's no map interaction here to coordinate with
// measuring/drawing.
// Negative metres below the surface (0 at the surface) -- matches the
// underlying model's own depth coordinate convention, see main.py's
// NoiseImpactRequest.depth_range. Exported for the panel's depth Reset.
export const DEFAULT_DEPTH_MIN = -40;
export const DEFAULT_DEPTH_MAX = -0.01;

export function useNoiseImpact(apiBase: string) {
  const [showImpactsPanel, setShowImpactsPanel] = useState(false);
  const [showParamsPanel, setShowParamsPanel] = useState(false);

  // Params tracks Impacts open/closed exactly -- opening Impacts opens
  // Params too (so there's always something to configure/run right away
  // instead of an extra click), and it closes right back down whenever
  // Impacts does, so it never lingers open on its own once its parent
  // panel is gone.
  useEffect(() => {
    setShowParamsPanel(showImpactsPanel);
  }, [showImpactsPanel]);

  // A direct show/hide switch for the noise-impact map visuals (zones,
  // source star, WEA outline -- see the layer built in Map.tsx), fully
  // independent of which side panel happens to be open. Simpler than an
  // earlier "isolated mode" version of this that tied visibility to
  // showImpactsPanel and tried to keep other map layers hidden while it
  // was active -- that whole mechanic's gone now; other features (vessel/
  // mooring/region layers, panel switching) just always work normally.
  const [showNoiseImpact, setShowNoiseImpact] = useState(true);

  const [sites, setSites] = useState<Record<string, NoiseImpactSite>>({});
  const [options, setOptions] = useState<NoiseImpactOptions>({
    hearing_groups: [],
    impact_types: [],
    metrics: [],
    thresholds: [],
  });
  const [info, setInfo] = useState<NoiseImpactInfo>({
    hearing_groups: {},
    impact_types: {},
  });

  const [site, setSite] = useState("");
  // Picked threshold-grid cells, as pairKey strings.
  const [pairs, setPairs] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<string[]>([]);
  const [customThresholds, setCustomThresholds] = useState<NoiseImpactCustomThreshold[]>([]);
  const DEFAULT_SPL_PEAK = 220;
  const DEFAULT_SEL_SINGLE_STRIKE = 200;
  const DEFAULT_N_STRIKES_PER_PILE = 5000;
  // Backend defaults (main.py's NoiseImpactRequest) -- now sent explicitly
  // instead of relying on the backend filling them in, so they're
  // adjustable like every other pile-driving param.
  const DEFAULT_N_PILES = 1;
  const DEFAULT_ASSESSMENT_PERIOD_HOURS = 24;
  const [depthMin, setDepthMin] = useState(DEFAULT_DEPTH_MIN);
  const [depthMax, setDepthMax] = useState(DEFAULT_DEPTH_MAX);
  const [splPeak, setSplPeak] = useState(DEFAULT_SPL_PEAK);
  const [selSingleStrike, setSelSingleStrike] = useState(DEFAULT_SEL_SINGLE_STRIKE);
  const [nStrikesPerPile, setNStrikesPerPile] = useState(DEFAULT_N_STRIKES_PER_PILE);
  const [nPiles, setNPiles] = useState(DEFAULT_N_PILES);
  const [assessmentPeriodHours, setAssessmentPeriodHours] = useState(DEFAULT_ASSESSMENT_PERIOD_HOURS);

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NoiseImpactResult | null>(null);
  // The site `result` was computed for -- NOT the same as `site`, which is
  // just the dropdown's current value and changes the moment the user picks
  // another one. The map/legend read this instead, so switching sites
  // changes nothing on screen until the next Run.
  const [resultSite, setResultSite] = useState("");
  const [visibleZoneKeys, setVisibleZoneKeys] = useState<Set<string>>(new Set());
  // Picked hearing-group/impact-type/metric combos with no matching row
  // in Noise_Impact_Thresholds.xlsx at all -- see the diff in handleRun.
  const [undefinedCombos, setUndefinedCombos] = useState<string[]>([]);
  // The exact request body `result` came from -- like resultSite, so the
  // zones download matches what's on the map even if the inputs were
  // edited after Run.
  const [lastRunRequest, setLastRunRequest] = useState<object | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Populate the Scenario/Species cards from the backend so this never
  // hardcodes a site list or threshold-category list that could drift from
  // analysis/noise_impact.py's SITES dict or the thresholds workbook.
  useEffect(() => {
    fetch(`${apiBase}/api/noise-impact/sites`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Record<string, NoiseImpactSite> | null) => {
        if (!data) return;
        setSites(data);
        setSite((prev) => prev || Object.keys(data)[0] || "");
      })
      .catch(() => {});
    fetch(`${apiBase}/api/noise-impact/options`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: NoiseImpactOptions | null) => {
        if (!data) return;
        // Only populate the option lists (for the checkboxes to render) --
        // leave pairs at its empty-array initial
        // state so nothing is pre-checked; the user picks. Metrics is the
        // one exception: both start selected (see handleRun, which only
        // shows the larger-zone metric per hearing group by default) so
        // the common case needs no setup at all.
        setOptions(data);
        setMetrics((prev) => (prev.length > 0 ? prev : data.metrics));
      })
      .catch(() => {});
    fetch(`${apiBase}/api/noise-impact/info`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: NoiseImpactInfo | null) => {
        if (data) setInfo(data);
      })
      .catch(() => {});
  }, [apiBase]);

  function toggleMetric(value: string) {
    setMetrics((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }
  function toggleZoneVisibility(key: string) {
    setVisibleZoneKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Puts every input field back to its just-loaded state -- site back to
  // the sites list's first entry (same fallback the initial /sites fetch
  // above uses), everything else back to its blank/default value -- and
  // clears whatever Run already produced (zones/source/WEA on the map, the
  // results list, legend, and any error), so Reset is a full "start over".
  function resetParams() {
    setResult(null);
    setResultSite("");
    setVisibleZoneKeys(new Set());
    setUndefinedCombos([]);
    setError(null);
    setLastRunRequest(null);
    setExportError(null);
    setSite(Object.keys(sites)[0] ?? "");
    setPairs([]);
    setMetrics(options.metrics);
    setCustomThresholds([]);
    setDepthMin(DEFAULT_DEPTH_MIN);
    setDepthMax(DEFAULT_DEPTH_MAX);
    setSplPeak(DEFAULT_SPL_PEAK);
    setSelSingleStrike(DEFAULT_SEL_SINGLE_STRIKE);
    setNStrikesPerPile(DEFAULT_N_STRIKES_PER_PILE);
    setNPiles(DEFAULT_N_PILES);
    setAssessmentPeriodHours(DEFAULT_ASSESSMENT_PERIOD_HOURS);
  }

  async function handleRun() {
    const runPairs = runnablePairs(options.thresholds, pairs, metrics).map(
      (p) => p.split("|") as [string, string]
    );
    // Custom thresholds carry their own metric, so they run even with no
    // grid pick or no metric ticked.
    const ready =
      site &&
      (runPairs.length > 0 || customThresholds.length > 0) &&
      splPeak > 0 &&
      selSingleStrike > 0 &&
      nStrikesPerPile > 0 &&
      nPiles > 0 &&
      assessmentPeriodHours > 0;
    if (!ready || running) return;
    setRunning(true);
    setError(null);
    setExportError(null);
    // The package takes hearing-group and impact-type lists and runs every
    // combination of them; `pairs` tells the backend which of those
    // combinations were actually picked (see main.py's NoiseImpactRequest).
    // An empty pairs list (only custom thresholds) skips the workbook run.
    const request = {
      site,
      hearing_groups: [...new Set(runPairs.map(([hg]) => hg))],
      impact_types: [...new Set(runPairs.map(([, it]) => it))],
      pairs: runPairs,
      metrics,
      depth_range: [depthMin, depthMax],
      spl_peak: splPeak,
      sel_single_strike: selSingleStrike,
      n_strikes_per_pile: nStrikesPerPile,
      n_piles: nPiles,
      assessment_period_hours: assessmentPeriodHours,
      custom_thresholds: customThresholds,
    };
    try {
      const res = await fetch(`${apiBase}/api/noise-impact/compute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || `Request failed (${res.status})`);
      }
      const data: NoiseImpactResult = await res.json();
      setResult(data);
      setResultSite(site);
      setLastRunRequest(request);

      // Default visibility: when a hearing-group/impact-type pair has a
      // zone under more than one metric (the common case, since Metrics
      // defaults to both selected -- see the options-fetch effect above),
      // only the larger of the two starts visible, matching the "just
      // show me the worst case" behavior described in the Metrics
      // advanced-parameters note. Every zone still exists in the results
      // list either way -- this only picks what's pre-toggled on; the
      // smaller one is one click away.
      const byGroup = new Map<string, typeof data.zones>();
      data.zones.forEach((z) => {
        const groupKey = `${z.hearing_group}|${z.impact}`;
        const group = byGroup.get(groupKey);
        if (group) group.push(z);
        else byGroup.set(groupKey, [z]);
      });
      const defaultVisible = new Set<string>();
      byGroup.forEach((zonesForGroup) => {
        const largest = zonesForGroup.reduce((a, b) => (b.area_km2 > a.area_km2 ? b : a));
        defaultVisible.add(zoneKey(largest));
      });
      setVisibleZoneKeys(defaultVisible);

      // A picked hearing-group/impact-type/metric combo with no matching
      // row in Noise_Impact_Thresholds.xlsx never appears in data.zones
      // at all -- distinct from a zone that DID compute but found zero
      // exceedance (that's a normal, expected result, shown inline in the
      // panel instead). Combos the workbook leaves out on purpose (e.g.
      // fish TTS has no SPL_peak) are already shown in the threshold
      // grid, so only flag ones the loaded threshold list said exist but
      // didn't come back -- e.g. the workbook changed since the page
      // loaded. Surfaced as an inline panel note (see ImpactsPanel)
      // rather than a blocking alert() -- worth flagging (silently
      // dropping it would be misleading), but not worth interrupting the
      // flow for.
      const expected = new Set(options.thresholds.map((t) => zoneKey(t)));
      const returned = new Set(data.zones.map(zoneKey));
      const missing: string[] = [];
      for (const [hg, it] of runPairs) {
        for (const m of metrics) {
          const key = zoneKey({ hearing_group: hg, impact: it, metric: m });
          if (expected.has(key) && !returned.has(key)) missing.push(`${hg} – ${it} – ${m}`);
        }
      }
      setUndefinedCombos(missing);

      // Params panel stays open (not auto-closed) -- surface results in
      // the Impacts panel underneath while leaving inputs visible/editable
      // for another run, rather than forcing a re-open to tweak anything.
      setShowImpactsPanel(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to compute noise impact.");
    } finally {
      setRunning(false);
    }
  }

  // Downloads the last Run's exceeded zones as a zip (the file in the
  // chosen format + a README), built server-side by
  // ns_pile_driving_noise_mapping's export_hazard_zones (see
  // analysis/noise_impact.py's export_impact).
  async function handleExport(format: ExportFormat) {
    if (!lastRunRequest || exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch(`${apiBase}/api/noise-impact/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...lastRunRequest, format }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || `Download failed (${res.status})`);
      }
      const filename =
        res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ??
        "noise-impact.zip";
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Failed to download zones.");
    } finally {
      setExporting(false);
    }
  }

  return {
    showImpactsPanel, setShowImpactsPanel,
    showParamsPanel, setShowParamsPanel,
    showNoiseImpact, setShowNoiseImpact,
    sites, options, info,
    site, setSite,
    pairs, setPairs,
    metrics, toggleMetric,
    customThresholds, setCustomThresholds,
    depthMin, setDepthMin,
    depthMax, setDepthMax,
    splPeak, setSplPeak,
    selSingleStrike, setSelSingleStrike,
    nStrikesPerPile, setNStrikesPerPile,
    nPiles, setNPiles,
    assessmentPeriodHours, setAssessmentPeriodHours,
    running, error, result, resultSite,
    resetParams,
    visibleZoneKeys, toggleZoneVisibility,
    undefinedCombos,
    handleRun,
    exporting, exportError, handleExport,
  };
}

import { useEffect, useState } from "react";

export interface NoiseImpactSite {
  src_lon: number;
  src_lat: number;
  src_depth: number;
  src_freq: number;
  noise_date: string;
  // True when the backend had no access to the real ~950MB CSnap dataset
  // (/home/shared) and fell back to small synthetic fixture data instead
  // (see analysis/noise_impact.py's module docstring) -- e.g. running
  // locally on a laptop for UI work. Surfaced so fake data is never
  // silently presented as real.
  using_fixture_data: boolean;
}

export interface NoiseImpactOptions {
  hearing_groups: string[];
  impact_types: string[];
  metrics: string[];
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
}

export interface NoiseImpactResult {
  source: { lon: number; lat: number };
  using_fixture_data: boolean;
  zones: NoiseImpactZone[];
}

export function zoneKey(z: { hearing_group: string; impact: string; metric: string }): string {
  return `${z.hearing_group}|${z.impact}|${z.metric}`;
}

// Owns state for the noise-impact feature: the "Impacts" side panel, its
// parameter-input modal (Scenario/Pile driving/Species cards), and the run
// against POST /api/noise-impact/compute. Site is a dropdown, not a map
// click -- each site is a transmission-loss model already run offline for
// a fixed source location (see analysis/noise_impact.py's module
// docstring), so there's no map interaction here to coordinate with
// measuring/drawing.
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
  });

  const [site, setSite] = useState("");
  const [hearingGroups, setHearingGroups] = useState<string[]>([]);
  const [impactTypes, setImpactTypes] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<string[]>([]);
  // Negative metres below the surface (0 at the surface) -- matches the
  // underlying model's own depth coordinate convention, see main.py's
  // NoiseImpactRequest.depth_range.
  const DEFAULT_DEPTH_MIN = -40;
  const DEFAULT_DEPTH_MAX = -0.01;
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
  const [visibleZoneKeys, setVisibleZoneKeys] = useState<Set<string>>(new Set());

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
        // leave hearingGroups/impactTypes at their empty-array initial
        // state so nothing is pre-checked; the user picks. Metrics is the
        // one exception: both start selected (see handleRun, which only
        // shows the larger-zone metric per hearing group by default) so
        // the common case needs no setup at all.
        setOptions(data);
        setMetrics((prev) => (prev.length > 0 ? prev : data.metrics));
      })
      .catch(() => {});
  }, [apiBase]);

  function toggleHearingGroup(value: string) {
    setHearingGroups((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }
  function toggleImpactType(value: string) {
    setImpactTypes((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }
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
  // above uses), everything else back to its blank/default value. Leaves
  // any already-computed result/legend alone; this is a form reset, not a
  // "start over" that would also blow away what Run already produced.
  function resetParams() {
    setSite(Object.keys(sites)[0] ?? "");
    setHearingGroups([]);
    setImpactTypes([]);
    setMetrics(options.metrics);
    setDepthMin(DEFAULT_DEPTH_MIN);
    setDepthMax(DEFAULT_DEPTH_MAX);
    setSplPeak(DEFAULT_SPL_PEAK);
    setSelSingleStrike(DEFAULT_SEL_SINGLE_STRIKE);
    setNStrikesPerPile(DEFAULT_N_STRIKES_PER_PILE);
    setNPiles(DEFAULT_N_PILES);
    setAssessmentPeriodHours(DEFAULT_ASSESSMENT_PERIOD_HOURS);
  }

  async function handleRun() {
    const ready =
      site &&
      hearingGroups.length > 0 &&
      impactTypes.length > 0 &&
      metrics.length > 0 &&
      splPeak > 0 &&
      selSingleStrike > 0 &&
      nStrikesPerPile > 0 &&
      nPiles > 0 &&
      assessmentPeriodHours > 0;
    if (!ready || running) return;
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/noise-impact/compute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site,
          hearing_groups: hearingGroups,
          impact_types: impactTypes,
          metrics,
          depth_range: [depthMin, depthMax],
          spl_peak: splPeak,
          sel_single_strike: selSingleStrike,
          n_strikes_per_pile: nStrikesPerPile,
          n_piles: nPiles,
          assessment_period_hours: assessmentPeriodHours,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || `Request failed (${res.status})`);
      }
      const data: NoiseImpactResult = await res.json();
      setResult(data);

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

  return {
    showImpactsPanel, setShowImpactsPanel,
    showParamsPanel, setShowParamsPanel,
    showNoiseImpact, setShowNoiseImpact,
    sites, options,
    site, setSite,
    hearingGroups, toggleHearingGroup,
    impactTypes, toggleImpactType,
    metrics, toggleMetric,
    depthMin, setDepthMin,
    depthMax, setDepthMax,
    splPeak, setSplPeak,
    selSingleStrike, setSelSingleStrike,
    nStrikesPerPile, setNStrikesPerPile,
    nPiles, setNPiles,
    assessmentPeriodHours, setAssessmentPeriodHours,
    running, error, result,
    resetParams,
    visibleZoneKeys, toggleZoneVisibility,
    handleRun,
  };
}

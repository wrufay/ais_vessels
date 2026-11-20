import { useEffect, useState, type ReactNode } from "react";
import { errorText } from "./FeedbackInbox";

// The Usage tab of the Admin page -- anonymous visit and feature counts from the
// live site, saved by usage.ts. Features are compared by how many visitors used them, not by
// raw clicks, since some (like opening tracks) get clicked far more per visit.
// The visits chart and the feature chart each have their own time frame.

const API = import.meta.env.VITE_API_URL ?? "";
const ONLINE_REFRESH_MS = 30 * 1000;

type Preset = "30" | "90" | "180" | "365" | "custom";

// start and end (YYYY-MM-DD, both included) are only used for a custom range
interface TimeFrame {
  preset: Preset;
  start: string;
  end: string;
}

const PRESETS: [Preset, string][] = [
  ["30", "Last 30 days"],
  ["90", "Last 90 days"],
  ["180", "Last 180 days"],
  ["365", "Last 365 days"],
  ["custom", "Custom range"],
];

const DEFAULT_FRAME: TimeFrame = { preset: "30", start: "", end: "" };

interface Counts {
  visits: number;
  visitors: number;
}

interface Visits {
  today: string;
  start: string;
  end: string;
  step: "day" | "week";
  today_counts: Counts;
  week_counts: Counts;
  range_counts: Counts;
  bars: { start: string; end: string; visits: number }[];
}

interface Features {
  today: string;
  start: string;
  end: string;
  visitors: number;
  features: Record<string, { visitors: number; uses: number }>;
}

// fixed order, grouped by panel, so the list doesn't read as a ranking
const FEATURE_GROUPS: { group: string; items: [string, string][] }[] = [
  { group: "Tracks", items: [["vessel_track", "Vessel track opened"]] },
  {
    group: "Regions",
    items: [
      ["analyse", "Analyse"],
      ["all_traffic", "All traffic"],
      ["heat_map", "Heat map"],
    ],
  },
  { group: "Moorings", items: [["mooring_upload", "Mooring locations uploaded"]] },
  {
    group: "Map",
    items: [
      ["noise_vessel", "Vessel noise layer"],
      ["noise_wind", "Wind noise layer"],
      ["noise_combined", "Combined noise layer"],
    ],
  },
  { group: "Impacts", items: [["impact_run", "Noise impact calculation"]] },
  { group: "Other", items: [["feedback_sent", "Feedback sent"]] },
];

// "2026-11-03" -> a local Date (not UTC, which would shift the day)
function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function shortDate(day: string): string {
  return parseDay(day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// "Last 90 days", or "Sep 1 – Oct 31" for a custom range (with years when not
// this year), from the days the server counted
function frameLabel(frame: TimeFrame, shown: { today: string; start: string; end: string }): string {
  if (frame.preset !== "custom") return PRESETS.find(([p]) => p === frame.preset)![1];
  const year = shown.today.slice(0, 4);
  const withYear = shown.start.slice(0, 4) !== year || shown.end.slice(0, 4) !== year;
  const format = (day: string) =>
    withYear
      ? parseDay(day).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : shortDate(day);
  return `${format(shown.start)} – ${format(shown.end)}`;
}

// "Nov 3 – 9", "Oct 27 – Nov 2", or one day for a week cut to a single day
function barLabel(bar: { start: string; end: string }): string {
  if (bar.start === bar.end) return shortDate(bar.start);
  const sameMonth = bar.start.slice(0, 7) === bar.end.slice(0, 7);
  return `${shortDate(bar.start)} – ${sameMonth ? parseDay(bar.end).getDate() : shortDate(bar.end)}`;
}

// loads one part of the Usage tab for a time frame; keeps showing the last
// numbers while new ones load, and skips a custom range that isn't complete
function useUsage<T>(path: string, frame: TimeFrame, password: string, onAuthFailed: () => void) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const custom = frame.preset === "custom";
  const backwards = custom && frame.start !== "" && frame.end !== "" && frame.start > frame.end;
  const skip = custom && (frame.start === "" || frame.end === "" || backwards);
  const params = custom ? `start=${frame.start}&end=${frame.end}` : `days=${frame.preset}`;

  useEffect(() => {
    if (skip) return;
    let cancelled = false;
    setError(null);
    fetch(`${API}${path}?${params}`, { headers: { "X-Inbox-Password": password } })
      .then(async (r) => {
        if (r.status === 401) {
          onAuthFailed();
          return;
        }
        if (r.status === 400) throw new Error((await r.json()).detail);
        if (!r.ok) throw new Error(`Couldn't load the usage numbers (${r.status}).`);
        const body: T = await r.json();
        if (!cancelled) setData(body);
      })
      .catch((err) => !cancelled && setError(errorText(err)));
    return () => {
      cancelled = true;
    };
  }, [path, params, skip, password, onAuthFailed]);

  return { data, error: backwards ? "The start day is after the end day." : error };
}

// the time frame dropdown in a chart's header, plus the From / to days below it
// for a custom range (which starts from the days the chart showed before)
function FramePicker({
  label,
  frame,
  onChange,
  shown,
}: {
  label: string;
  frame: TimeFrame;
  onChange: (frame: TimeFrame) => void;
  shown: { start: string; end: string } | null;
}) {
  return (
    <select
      aria-label={label}
      value={frame.preset}
      onChange={(e) => {
        const preset = e.target.value as Preset;
        if (preset === "custom" && frame.preset !== "custom") {
          onChange({ preset, start: shown?.start ?? "", end: shown?.end ?? "" });
        } else {
          onChange({ ...frame, preset });
        }
      }}
      className="text-xs text-slate-600 bg-white border border-slate-200 rounded px-2 py-1 hover:border-slate-300 focus:outline-none focus:border-[#98c1d9] focus:ring-2 focus:ring-[#98c1d9]/20 cursor-pointer"
    >
      {PRESETS.map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}

const dateInputClass =
  "bg-slate-50 text-slate-900 [color-scheme:light] border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:bg-white focus:border-[#98c1d9] focus:ring-2 focus:ring-[#98c1d9]/20";

function CustomDays({
  frame,
  onChange,
  today,
}: {
  frame: TimeFrame;
  onChange: (frame: TimeFrame) => void;
  today: string | undefined;
}) {
  if (frame.preset !== "custom") return null;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-slate-500 mb-2">
      <span>From</span>
      <input
        type="date"
        aria-label="Start day"
        className={dateInputClass}
        value={frame.start}
        max={today}
        onChange={(e) => onChange({ ...frame, start: e.target.value })}
      />
      <span>to</span>
      <input
        type="date"
        aria-label="End day"
        className={dateInputClass}
        value={frame.end}
        max={today}
        onChange={(e) => onChange({ ...frame, end: e.target.value })}
      />
    </div>
  );
}

// "Nov 3 · 2 visits" for the hovered bar, shown in the card header
function hoverText(data: Visits, i: number | null): string | null {
  const bar = i !== null ? data.bars[i] : undefined;
  if (!bar) return null;
  return `${data.step === "week" ? barLabel(bar) : shortDate(bar.start)} · ${plural(bar.visits, "visit")}`;
}

function VisitsChart({
  data,
  hovered,
  setHovered,
}: {
  data: Visits;
  hovered: number | null;
  setHovered: (i: number | null) => void;
}) {
  const { bars } = data;
  const weekly = data.step === "week";
  const W = 820;
  const H = 200;
  const L = 34;
  const R = 8;
  const T = 10;
  const B = 28;
  const plotW = W - L - R;
  const plotH = H - T - B;
  const max = Math.max(...bars.map((b) => b.visits), 0);
  const yMax = max <= 4 ? 4 : max <= 10 ? 10 : Math.ceil(max / 10) * 10;
  const y = (v: number) => T + plotH - (plotH * v) / yMax;
  const slot = plotW / bars.length;
  const gap = Math.min(4, slot * 0.3);
  const barW = Math.max(slot - gap, 1);
  const last = bars.length - 1;
  const endsToday = data.end === data.today;

  // under the bars: "Today" / "This week" at the end, then Mondays (per day)
  // or the week each month starts in (per week), kept clear of the end label
  function label(bar: Visits["bars"][number], i: number): string | null {
    if (endsToday && i === last) return weekly ? "This week" : "Today";
    if (endsToday && (last - i) * slot < 52) return null;
    if (!weekly) return parseDay(bar.start).getDay() === 1 ? shortDate(bar.start) : null;
    if (!bar.start.endsWith("-01") && bar.start.slice(0, 7) === bar.end.slice(0, 7)) return null;
    const month = parseDay(bar.end.slice(0, 8) + "01");
    return month.toLocaleDateString("en-US", { month: "short" }) + (month.getMonth() === 0 ? ` ${month.getFullYear()}` : "");
  }

  return (
    <>
      {max === 0 ? (
        <p className="text-sm text-slate-500 py-8 text-center">No visits in this time frame.</p>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto"
          role="img"
          aria-label={`Visits per ${data.step}`}
          onMouseLeave={() => setHovered(null)}
        >
          {[0, yMax / 2, yMax].map((g) => (
            <g key={g}>
              <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke="#e2e8f0" strokeWidth={1} />
              <text x={L - 6} y={y(g) + 4} textAnchor="end" fontSize={11} fill="#94a3b8">
                {g}
              </text>
            </g>
          ))}
          {bars.map((b, i) => {
            const x = L + i * slot + gap / 2;
            const top = y(b.visits);
            const h = T + plotH - top;
            const r = Math.min(4, h / 2, barW / 2);
            const text = label(b, i);
            // the end label is right-aligned so it isn't cut off
            const atEnd = endsToday && i === last;
            return (
              <g key={b.start} onMouseEnter={() => setHovered(i)}>
                {/* the whole column is the hover target, not just the bar */}
                <rect x={L + i * slot} y={T} width={slot} height={plotH} fill="transparent" />
                {b.visits > 0 && (
                  <path
                    d={`M${x},${T + plotH} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${T + plotH} Z`}
                    fill={hovered === i ? "#2e4460" : "#3d5a80"}
                  >
                    <title>{`${barLabel(b)}: ${plural(b.visits, "visit")}`}</title>
                  </path>
                )}
                {text && (
                  <text
                    x={atEnd ? x + barW : x + barW / 2}
                    y={H - 8}
                    textAnchor={atEnd ? "end" : "middle"}
                    fontSize={11}
                    fill="#64748b"
                  >
                    {text}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </>
  );
}

// the longest bar uses 80% of the chart column, leaving room for the count
// after it; there's no scale, since every bar is labelled with its count
const BAR_SPAN = 80;

function FeatureChart({ data }: { data: Features }) {
  const { features, visitors: allVisitors } = data;
  const counts = FEATURE_GROUPS.flatMap(({ items }) => items.map(([event]) => features[event]?.visitors ?? 0));
  const most = Math.max(...counts, 1);
  const barWidth = (v: number) => `${(v / most) * BAR_SPAN}%`;
  const rowGrid =
    "grid grid-cols-[8rem_minmax(0,1fr)] sm:grid-cols-[12.5rem_minmax(0,1fr)_5rem] gap-x-3 items-center";

  return (
    <>
      <p className="text-xs text-slate-500 mb-2">
        Visitors per feature. %: out of {plural(allVisitors, "total visitor")}.
      </p>

      <div className="relative">
        {/* the bars' starting line, down the left edge of the chart column */}
        <span className="absolute top-6 bottom-0 w-px bg-slate-300 left-[calc(8rem+0.75rem)] sm:left-[calc(12.5rem+0.75rem)] pointer-events-none" />

        {FEATURE_GROUPS.map(({ group, items }) => (
          <div key={group}>
            <p className="relative text-[11px] font-semibold uppercase tracking-wide text-slate-400 mt-2">{group}</p>
            {items.map(([event, label]) => {
              const f = features[event] ?? { visitors: 0, uses: 0 };
              const percent = allVisitors > 0 ? Math.round((f.visitors / allVisitors) * 100) : 0;
              return (
                <div
                  key={event}
                  title={`${label}: ${plural(f.visitors, "visitor")} (${percent}%), ${plural(f.uses, "use")}`}
                  className={`${rowGrid} group relative py-1 text-[13px]`}
                >
                  <span className="text-slate-700 truncate">{label}</span>
                  <span className="flex items-center min-w-0">
                    {f.visitors > 0 && (
                      <span
                        className="h-3.5 rounded-r bg-[#3d5a80] group-hover:bg-[#2e4460] shrink-0"
                        style={{ width: barWidth(f.visitors) }}
                      />
                    )}
                    <span className="ml-2 whitespace-nowrap tabular-nums">
                      <span className="font-semibold text-slate-800">{f.visitors}</span>{" "}
                      <span className="text-xs text-slate-400">({percent}%)</span>
                    </span>
                  </span>
                  <span className="hidden sm:block text-xs text-slate-400 text-right tabular-nums">
                    {plural(f.uses, "use")}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}

// a chart's white card: title and time frame dropdown on top, then the custom
// days if picked, then the chart (or loading / error text)
function ChartCard({
  title,
  frame,
  onFrameChange,
  shown,
  note,
  error,
  children,
}: {
  title: string;
  frame: TimeFrame;
  onFrameChange: (frame: TimeFrame) => void;
  shown: { today: string; start: string; end: string } | null;
  note?: string | null;
  error: string | null;
  children: ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 mb-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-1 min-h-[28px]">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        <div className="flex items-center gap-3">
          {note && <span className="text-xs text-slate-600">{note}</span>}
          <FramePicker label={`${title} time frame`} frame={frame} onChange={onFrameChange} shown={shown} />
        </div>
      </div>
      <CustomDays frame={frame} onChange={onFrameChange} today={shown?.today} />
      {error ? (
        <p className="text-sm text-red-600 py-8 text-center">{error}</p>
      ) : shown ? (
        children
      ) : (
        <p className="text-sm text-slate-500 py-8 text-center">Loading…</p>
      )}
    </div>
  );
}

function AdminUsage({ password, onAuthFailed }: { password: string; onAuthFailed: () => void }) {
  const [visitsFrame, setVisitsFrame] = useState<TimeFrame>(DEFAULT_FRAME);
  const [featuresFrame, setFeaturesFrame] = useState<TimeFrame>(DEFAULT_FRAME);
  const visits = useUsage<Visits>("/api/usage/visits", visitsFrame, password, onAuthFailed);
  const features = useUsage<Features>("/api/usage/features", featuresFrame, password, onAuthFailed);
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
  // null until loaded, and on a site that doesn't count it (badge hidden)
  const [online, setOnline] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    function load() {
      fetch(`${API}/api/usage/online`, { headers: { "X-Inbox-Password": password } })
        .then(async (r) => {
          if (r.status === 401) {
            onAuthFailed();
            return;
          }
          if (!r.ok) return;
          const body: { online: number | null } = await r.json();
          if (!cancelled) setOnline(body.online);
        })
        .catch(() => {
          // keep the last number until the next try
        });
    }
    load();
    const timer = setInterval(load, ONLINE_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [password, onAuthFailed]);

  // the first two boxes are fixed; the third follows the visits chart's time frame
  const v = visits.data;
  const tiles = v
    ? [
        { label: "Today", ...v.today_counts },
        { label: "Last 7 days", ...v.week_counts },
        { label: frameLabel(visitsFrame, v), ...v.range_counts },
      ]
    : [];

  return (
    <div className="w-full h-full overflow-y-auto bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex flex-wrap items-center gap-3 mb-4 min-h-[30px]">
          <h1 className="text-lg font-semibold text-slate-700">Usage</h1>
          {online !== null && (
            <span
              title="Visitors with the map open in a visible tab in the last 2 minutes. Updates every 30 seconds."
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white pl-2.5 pr-3 py-0.5 text-[13px] text-slate-600"
            >
              <span className="w-2 h-2 rounded-full bg-green-600 ring-[3px] ring-green-100" />
              <span className="font-semibold text-slate-800 tabular-nums">{online}</span> online now
            </span>
          )}
        </div>

        {tiles.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            {tiles.map((t) => (
              <div key={t.label} className="bg-white border border-slate-200 rounded-lg px-4 py-3">
                <p className="text-xs text-slate-500">{t.label}</p>
                <p className="text-2xl font-semibold text-slate-800 leading-tight">{t.visits}</p>
                <p className="text-xs text-slate-500">
                  {t.visits === 1 ? "visit" : "visits"} · {plural(t.visitors, "visitor")}
                </p>
              </div>
            ))}
          </div>
        )}

        <ChartCard
          title={v?.step === "week" ? "Visits per week" : "Visits per day"}
          frame={visitsFrame}
          onFrameChange={(frame) => {
            // the bars change, so drop the old hover text
            setHoveredBar(null);
            setVisitsFrame(frame);
          }}
          shown={v}
          note={v && hoverText(v, hoveredBar)}
          error={visits.error}
        >
          {v && <VisitsChart data={v} hovered={hoveredBar} setHovered={setHoveredBar} />}
        </ChartCard>

        <ChartCard
          title="Feature usage"
          frame={featuresFrame}
          onFrameChange={setFeaturesFrame}
          shown={features.data}
          error={features.error}
        >
          {features.data && <FeatureChart data={features.data} />}
        </ChartCard>

        <p className="text-xs text-slate-400">Anonymous counts from the live site only.</p>
      </div>
    </div>
  );
}

export default AdminUsage;

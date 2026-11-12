import { useEffect, useState } from "react";
import { errorText } from "./FeedbackInbox";

// The Usage tab of the Admin page -- anonymous visit and feature counts from the
// live site, saved by usage.ts. Features are compared by how many visitors used them, not by
// raw clicks, since some (like opening tracks) get clicked far more per visit.

const API = import.meta.env.VITE_API_URL ?? "";

interface Summary {
  totals: {
    today: string;
    visits_1: number;
    visitors_1: number;
    visits_7: number;
    visitors_7: number;
    visits_30: number;
    visitors_30: number;
  };
  days: { day: string; visits: number }[];
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

function VisitsChart({ days }: { days: Summary["days"] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const W = 820;
  const H = 200;
  const L = 34;
  const R = 8;
  const T = 10;
  const B = 28;
  const plotW = W - L - R;
  const plotH = H - T - B;
  const max = Math.max(...days.map((d) => d.visits), 0);
  const yMax = max <= 4 ? 4 : max <= 10 ? 10 : Math.ceil(max / 10) * 10;
  const y = (v: number) => T + plotH - (plotH * v) / yMax;
  const slot = plotW / days.length;
  const barW = Math.max(slot - 4, 1);
  const shown = hovered !== null ? days[hovered] : null;

  return (
    <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 mb-3">
      <div className="flex items-baseline justify-between gap-3 mb-1 min-h-[20px]">
        <h2 className="text-sm font-semibold text-slate-700">
          Visits per day <span className="font-normal text-slate-400">· last 30 days</span>
        </h2>
        {shown && (
          <span className="text-xs text-slate-600">
            {shortDate(shown.day)} · {plural(shown.visits, "visit")}
          </span>
        )}
      </div>
      {max === 0 ? (
        <p className="text-sm text-slate-500 py-8 text-center">No visits in the last 30 days.</p>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto"
          role="img"
          aria-label="Visits per day, last 30 days"
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
          {days.map((d, i) => {
            const x = L + i * slot + 2;
            const top = y(d.visits);
            const h = T + plotH - top;
            const r = Math.min(4, h / 2);
            const isToday = i === days.length - 1;
            const label = isToday ? "Today" : parseDay(d.day).getDay() === 1 ? shortDate(d.day) : null;
            return (
              <g key={d.day} onMouseEnter={() => setHovered(i)}>
                {/* the whole column is the hover target, not just the bar */}
                <rect x={L + i * slot} y={T} width={slot} height={plotH} fill="transparent" />
                {d.visits > 0 && (
                  <path
                    d={`M${x},${T + plotH} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${T + plotH} Z`}
                    fill={hovered === i ? "#2e4460" : "#3d5a80"}
                  >
                    <title>{`${shortDate(d.day)}: ${plural(d.visits, "visit")}`}</title>
                  </path>
                )}
                {label && (
                  <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize={11} fill="#64748b">
                    {label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

function AdminUsage({ password, onAuthFailed }: { password: string; onAuthFailed: () => void }) {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    fetch(`${API}/api/usage/summary`, { headers: { "X-Inbox-Password": password } })
      .then(async (r) => {
        if (r.status === 401) {
          onAuthFailed();
          return;
        }
        if (!r.ok) throw new Error(`Couldn't load the usage numbers (${r.status}).`);
        const summary: Summary = await r.json();
        if (!cancelled) setData(summary);
      })
      .catch((err) => !cancelled && setError(errorText(err)));
    return () => {
      cancelled = true;
    };
  }, [password, onAuthFailed]);

  const tiles = data
    ? [
        { label: "Today", visits: data.totals.visits_1, visitors: data.totals.visitors_1 },
        { label: "Last 7 days", visits: data.totals.visits_7, visitors: data.totals.visitors_7 },
        { label: "Last 30 days", visits: data.totals.visits_30, visitors: data.totals.visitors_30 },
      ]
    : [];
  const allVisitors = data?.totals.visitors_30 ?? 0;

  return (
    <div className="w-full h-full overflow-y-auto bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center mb-4 min-h-[30px]">
          <h1 className="text-lg font-semibold text-slate-700">Usage</h1>
        </div>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        {!data && !error && <p className="text-sm text-slate-500">Loading…</p>}

        {data && (
          <>
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

            <VisitsChart days={data.days} />

            <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 mb-3">
              <h2 className="text-sm font-semibold text-slate-700">
                Features used{" "}
                <span className="font-normal text-slate-400">
                  · last 30 days · share of all {plural(allVisitors, "visitor")} who used each one (full bar = 100%)
                </span>
              </h2>
              {FEATURE_GROUPS.map(({ group, items }) => (
                <div key={group}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mt-3 mb-0.5">{group}</p>
                  {items.map(([event, label]) => {
                    const f = data.features[event] ?? { visitors: 0, uses: 0 };
                    const share = allVisitors > 0 ? f.visitors / allVisitors : 0;
                    return (
                      <div
                        key={event}
                        className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[12.5rem_minmax(0,1fr)_9.5rem_4.5rem] gap-x-3 gap-y-1 items-center py-1 text-[13px]"
                      >
                        <span className="text-slate-700">{label}</span>
                        <span className="text-xs text-slate-400 text-right tabular-nums sm:order-last">
                          {plural(f.uses, "use")}
                        </span>
                        <span className="col-span-full sm:col-span-1 h-2.5 rounded bg-slate-100 overflow-hidden">
                          <span
                            className="block h-full rounded-r bg-[#3d5a80]"
                            style={{ width: `${(share * 100).toFixed(1)}%` }}
                          />
                        </span>
                        <span className="text-slate-600 tabular-nums">
                          <span className="font-semibold text-slate-800">{f.visitors}</span>{" "}
                          {f.visitors === 1 ? "visitor" : "visitors"} · {Math.round(share * 100)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <p className="text-xs text-slate-400">Anonymous counts from the live site only.</p>
          </>
        )}
      </div>
    </div>
  );
}

export default AdminUsage;

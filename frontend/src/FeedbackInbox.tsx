import { useEffect, useState } from "react";
import { FEEDBACK_CATEGORIES } from "./components/FeedbackPanel";

// The /feedback-inbox page (picked in index.tsx by URL path) -- lists every
// Feedback panel submission, newest first, with a status dropdown on each.
// Gated by one shared password that the backend checks on every request
// (FEEDBACK_INBOX_PASSWORD in the server's .env); kept in sessionStorage so
// it's only asked for once per browser tab.

const API = import.meta.env.VITE_API_URL ?? "";
const PASSWORD_KEY = "feedbackInboxPassword";

type Status = "pending" | "in_progress" | "completed" | "rejected";

interface FeedbackItem {
  id: number;
  created_at: string;
  category: string;
  message: string;
  email: string | null;
  status: Status;
  updated_at: string;
}

const STATUSES: { value: Status; label: string; description: string; legendClass: string; selectClass: string }[] = [
  {
    value: "pending",
    label: "Pending",
    description: "waiting in line to be reviewed",
    legendClass: "text-slate-700",
    selectClass: "bg-white text-slate-700 border-slate-300",
  },
  {
    value: "in_progress",
    label: "In progress",
    description: "accepted and being worked on",
    legendClass: "text-blue-700",
    // left plain -- the whole row is already highlighted light blue
    selectClass: "bg-white text-slate-700 border-slate-300",
  },
  {
    value: "completed",
    label: "Completed",
    description: "accepted and finished",
    legendClass: "text-green-700",
    selectClass: "bg-green-100 text-green-800 border-green-300",
  },
  {
    value: "rejected",
    label: "Rejected",
    description: "reviewed, but won't be added",
    legendClass: "text-red-700",
    selectClass: "bg-red-100 text-red-800 border-red-300",
  },
];

const CATEGORY_CLASS: Record<string, string> = {
  issue: "bg-red-100 text-red-700",
  feature: "bg-sky-100 text-sky-700",
  other: "bg-purple-100 text-purple-700",
};

function readStoredPassword(): string {
  try {
    return sessionStorage.getItem(PASSWORD_KEY) ?? "";
  } catch {
    return "";
  }
}

function storePassword(password: string | null) {
  try {
    if (password) sessionStorage.setItem(PASSWORD_KEY, password);
    else sessionStorage.removeItem(PASSWORD_KEY);
  } catch {
    // storage blocked -- the password just won't be remembered
  }
}

// fetch() itself throws a TypeError ("Failed to fetch") when the server
// can't be reached at all -- reworded, since that's what it means here.
function errorText(err: unknown): string {
  if (err instanceof TypeError) return "Couldn't reach the server. Check that it's running and try again.";
  return err instanceof Error ? err.message : String(err);
}

// "2026-10-13 14:02" in the viewer's local time
function formatTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function FeedbackInbox() {
  const [password, setPassword] = useState(readStoredPassword);
  const [passwordDraft, setPasswordDraft] = useState("");
  const [items, setItems] = useState<FeedbackItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // bumped on every password submit so retrying the same password refetches
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    document.title = "Feedback inbox";
  }, []);

  useEffect(() => {
    if (!password) return;
    setLoading(true);
    setError(null);
    fetch(`${API}/api/feedback`, { headers: { "X-Inbox-Password": password } })
      .then(async (r) => {
        if (r.status === 401) {
          storePassword(null);
          setPassword("");
          throw new Error("Wrong password.");
        }
        if (!r.ok) throw new Error(`Couldn't load feedback (${r.status}).`);
        const data: FeedbackItem[] = await r.json();
        storePassword(password);
        setItems(data);
      })
      .catch((err) => setError(errorText(err)))
      .finally(() => setLoading(false));
  }, [password, attempt]);

  async function changeStatus(id: number, status: Status) {
    const previous = items;
    setItems((cur) => cur?.map((it) => (it.id === id ? { ...it, status } : it)) ?? cur);
    setError(null);
    try {
      const r = await fetch(`${API}/api/feedback/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Inbox-Password": password },
        body: JSON.stringify({ status }),
      });
      if (r.status === 401) {
        storePassword(null);
        setPassword("");
        throw new Error("Wrong password.");
      }
      if (!r.ok) throw new Error(`Couldn't save the status change (${r.status}).`);
    } catch (err) {
      setItems(previous);
      setError(errorText(err));
    }
  }

  if (!password || items === null) {
    return (
      <div className="w-full h-screen overflow-y-auto bg-slate-50 flex items-center justify-center">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!passwordDraft) return;
            setPassword(passwordDraft);
            setAttempt((a) => a + 1);
          }}
          className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 w-80 flex flex-col gap-3"
        >
          <h1 className="text-sm font-semibold text-slate-700">Feedback inbox</h1>
          <input
            type="password"
            autoFocus
            value={passwordDraft}
            onChange={(e) => setPasswordDraft(e.target.value)}
            placeholder="Password"
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#3d5a80]"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-1.5 rounded-md bg-[#3d5a80] text-white text-xs font-medium hover:bg-[#2e4460] transition disabled:opacity-60"
          >
            {loading ? "Checking…" : "Open inbox"}
          </button>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </form>
      </div>
    );
  }

  return (
    <div className="w-full h-screen overflow-y-auto bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-baseline justify-between mb-4">
          <h1 className="text-lg font-semibold text-slate-700">Feedback inbox</h1>
          <span className="text-sm text-slate-500">{items.length} total</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-500">
          {STATUSES.map((s) => (
            <div key={s.value}>
              <span className={`font-semibold ${s.legendClass}`}>{s.label}</span> — {s.description}
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        {items.length === 0 ? (
          <p className="text-sm text-slate-500">No feedback yet.</p>
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            {items.map((it) => {
              const closed = it.status === "completed" || it.status === "rejected";
              const statusInfo = STATUSES.find((s) => s.value === it.status) ?? STATUSES[0];
              const categoryLabel = FEEDBACK_CATEGORIES.find((c) => c.value === it.category)?.label ?? it.category;
              return (
                <div
                  key={it.id}
                  className={`grid grid-cols-[minmax(0,1fr)_9rem] sm:grid-cols-[7rem_minmax(0,1fr)_9rem] gap-x-4 gap-y-2 items-start px-4 py-3 border-b border-slate-100 last:border-b-0 ${
                    it.status === "in_progress" ? "bg-blue-50" : ""
                  }`}
                >
                  <div className="order-1">
                    <span
                      className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${CATEGORY_CLASS[it.category] ?? ""} ${
                        closed ? "grayscale opacity-60" : ""
                      }`}
                    >
                      {categoryLabel}
                    </span>
                  </div>
                  <div className="order-3 col-span-2 sm:order-2 sm:col-span-1">
                    <p className={`text-sm whitespace-pre-wrap break-words ${closed ? "text-slate-400" : "text-slate-700"}`}>
                      {it.message}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {formatTime(it.created_at)}
                      {it.email && (
                        <>
                          {" · "}
                          <a href={`mailto:${it.email}`} className="hover:underline">
                            {it.email}
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                  <select
                    aria-label="Status"
                    value={it.status}
                    onChange={(e) => changeStatus(it.id, e.target.value as Status)}
                    className={`order-2 sm:order-3 w-full rounded-md border text-xs font-semibold px-2 py-1.5 focus:outline-none ${statusInfo.selectClass}`}
                  >
                    {STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default FeedbackInbox;

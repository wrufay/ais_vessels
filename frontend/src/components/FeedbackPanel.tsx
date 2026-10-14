import { useState } from "react";
import PanelHeader from "./PanelHeader";

export const FEEDBACK_CATEGORIES = [
  { value: "issue", label: "Issue" },
  { value: "feature", label: "New Feature" },
  { value: "other", label: "Other" },
] as const;

export const FEEDBACK_TITLE_MAX_LENGTH = 120;
export const FEEDBACK_MAX_LENGTH = 2000;

// The Feedback side-panel's content -- lets anyone report an issue or
// suggest a feature. Submissions are stored by the backend and reviewed on
// the password-protected /feedback-inbox page (see FeedbackInbox.tsx).
// The draft lives here, and SidePanel only slides this off screen when
// closed, so whatever was typed survives closing and reopening the panel.
function FeedbackPanel({ api }: { api: string }) {
  const [category, setCategory] = useState<string>("issue");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Add a short title first.");
      return;
    }
    if (!message.trim()) {
      setError("Write a short description first.");
      return;
    }
    setSending(true);
    setError(null);
    setSent(false);
    try {
      const r = await fetch(`${api}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, title, message, email: email.trim() || null }),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      setTitle("");
      setMessage("");
      setEmail("");
      setSent(true);
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "Couldn't reach the server. Try again in a moment."
          : `Couldn't send your feedback (${err instanceof Error ? err.message : err}). Try again.`
      );
    } finally {
      setSending(false);
    }
  }

  const inputClass =
    "w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 px-2.5 py-1.5 focus:outline-none focus:border-[#3d5a80]";

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
      <div className="px-5 pt-8 pb-4 shrink-0">
        <PanelHeader
          name="Feedback"
          description="Report an issue or suggest a new feature."
          className=""
        />
      </div>
      <form onSubmit={submit} className="px-5 pb-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Type</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
            {FEEDBACK_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Title</span>
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setSent(false);
              setError(null);
            }}
            maxLength={FEEDBACK_TITLE_MAX_LENGTH}
            placeholder="A short summary"
            className={inputClass}
          />
          <span className="self-end text-[11px] text-slate-400 dark:text-slate-500">
            {title.length} / {FEEDBACK_TITLE_MAX_LENGTH}
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Description</span>
          <textarea
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setSent(false);
              setError(null);
            }}
            maxLength={FEEDBACK_MAX_LENGTH}
            rows={7}
            placeholder="What happened, or what would you like to see?"
            className={`${inputClass} resize-y`}
          />
          <span className="self-end text-[11px] text-slate-400 dark:text-slate-500">
            {message.length} / {FEEDBACK_MAX_LENGTH}
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            Email <span className="font-normal text-slate-400 dark:text-slate-500">(optional)</span>
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={254}
            placeholder="name@dfo-mpo.gc.ca"
            className={inputClass}
          />
        </label>

        <button
          type="submit"
          disabled={sending}
          className="self-start px-4 py-1.5 rounded-md bg-[#3d5a80] text-white text-xs font-medium hover:bg-[#2e4460] transition disabled:opacity-60"
        >
          {sending ? "Sending…" : "Send feedback"}
        </button>

        {sent && <p className="text-xs text-green-700 dark:text-green-400">Thanks — your feedback was sent.</p>}
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      </form>
    </div>
  );
}

export default FeedbackPanel;

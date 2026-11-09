import { useEffect, useState } from "react";
import FeedbackInbox, { PasswordForm, errorText, readStoredPassword, storePassword } from "./FeedbackInbox";

// The /admin page (picked in index.tsx by URL path) -- the tools for whoever
// looks after the site, behind one password. It's the same password as the
// feedback inbox (FEEDBACK_INBOX_PASSWORD), and the backend checks it on every
// request; kept in sessionStorage so it lasts until log out or the tab closes.

const API = import.meta.env.VITE_API_URL ?? "";
const PASSWORD_KEY = "adminPassword";

function AdminPage() {
  const [password, setPassword] = useState(() => readStoredPassword(PASSWORD_KEY));
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Admin";
  }, []);

  async function logIn(draft: string) {
    setChecking(true);
    setError(null);
    try {
      const r = await fetch(`${API}/api/feedback`, { headers: { "X-Inbox-Password": draft } });
      if (r.status === 401) throw new Error("Wrong password.");
      if (!r.ok) throw new Error(`Couldn't log in (${r.status}).`);
      storePassword(PASSWORD_KEY, draft);
      setPassword(draft);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setChecking(false);
    }
  }

  function logOut(message: string | null = null) {
    storePassword(PASSWORD_KEY, null);
    setPassword("");
    setError(message);
  }

  if (!password) {
    return <PasswordForm title="Admin" submitLabel="Log in" busy={checking} error={error} onSubmit={logIn} />;
  }

  return (
    <div className="w-full h-screen flex flex-col bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-between py-3">
            <span className="text-lg font-semibold text-slate-700">Admin</span>
            <button
              type="button"
              onClick={() => logOut()}
              className="text-xs text-slate-500 underline hover:text-slate-700"
            >
              Log out
            </button>
          </div>
          <div className="flex gap-4 text-sm">
            <span className="pb-2 font-medium text-[#3d5a80] border-b-2 border-[#3d5a80]">Feedback inbox</span>
          </div>
        </div>
      </header>
      <div className="flex-1 min-h-0">
        <FeedbackInbox adminPassword={password} onAuthFailed={() => logOut("Wrong password.")} />
      </div>
    </div>
  );
}

export default AdminPage;

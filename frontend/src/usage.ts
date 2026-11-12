// Anonymous usage counts for the Admin page's Usage tab (AdminUsage.tsx). Each
// browser gets a random ID in localStorage -- no names or IP addresses -- and
// sends one small note to our own backend per visit or feature use. A browser
// that has logged in to Admin stops counting itself, so checking the inbox and
// testing don't inflate the numbers.

const API = import.meta.env.VITE_API_URL ?? "";
const VISITOR_KEY = "usageVisitor";
const ADMIN_KEY = "usageAdminBrowser";
const LAST_VISIT_KEY = "usageLastVisit";
// a reload or a quick return within this time is the same sitting
const NEW_VISIT_AFTER_MS = 30 * 60 * 1000;

export type UsageEvent =
  | "visit"
  | "vessel_track"
  | "analyse"
  | "all_traffic"
  | "heat_map"
  | "mooring_upload"
  | "noise_vessel"
  | "noise_wind"
  | "noise_combined"
  | "impact_run"
  | "feedback_sent";

function visitorId(): string | null {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id || !/^[0-9a-f]{32}$/.test(id)) {
      // getRandomValues, not randomUUID: the site is plain http, where
      // randomUUID doesn't exist
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

function isAdminBrowser(): boolean {
  try {
    return localStorage.getItem(ADMIN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markAdminBrowser() {
  try {
    localStorage.setItem(ADMIN_KEY, "1");
  } catch {
    // storage blocked -- this browser just keeps counting
  }
}

export function trackUsage(event: UsageEvent) {
  if (isAdminBrowser()) return;
  const visitor = visitorId();
  if (!visitor) return;
  fetch(`${API}/api/usage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ visitor, event }),
    keepalive: true,
  }).catch(() => {
    // counting is best-effort -- never bother the user about it
  });
}

// opening the map page counts as a visit, unless the last page open was under
// 30 minutes ago
export function trackVisit() {
  try {
    const last = Number(localStorage.getItem(LAST_VISIT_KEY));
    const now = Date.now();
    localStorage.setItem(LAST_VISIT_KEY, String(now));
    if (last && now - last < NEW_VISIT_AFTER_MS) return;
  } catch {
    return;
  }
  trackUsage("visit");
}

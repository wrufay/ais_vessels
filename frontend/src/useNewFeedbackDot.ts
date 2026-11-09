import { useEffect, useState } from "react";

// The red dot on the map's Admin button: on when feedback has arrived since
// this browser last opened the inbox. The time of the newest item it has seen
// is kept in localStorage ("" = the inbox was empty). A browser that has never
// opened the inbox has no value, so ordinary visitors never see the dot and
// never ask the server.

const LAST_SEEN_KEY = "feedbackLastSeen";
const CHECK_EVERY_MS = 5 * 60 * 1000;

export function markFeedbackSeen(newestCreatedAt: string | undefined) {
  try {
    localStorage.setItem(LAST_SEEN_KEY, newestCreatedAt ?? "");
  } catch {
    // storage blocked -- this browser just won't get the dot
  }
}

function readLastSeen(): string | null {
  try {
    return localStorage.getItem(LAST_SEEN_KEY);
  } catch {
    return null;
  }
}

export function useNewFeedbackDot(api: string): boolean {
  const [hasNew, setHasNew] = useState(false);

  useEffect(() => {
    // only the newest check may set the dot, if two overlap
    let checkId = 0;

    async function check() {
      const id = ++checkId;
      const lastSeen = readLastSeen();
      if (lastSeen === null) {
        setHasNew(false);
        return;
      }
      try {
        const r = await fetch(`${api}/api/feedback/latest`);
        if (!r.ok) return;
        const { latest }: { latest: string | null } = await r.json();
        if (id !== checkId) return;
        setHasNew(latest !== null && (lastSeen === "" || Date.parse(latest) > Date.parse(lastSeen)));
      } catch {
        // server unreachable -- leave the dot as it is until the next check
      }
    }

    check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    // fires when another tab opens the inbox, so the dot clears right away
    const onStorage = (e: StorageEvent) => {
      if (e.key === LAST_SEEN_KEY || e.key === null) check();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      checkId++;
      clearInterval(timer);
      window.removeEventListener("storage", onStorage);
    };
  }, [api]);

  return hasNew;
}

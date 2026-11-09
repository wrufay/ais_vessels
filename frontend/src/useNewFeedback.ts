import { useEffect, useState } from "react";

// The red dot on the map's Admin button: on for every visitor while any
// feedback is still New. Checked when the page loads, every 5 minutes, when
// the tab comes back into focus (e.g. after updating the inbox in another tab),
// and whenever `recheck` changes (the map passes the Feedback panel's open state,
// so someone who has just sent feedback sees the dot when the panel closes).

const CHECK_EVERY_MS = 5 * 60 * 1000;

export function useNewFeedback(api: string, recheck: unknown): boolean {
  const [hasNew, setHasNew] = useState(false);

  useEffect(() => {
    // only the newest check may set the dot, if two overlap
    let checkId = 0;

    async function check() {
      const id = ++checkId;
      try {
        const r = await fetch(`${api}/api/feedback/new`);
        if (!r.ok) return;
        const { has_new }: { has_new: boolean } = await r.json();
        if (id === checkId) setHasNew(has_new);
      } catch {
        // server unreachable -- leave the dot as it is until the next check
      }
    }

    check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    window.addEventListener("focus", check);
    return () => {
      checkId++;
      clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [api, recheck]);

  return hasNew;
}

import { useEffect, useState } from "react";

// "theme" in localStorage means the user manually picked a theme (overrides
// OS preference from then on); absent means follow the OS preference. The
// initial class on <html> is already set by an inline script in index.html
// (before React mounts, to avoid a flash of the wrong theme) -- this hook
// just reads that state back and keeps it in sync going forward.
export function useTheme() {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));

  useEffect(() => {
    if (localStorage.getItem("theme")) return; // user has an explicit override, don't auto-follow
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      document.documentElement.classList.toggle("dark", e.matches);
      setIsDark(e.matches);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem("theme", next ? "dark" : "light");
      return next;
    });
  };

  return { isDark, toggleTheme };
}

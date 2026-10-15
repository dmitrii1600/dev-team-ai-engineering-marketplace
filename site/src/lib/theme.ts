import { useCallback, useEffect, useState } from "react";
import { storage } from "./storage";

export type Theme = "dark" | "light";

const systemTheme = (): Theme =>
  typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";

// public/theme-init.js has already put the theme on <html> before first paint; this reads it back.
const currentTheme = (): Theme => {
  const set = document.documentElement.dataset.theme;
  return set === "light" || set === "dark" ? set : systemTheme();
};

/** Dark by default; a stored choice wins, then prefers-color-scheme. */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = (e: MediaQueryListEvent) => {
      if (storage.get("theme")) return; // an explicit choice wins over the OS setting
      setTheme(e.matches ? "light" : "dark");
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      storage.set("theme", next);
      return next;
    });
  }, []);

  return { theme, toggle };
}

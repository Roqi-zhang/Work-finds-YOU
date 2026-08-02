import { useEffect, useState } from "react";

export function useTheme() {
  const [theme, setTheme] = useState<string>(
    () => localStorage.getItem("swiss-theme") || "light"
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("swiss-theme", theme);
  }, [theme]);

  return {
    theme,
    toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
  };
}

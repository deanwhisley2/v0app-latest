import { NEXUS_THEME_STORAGE_KEY } from "@/lib/nexus-theme-storage"

/** Runs before paint to avoid light/dark flash on first load. */
export function ThemeScript() {
  const storageKey = NEXUS_THEME_STORAGE_KEY
  const script = `
(function() {
  try {
    var key = ${JSON.stringify(storageKey)};
    var stored = localStorage.getItem(key);
    var systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var dark = stored === "dark" || (stored === "system" && systemDark) || (!stored && true);
    var root = document.documentElement;
    root.classList.remove("light", "dark");
    if (dark) root.classList.add("dark");
    else root.classList.add("light");
  } catch (e) {}
})();`
  return <script dangerouslySetInnerHTML={{ __html: script }} />
}

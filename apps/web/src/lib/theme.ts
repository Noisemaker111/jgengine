export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "jg-theme";

/**
 * Runs inline in <head> before first paint: applies the stored choice, else the
 * system preference, and keeps following the system until the visitor picks one.
 * `?theme=light|dark` overrides both for that page view (captures, shared links).
 */
export const THEME_INIT_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)},d=document.documentElement,m=window.matchMedia("(prefers-color-scheme: light)");var apply=function(){var q=new URLSearchParams(location.search).get("theme"),s=null;try{s=localStorage.getItem(k)}catch(e){}if(q==="light"||q==="dark")s=q;d.dataset.theme=s==="light"||s==="dark"?s:(m.matches?"light":"dark")};apply();m.addEventListener("change",apply)}catch(e){}})();`;

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode or blocked storage: the choice lasts for this page view.
  }
}

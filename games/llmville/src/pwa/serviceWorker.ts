/**
 * Registers the PWA service worker so the game is installable on phone, tablet,
 * and desktop. Only runs in production builds — in dev the worker would fight
 * Vite's HMR and serve stale modules.
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failing (e.g. unsupported context) must never break the app.
    });
  });
}

import { SITE_URL } from "./site";

/** The Databuddy website for jgengine.com (issue #2888). */
export const DATABUDDY_CLIENT_ID = "9a7288b3-67db-47ef-af92-3ef30b52f6d8";
export const DATABUDDY_SCRIPT_SRC = "https://cdn.databuddy.cc/databuddy.js";

/** Visits count only on the live site: the workers.dev preview, `wrangler dev` and local builds load nothing. */
export const ANALYTICS_HOST = new URL(SITE_URL).hostname;

/**
 * Inline `<head>` script for production pages (the prerender adds it; dev pages and tests do not):
 * on the live host it appends the Databuddy tag, async, so it never blocks the page. The same
 * attributes as Databuddy's snippet, set on an injected tag as Databuddy's own SDK does.
 */
export const ANALYTICS_LOADER_SCRIPT = [
  `if(location.hostname===${JSON.stringify(ANALYTICS_HOST)}){`,
  `var s=document.createElement("script");`,
  `s.src=${JSON.stringify(DATABUDDY_SCRIPT_SRC)};`,
  `s.async=true;s.crossOrigin="anonymous";`,
  `s.setAttribute("data-client-id",${JSON.stringify(DATABUDDY_CLIENT_ID)});`,
  `s.setAttribute("data-track-web-vitals","true");`,
  `s.setAttribute("data-track-errors","true");`,
  `document.head.appendChild(s)}`,
].join("");

/** The visitor actions the site counts beyond page views. */
export type AnalyticsEvent = "playground_start" | "game_play";

interface DatabuddyTracker {
  track(name: string, properties?: Record<string, string | number | boolean>): void;
}

declare global {
  interface Window {
    databuddy?: DatabuddyTracker;
    db?: DatabuddyTracker;
  }
}

/**
 * Counts `name` with Databuddy. Waits for the tag when it is still loading; a no-op where the
 * tag is not on the page (dev, previews, tests) or a blocker removed it.
 */
export function trackEvent(name: AnalyticsEvent, properties?: Record<string, string | number | boolean>): void {
  if (typeof window === "undefined") return;
  const send = (): void => (window.databuddy ?? window.db)?.track(name, properties);
  if ((window.databuddy ?? window.db) !== undefined) {
    send();
    return;
  }
  document.querySelector(`script[src="${DATABUDDY_SCRIPT_SRC}"]`)?.addEventListener("load", send, { once: true });
}

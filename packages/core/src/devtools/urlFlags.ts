/**
 * URL-backed debug flags — the single seam hosts use to mirror an engine debug surface (the scene
 * editor, the devtools overlay) into the page query string. Mirroring means the URL is the honest
 * record of what is open: share it to reproduce the state, and strip the param (then reload) to get
 * a clean game with the surface gone. All functions no-op safely off the main browser thread.
 */

/** Values that read as "off" when a param is present but disabled — `?debug=0` stays closed. */
const FALSY = new Set(["", "0", "false", "off", "no"]);

/** The slice of the browser window these helpers touch — kept narrow so core needs no DOM lib. */
interface BrowserWindow {
  location: { href: string; search: string };
  history: { state: unknown; replaceState: (state: unknown, unused: string, url: string) => void };
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
}

/** The live browser window, or null when there is no DOM (SSR, tests, worker). */
function browserWindow(): BrowserWindow | null {
  const candidate = (globalThis as { window?: BrowserWindow }).window;
  if (candidate === undefined || candidate.location === undefined || candidate.history === undefined) {
    return null;
  }
  return candidate;
}

/** The current query value of `param`, or null when absent (or no DOM). */
export function readUrlParam(param: string): string | null {
  const win = browserWindow();
  if (win === null) return null;
  return new URLSearchParams(win.location.search).get(param);
}

/** True when `param` is present and not an explicit off value (`0`/`false`/`off`/`no`). */
export function readUrlFlag(param: string): boolean {
  const value = readUrlParam(param);
  return value !== null && !FALSY.has(value.toLowerCase());
}

/**
 * Sets `param` to `value`, or removes it when `value` is null, rewriting the URL in place with
 * `history.replaceState` so the rest of the query and the hash survive and no history entry is
 * pushed. No-ops without a DOM, and skips the write when the URL already matches.
 */
export function writeUrlParam(param: string, value: string | null): void {
  const win = browserWindow();
  if (win === null) return;
  const url = new URL(win.location.href);
  if (value === null) {
    if (!url.searchParams.has(param)) return;
    url.searchParams.delete(param);
  } else {
    if (url.searchParams.get(param) === value) return;
    url.searchParams.set(param, value);
  }
  win.history.replaceState(win.history.state, "", url.toString());
}

/**
 * Fires `listener` whenever the query string may have changed out from under a flag — browser
 * back/forward (`popstate`). Manual address-bar edits reload the page, so initial reads cover
 * those; this keeps in-app state honest across history navigation. Returns an unsubscribe.
 */
export function subscribeUrlChange(listener: () => void): () => void {
  const win = browserWindow();
  if (win === null) return () => {};
  win.addEventListener("popstate", listener);
  return () => win.removeEventListener("popstate", listener);
}

import { DEVICES, type Device } from "./browser-lib";

export function externalCaptureUrl(raw: string | undefined): string {
  if (raw === undefined || raw.startsWith("--")) throw new Error("--url requires an http:// or https:// URL");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`--url requires an http:// or https:// URL (got "${raw}")`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`--url requires http:// or https:// (got ${url.protocol})`);
  }
  if (url.hostname === "localhost") url.hostname = "127.0.0.1";
  return url.toString();
}

export function driveTargetUrl(args: { game: string; mode: string; modeExplicit?: boolean; device?: Device; site?: string; url?: string }, base: string): URL {
  if (args.url !== undefined && args.site !== undefined) throw new Error("--url and --site select different targets; pass one");
  let url: URL;
  if (args.url !== undefined) {
    url = new URL(args.url);
    if (args.modeExplicit) url.searchParams.set("mode", args.mode);
  } else {
    const path = args.site === undefined ? "/" : args.site.startsWith("/") ? args.site : `/${args.site}`;
    url = new URL(path, base);
    if (args.site === undefined) {
      url.searchParams.set("game", args.game);
      url.searchParams.set("mode", args.mode);
    }
  }
  if (args.device !== undefined) {
    url.searchParams.set("device", args.device === "mobile-landscape" ? "mobile" : args.device);
  }
  return url;
}

export function parseCaptureDevice(raw: string | undefined): Device {
  if (raw === undefined || !Object.hasOwn(DEVICES, raw)) {
    throw new Error(`--device must be ${Object.keys(DEVICES).join(", ")} (got ${raw ?? "nothing"})`);
  }
  return raw as Device;
}

export function requireReusableCaptureStorage(reuseStorage: boolean, connected: boolean, daemonAttached: boolean): void {
  if (reuseStorage && !connected && !daemonAttached) {
    throw new Error("drive: --reuse-storage requires a live warm browser; no daemon is attached. Use --connect <port> for the existing Chrome, or start bun run shoot daemon start before the setup and reuse drives. A new Chrome profile cannot retain a prior checkpoint; --keep alone only preserves the new profile after this run.");
  }
}

type ClickNode = {
  textContent: string | null;
  getAttribute(name: string): string | null;
  matches(selector: string): boolean;
  getBoundingClientRect(): { width: number; height: number; left: number; top: number };
};

type ClickDocument = {
  querySelectorAll(selector: string): ArrayLike<ClickNode>;
  defaultView: { innerWidth: number; innerHeight: number } | null;
};

export function captureClickPoint(doc: ClickDocument, text: string): { x: number; y: number; offscreen: boolean } | null {
  const needle = text.toLowerCase();
  const nodes = Array.from(doc.querySelectorAll("button, [role=button], [role=switch], a, span, div, h1, h2, h3"));
  let best: { len: number; exact: boolean; interactive: boolean; x: number; y: number } | null = null;
  for (const node of nodes) {
    const names = [(node.textContent ?? "").trim(), node.getAttribute("aria-label") ?? ""]
      .map((name) => name.toLowerCase()).filter((name) => name !== "" && name.includes(needle));
    if (names.length === 0) continue;
    const exact = names.includes(needle);
    const len = Math.min(...names.map((name) => name.length));
    const interactive = node.matches("button, [role=button], [role=switch], a");
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    if (best === null || (exact && !best.exact) || (exact === best.exact &&
      (len < best.len || (len === best.len && interactive && !best.interactive)))) {
      best = { len, exact, interactive, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
  }
  if (best === null) return null;
  const view = doc.defaultView;
  const offscreen = view !== null && (best.x < 0 || best.y < 0 || best.x >= view.innerWidth || best.y >= view.innerHeight);
  return { x: best.x, y: best.y, offscreen };
}

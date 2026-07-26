/**
 * `?view=<name>` → the game's declared {@link GameCaptureView}, merged under whatever the URL
 * already carries.
 *
 * A named framing exists so two captures of the same view are actually the same view: a
 * before/after pair built from two hand-typed flag sets drifts, and nothing downstream can tell
 * a drifted framing from a real change. Explicit params still win, so a declared shot is a
 * starting point rather than a cage.
 */
import type { GameCaptureView } from "@jgengine/core/game/playableGame";

export interface CaptureViewOverrides {
  look?: string;
  lookFrom?: string;
  spawn?: string;
  state?: string;
  run?: readonly string[];
  settleMs?: number;
}

export type CaptureViewResolution =
  | { kind: "none" }
  | { kind: "error"; message: string }
  | { kind: "view"; name: string; overrides: CaptureViewOverrides };

/** Sorted view names with their descriptions, for `--list-views` and every failure message. */
export function describeViews(views: Record<string, GameCaptureView> | undefined): string[] {
  return Object.entries(views ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, view]) => (view.description === undefined ? name : `${name} — ${view.description}`));
}

/**
 * Resolve `?view=` against the game's declared views. An unknown name is an error listing what is
 * declared, mirroring `?state=`: silently ignoring it would capture the game's default view and
 * look exactly like a shot that worked.
 */
export function resolveCaptureView(args: {
  views: Record<string, GameCaptureView> | undefined;
  viewName: string | null;
  /** Params already on the URL; each one present here wins over the shot's value. */
  explicit: CaptureViewOverrides;
}): CaptureViewResolution {
  const { views, viewName, explicit } = args;
  if (viewName === null || viewName.length === 0) return { kind: "none" };
  const view = views?.[viewName];
  if (view === undefined) {
    const declared = describeViews(views);
    const detail =
      declared.length > 0 ? `declared views: ${declared.join("; ")}` : "this game declares no capture.views";
    return { kind: "error", message: `unknown capture view "${viewName}" — ${detail}` };
  }
  const pick = <K extends keyof CaptureViewOverrides>(key: K): CaptureViewOverrides[K] =>
    explicit[key] !== undefined ? explicit[key] : (view[key as keyof GameCaptureView] as CaptureViewOverrides[K]);
  const overrides: CaptureViewOverrides = {};
  for (const key of ["look", "lookFrom", "spawn", "state", "run", "settleMs"] as const) {
    const value = pick(key);
    if (value !== undefined) Object.assign(overrides, { [key]: value });
  }
  return { kind: "view", name: viewName, overrides };
}

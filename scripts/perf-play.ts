import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import {
  CdpSession,
  applyCaptureQuality,
  applyDevice,
  assertQualityApplied,
  ensureDevServer,
  navigateCapturePage,
  openPageSession,
  readReportedQuality,
  sweepCaptureProfiles,
  watchPageExceptions,
  withBrowserSession,
  type FrameClock,
} from "./browser-lib";
import { parseGraphicsTier, type GraphicsTier } from "../packages/jgengine/src/templates/captureArgs";
import { ALLOW_MISMATCH_FLAG, engineRecord, resolveEngineIdentity, type EngineRecord } from "./engineIdentity";
import {
  acquireWarmCapture,
  daemonDiedUnder,
  ensureDaemonTarget,
  withDaemonWatch,
  type ShootDaemonState,
} from "./shoot-daemon";
import {
  summarizeFrameWindow,
  type FrameWindow,
  type PerfReport,
  type ProfileEntry as ReportedProfileEntry,
  type ReportLogs,
  type SceneNodeSource,
  type SystemProbeReading,
} from "../packages/core/src/devtools/report";
import {
  ACCESSIBILITY_SETTING_IDS,
  COLORBLIND_OPTIONS,
  HOLD_VS_TOGGLE_OPTIONS,
} from "../packages/core/src/settings/accessibilitySettings";
import {
  GRAPHICS_QUALITY_OPTIONS,
  SETTING_IDS,
  settingStorageKey,
} from "../packages/core/src/settings/settingsModel";

/**
 * Frame-time harness for one game: boots the checkout's dev runner, plays the
 * game on a real GPU, and prints one JSON record of frame timings, renderer
 * counts, GL allocations made after warmup, and the hottest self-time
 * functions.
 *
 *   bun run perf <game> [--quality low|medium|high|ultra] [--draft] [--profile] [--seconds n] [--state name] [--param k=v ...] [--set key=value ...]
 *
 * The JSON goes to stdout alone so it can be piped and diffed; notes and the
 * `--profile` inclusive table go to stderr. `measureGame` is the same sequence
 * without the boot, so the CI budget gate (`scripts/perf-gate.ts`) reuses one
 * dev server and one browser across every game.
 */

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const WARMUP_MS = 5_000;
const DEFAULT_SECONDS = 6;
const PROFILE_SAMPLING_US = 200;
const TOP_SELF = 15;
const TOP_INCLUSIVE = 25;

/** One setting a run turns on before the game boots, echoed beside the numbers it produced. */
export interface PerfSettingOverride {
  /** The id written to settings storage: an engine setting, or the id the game declares. */
  id: string;
  /** What `--set` named: the id or its last segment. */
  key: string;
  value: string;
  /**
   * Where the id is checked. `engine` ids are checked against the engine's table at parse time; `game`
   * ids are checked against the game's own declaration once the dev runner has published it, because
   * only the game knows which ids it reads.
   */
  scope: "engine" | "game";
}

/** One setting a game declares beyond the engine's own, as the dev runner publishes it for the harness. */
export interface DeclaredSetting {
  id: string;
  kind: "slider" | "toggle" | "select" | string;
  options?: string[];
  min?: number;
  max?: number;
}

/** Every persisted setting id the engine publishes, by the id and by its last segment. */
const SETTING_IDS_BY_KEY: ReadonlyMap<string, string> = (() => {
  const byKey = new Map<string, string>();
  for (const id of [...Object.values(SETTING_IDS), ...Object.values(ACCESSIBILITY_SETTING_IDS)]) {
    byKey.set(id, id);
    const segment = id.slice(id.lastIndexOf(".") + 1);
    if (!byKey.has(segment)) byKey.set(segment, id);
  }
  return byKey;
})();

/** Settings whose accepted values the engine publishes, so a typo is an error instead of a silent default. */
const SETTING_VALUES: ReadonlyMap<string, readonly string[]> = new Map([
  [SETTING_IDS.graphicsQuality, GRAPHICS_QUALITY_OPTIONS.map((option) => option.value)],
  [ACCESSIBILITY_SETTING_IDS.colorblind, COLORBLIND_OPTIONS.map((option) => option.value)],
  [ACCESSIBILITY_SETTING_IDS.holdVsToggle, HOLD_VS_TOGGLE_OPTIONS.map((option) => option.value)],
]);

const KNOWN_SETTING_KEYS = [...SETTING_IDS_BY_KEY.keys()].filter((key) => !key.includes(".")).sort();

/**
 * Page params the harness owns. A `--param` that named one would silently change what the
 * run measures (a different game, viewport or tier), so it is refused instead.
 */
const HARNESS_PARAMS: ReadonlySet<string> = new Set(["game", "capture", "device", "telemetry", "quality", "state"]);

export interface PerfArgs {
  game: string;
  /** The tier `--quality` pinned; undefined measures the game's own tier, which the record still names. */
  quality?: GraphicsTier;
  /** `--draft`: the low-tier half-size iteration preset. */
  draft: boolean;
  profile: boolean;
  seconds: number;
  /** In-page sampler on/off for the A/B frame-time overhead comparison. */
  telemetry: "on" | "off";
  /** Settings enabled before boot, so a measured cost names the setting that caused it. */
  settings: PerfSettingOverride[];
  /** The game's `capture.states` entry the run boots into, so two runs are the same scene. */
  state?: string;
  /** Extra page params in the order given (`spawn=…`, `seed=…`), for a scene no state names. */
  params: [string, string][];
  /** rAF clock the browser is launched on; `uncapped` is opt-in and marks the record. */
  frameClock: FrameClock;
  /** Show a real window (off-screen) instead of headless Chrome. */
  headed?: boolean;
  /** `--cold`: boot Chrome and Vite directly instead of reusing the warm daemon. */
  cold?: boolean;
  /** `--allow-engine-mismatch`: serve engine source older than the game's pin on purpose. */
  allowEngineMismatch?: boolean;
}

export type ArgResult = { kind: "run"; args: PerfArgs } | { kind: "help" };

const USAGE = `usage: bun run perf <game> [--quality low|medium|high|ultra] [--draft] [--profile] [--seconds n] [--telemetry on|off]
                    [--state name] [--param k=v ...] [--set key=value ...] [--uncapped] [--headed] [--cold]

  <game>            game id under Games/ (for example harbor-heat)
  --cold            skip the warm daemon and boot Chrome + Vite directly: fresh caches, larger
                    numbers than a warm run, for an evidence run that must prove a clean start.
                    Every run prints which it got: warm: reused :9261 (0.2s) / cold: started :9261 (4.1s)
  --allow-engine-mismatch
                    the dev runner serves engine source from this checkout; a run stops when that
                    source is older than the version the game's catalog pins. This flag records the
                    deliberate exception instead. Every run prints the engine it served.
  --quality         the graphics tier the game renders at (low, medium, high, ultra), pinned on the
                    page URL. The run fails when the page reports a different tier, so a record
                    always names the tier it measured.
  --draft           iteration preset: low tier and half viewport, for a smoke run you will not quote
  --profile         also print the inclusive-time table to stderr
  --seconds         measured window in seconds (default ${DEFAULT_SECONDS})
  --telemetry       in-page report sampler: on (default) or off (?telemetry=off) for an A/B run
  --uncapped        launch the browser with an unthrottled rAF clock (--disable-frame-rate-limit,
                    --disable-gpu-vsync), so frame times are what a frame costs instead of a 16.7 ms
                    vsync multiple. Opt-in: the record then says frameClock uncapped and its ms do not
                    compare with a capped record. Verify the clock took by omission — a browser that
                    stays vsynced fails the run.
  --headed          open a real Chrome window off-screen instead of headless, for debugging a run;
                    never use it for a number you report.
  --state           boot into the game's capture.states entry of this name (?state=name), so two runs
                    are the same scene. An unknown name fails with the states the game declares.
  --param           add a page query parameter; repeatable (?spawn=1,2,3, ?seed=7). The harness's own
                    params (game, capture, device, telemetry, quality, state) are refused.
  --set             enable a setting before boot; repeatable (--set colorblind=grayscale).
                    Key is an engine setting id (accessibility.colorblind) or its last segment, or the
                    exact id the game declares (survey.hints). An unknown key or an unaccepted value
                    fails the run instead of measuring the default.
                    Common engine keys: ${KNOWN_SETTING_KEYS.join(", ")}`;

/**
 * Resolve one `--set key=value` spec. An engine key is checked here; a key that names no engine
 * setting but is pointed (`survey.hints`) is left to the game's own declared table, which only the
 * page can report — so the failure arrives before the measured window, not at parse time.
 */
export function parseSettingSpec(spec: string): PerfSettingOverride {
  const at = spec.indexOf("=");
  if (at <= 0 || at === spec.length - 1) throw new Error(`--set needs key=value (got ${spec})`);
  const key = spec.slice(0, at).trim();
  const value = spec.slice(at + 1).trim();
  const id = SETTING_IDS_BY_KEY.get(key);
  if (id === undefined) {
    // A game's own settings are namespaced `<category>.<name>`; a dotless key is a mistyped engine key.
    if (key.includes(".")) return { id: key, key, value, scope: "game" };
    throw new Error(`unknown setting "${key}" — known engine keys: ${KNOWN_SETTING_KEYS.join(", ")}`);
  }
  const allowed = SETTING_VALUES.get(id);
  if (allowed !== undefined && !allowed.includes(value)) {
    throw new Error(`--set ${key}=${value} must be one of ${allowed.join(", ")}`);
  }
  return { id, key, value, scope: "engine" };
}

/** The game's declared settings the dev runner published, or none when it published nothing usable. */
export function parseDeclaredSettings(raw: string | null | undefined): DeclaredSetting[] {
  if (raw === null || raw === undefined || raw.trim().length === 0) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((entry): DeclaredSetting[] => {
    if (entry === null || typeof entry !== "object") return [];
    const row = entry as { id?: unknown; kind?: unknown; options?: unknown; min?: unknown; max?: unknown };
    if (typeof row.id !== "string" || row.id.length === 0) return [];
    return [
      {
        id: row.id,
        kind: typeof row.kind === "string" ? row.kind : "toggle",
        ...(Array.isArray(row.options) ? { options: row.options.filter((option): option is string => typeof option === "string") } : {}),
        ...(typeof row.min === "number" ? { min: row.min } : {}),
        ...(typeof row.max === "number" ? { max: row.max } : {}),
      },
    ];
  });
}

/** The value problem one declared setting has, or null when the value is the kind the game declared. */
function declaredValueProblem(entry: DeclaredSetting, value: string): string | null {
  if (entry.kind === "toggle") return value === "true" || value === "false" ? null : `must be true or false`;
  if (entry.kind === "slider") {
    const number = Number(value);
    if (value.trim().length === 0 || !Number.isFinite(number)) return "must be a number";
    if (entry.min !== undefined && number < entry.min) return `must be at least ${entry.min}`;
    if (entry.max !== undefined && number > entry.max) return `must be at most ${entry.max}`;
    return null;
  }
  if (entry.kind === "select" && entry.options !== undefined && entry.options.length > 0 && !entry.options.includes(value)) {
    return `must be one of ${entry.options.join(", ")}`;
  }
  return null;
}

/**
 * Check the overrides that named a game setting against what the game declares. A row the game never
 * declared would sit unused in storage and read as free, which is the failure this flag removes.
 */
export function undeclaredSettingErrors(
  settings: readonly PerfSettingOverride[],
  declared: readonly DeclaredSetting[],
): string[] {
  const byKey = new Map<string, DeclaredSetting>();
  for (const entry of declared) {
    byKey.set(entry.id, entry);
    const segment = entry.id.slice(entry.id.lastIndexOf(".") + 1);
    if (!byKey.has(segment)) byKey.set(segment, entry);
  }
  const errors: string[] = [];
  for (const setting of settings) {
    if (setting.scope !== "game") continue;
    const entry = byKey.get(setting.key);
    if (entry === undefined) {
      errors.push(
        declared.length === 0
          ? `unknown setting "${setting.key}" — the game declares no settings of its own`
          : `unknown setting "${setting.key}" — the game declares: ${declared.map((row) => row.id).sort().join(", ")}`,
      );
      continue;
    }
    const problem = declaredValueProblem(entry, setting.value);
    if (problem !== null) errors.push(`--set ${setting.key}=${setting.value} ${problem} (the game declares ${entry.id} a ${entry.kind})`);
  }
  return errors;
}

/**
 * The URL one measured run opens. Overrides are not query params: they are seeded into the page's
 * settings storage, which is where the game reads them, so the printed query stays the harness's.
 * `state` and `params` are the scene pin, and they are query params because that is how the dev
 * runner and the capture CLIs already take a scene.
 */
export function perfPageUrl(options: {
  base: string;
  game: string;
  quality?: GraphicsTier;
  telemetry?: "on" | "off";
  state?: string;
  params?: readonly (readonly [string, string])[];
}): URL {
  const url = new URL(options.base);
  url.searchParams.set("game", options.game);
  url.searchParams.set("mode", "play");
  url.searchParams.set("device", "desktop");
  url.searchParams.set("capture", "1");
  if (options.telemetry === "off") url.searchParams.set("telemetry", "off");
  if (options.state !== undefined) url.searchParams.set("state", options.state);
  for (const [key, value] of options.params ?? []) url.searchParams.set(key, value);
  applyCaptureQuality(url, options.quality);
  return url;
}

/** The stderr line naming the pinned scene, so a printed record says what it was the same as. */
export function perfStateLine(state: string | undefined, params: readonly (readonly [string, string])[] = []): string | null {
  const parts: string[] = [];
  if (state !== undefined) parts.push(`state ${state}`);
  if (params.length > 0) parts.push(`params ${params.map(([key, value]) => `${key}=${value}`).join(" ")}`);
  return parts.length === 0 ? null : `perf: ${parts.join(" · ")}`;
}

/** Runs before the page's own scripts, so the settings store reads the override at mount. */
export function perfSettingsScript(settings: readonly PerfSettingOverride[]): string {
  const entries = settings.map((setting) => [settingStorageKey(setting.id), JSON.stringify(setting.value)]);
  return `(() => {
  try {
    for (const [key, value] of ${JSON.stringify(entries)}) localStorage.setItem(key, value);
  } catch {}
})();`;
}

/** The overrides the page did not keep, so a setting that never reached play fails instead of reading as free. */
export function droppedOverrides(
  settings: readonly PerfSettingOverride[],
  stored: Readonly<Record<string, string | null>>,
): PerfSettingOverride[] {
  return settings.filter((setting) => stored[setting.id] !== JSON.stringify(setting.value));
}

export function parsePerfArgs(argv: readonly string[]): ArgResult {
  if (argv.includes("--help") || argv.includes("-h")) return { kind: "help" };
  let game: string | undefined;
  let quality: GraphicsTier | undefined;
  let draft = false;
  let profile = false;
  let seconds = DEFAULT_SECONDS;
  let telemetry: "on" | "off" = "on";
  let frameClock: FrameClock = "capped";
  let headed = false;
  let cold = false;
  let allowEngineMismatch = false;
  let state: string | undefined;
  const params: [string, string][] = [];
  const settings: PerfSettingOverride[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--profile") {
      profile = true;
      continue;
    }
    if (arg === "--uncapped") {
      frameClock = "uncapped";
      continue;
    }
    if (arg === "--headed") {
      headed = true;
      continue;
    }
    if (arg === "--cold") {
      cold = true;
      continue;
    }
    if (arg === ALLOW_MISMATCH_FLAG) {
      allowEngineMismatch = true;
      continue;
    }
    if (arg === "--draft") {
      draft = true;
      continue;
    }
    if (arg === "--state") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--state needs a capture.states name");
      index += 1;
      if (state !== undefined) throw new Error(`--state given twice (${state}, ${value}) — one scene per run`);
      state = value.trim();
      if (state.length === 0) throw new Error("--state needs a capture.states name");
      continue;
    }
    if (arg === "--param") {
      const spec = argv[index + 1];
      if (spec === undefined || spec.startsWith("--")) throw new Error("--param needs key=value");
      index += 1;
      const at = spec.indexOf("=");
      const key = at <= 0 ? "" : spec.slice(0, at).trim();
      if (key.length === 0) throw new Error(`--param needs key=value (got ${spec})`);
      if (HARNESS_PARAMS.has(key)) {
        throw new Error(`--param ${key} is the harness's own — ${key === "state" ? "use --state <name>" : "it would change what the run measures"}`);
      }
      if (params.some(([existing]) => existing === key)) throw new Error(`--param ${key} given twice — one value per param`);
      params.push([key, spec.slice(at + 1).trim()]);
      continue;
    }
    if (arg === "--set") {
      const spec = argv[index + 1];
      if (spec === undefined) throw new Error("--set needs key=value");
      index += 1;
      const override = parseSettingSpec(spec);
      if (settings.some((existing) => existing.id === override.id)) {
        throw new Error(`--set ${override.id} given twice — one value per setting`);
      }
      settings.push(override);
      continue;
    }
    if (arg === "--quality" || arg === "--seconds" || arg === "--telemetry") {
      const value = argv[index + 1];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      index += 1;
      if (arg === "--quality") quality = parseGraphicsTier(value);
      else if (arg === "--telemetry") {
        if (value !== "on" && value !== "off") throw new Error(`--telemetry must be on or off (got ${value})`);
        telemetry = value;
      } else {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`--seconds must be a positive number (got ${value})`);
        seconds = parsed;
      }
      continue;
    }
    if (arg.startsWith("-")) throw new Error(`unknown flag ${arg}`);
    if (game !== undefined) throw new Error(`one game per run (got ${game} and ${arg})`);
    game = arg;
  }
  if (game === undefined) throw new Error("a game id is required");
  if (draft && quality !== undefined) throw new Error(`--draft is the iteration preset (low tier, half viewport), so drop it or drop --quality ${quality}`);
  return { kind: "run", args: { game, ...(quality === undefined ? {} : { quality }), draft, profile, seconds, telemetry, settings, frameClock, ...(headed ? { headed: true } : {}), ...(cold ? { cold: true } : {}), ...(allowEngineMismatch ? { allowEngineMismatch: true } : {}), ...(state === undefined ? {} : { state }), params } };
}

/** One sampled stack frame reduced to a readable key and its self time. */
export type ProfileEntry = ReportedProfileEntry;


interface ProfileNode {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number; columnNumber: number };
  children?: number[];
}

/**
 * Reduce a CDP CPU profile to self-time per function. Dev-runner URLs identify
 * the real source file, so names stay readable instead of minified.
 */
export function aggregateSelfTime(
  profile: { nodes: readonly ProfileNode[]; samples: readonly number[]; timeDeltas: readonly number[] },
  windowMs: number,
  top = TOP_SELF,
): ProfileEntry[] {
  const byId = new Map<number, ProfileNode>(profile.nodes.map((node) => [node.id, node]));
  const self = new Map<string, number>();
  profile.samples.forEach((id, index) => {
    const key = frameKey(byId.get(id));
    if (key === null) return;
    self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas[index] ?? 0));
  });
  return rank(self, windowMs, top);
}

/** Inclusive (self + callees) time per function, used by `--profile`. */
export function aggregateInclusiveTime(
  profile: { nodes: readonly ProfileNode[]; samples: readonly number[]; timeDeltas: readonly number[] },
  windowMs: number,
  top = TOP_INCLUSIVE,
): ProfileEntry[] {
  const byId = new Map<number, ProfileNode>(profile.nodes.map((node) => [node.id, node]));
  const parent = new Map<number, number>();
  for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
  const inclusive = new Map<string, number>();
  profile.samples.forEach((id, index) => {
    const us = profile.timeDeltas[index] ?? 0;
    const seen = new Set<string>();
    let current: number | undefined = id;
    while (current !== undefined) {
      const key = frameKey(byId.get(current));
      if (key !== null && !seen.has(key)) {
        seen.add(key);
        inclusive.set(key, (inclusive.get(key) ?? 0) + us);
      }
      current = parent.get(current);
    }
  });
  return rank(inclusive, windowMs, top);
}

function frameKey(node: ProfileNode | undefined): string | null {
  if (node === undefined) return null;
  const name = node.callFrame.functionName.length > 0 ? node.callFrame.functionName : "(anonymous)";
  const file = node.callFrame.url.replace(/^https?:\/\/[^/]+/, "").replace(/\?.*$/, "");
  if (file.length === 0) return name;
  const parts = file.split("/").filter((part) => part.length > 0);
  const tail = parts.slice(-3).join("/");
  return `${name}\t${tail}:${node.callFrame.lineNumber + 1}:${node.callFrame.columnNumber + 1}`;
}

function rank(totals: ReadonlyMap<string, number>, windowMs: number, top: number): ProfileEntry[] {
  return [...totals]
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([key, us]) => {
      const [fn = "(anonymous)", at = ""] = key.split("\t");
      return {
        fn,
        at,
        selfMs: Math.round((us / 1000) * 10) / 10,
        selfPct: windowMs > 0 ? Math.round((us / (windowMs * 1000)) * 1000) / 10 : 0,
      };
    });
}

export type { FrameWindow } from "../packages/core/src/devtools/report";

/** Frame timings from requestAnimationFrame deltas, the interval a player sees. */
export function summarizeFrameDeltas(deltas: readonly number[]): FrameWindow {
  return summarizeFrameWindow(deltas);
}

/**
 * Counts GL objects created after warmup, so a leak shows up as non-zero
 * programs/framebuffers/allocations on a steady-state frame loop.
 */
const GL_COUNTERS_SCRIPT = `(() => {
  if (globalThis.__jgPerfGl !== undefined) return;
  const since = { programsLinked: 0, framebuffers: 0, buffers: 0, textures: 0, vertexArrays: 0 };
  const counts = { programsLinked: 0, framebuffers: 0, buffers: 0, textures: 0, vertexArrays: 0 };
  const wrap = (proto, method, key) => {
    const original = proto[method];
    if (typeof original !== "function") return;
    proto[method] = function (...args) {
      counts[key] += 1;
      since[key] += 1;
      return original.apply(this, args);
    };
  };
  for (const name of ["WebGLRenderingContext", "WebGL2RenderingContext"]) {
    const proto = globalThis[name]?.prototype;
    if (proto === undefined) continue;
    wrap(proto, "linkProgram", "programsLinked");
    wrap(proto, "createFramebuffer", "framebuffers");
    wrap(proto, "createBuffer", "buffers");
    wrap(proto, "createTexture", "textures");
    wrap(proto, "createVertexArray", "vertexArrays");
  }
  globalThis.__jgPerfGl = {
    counts,
    since,
    reset() {
      for (const key of Object.keys(since)) since[key] = 0;
    },
  };
})();`;

/**
 * Counts every draw call the page issues, bucketed by animation frame, so a draw budget
 * describes a whole frame instead of one of its passes. three wraps each pass in its own
 * `render()`, and a post chain adds a normal/depth prepass and fullscreen quads, so the
 * renderer's counter only survives all of them while `info.autoReset` is off and one owner
 * resets it per frame. Wrapping the draw calls needs no such cooperation: every pass and
 * every instanced draw is one call here, which is the number the GPU is handed.
 */
const DRAW_FRAME_COUNTER_SCRIPT = `(() => {
  if (globalThis.__jgPerfDraws !== undefined) return;
  const state = { frames: [], pending: 0, counting: false };
  const wrapped = new WeakSet();
  const drawMethods = [
    "drawArrays",
    "drawElements",
    "drawArraysInstanced",
    "drawElementsInstanced",
    "drawRangeElements",
  ];
  for (const name of ["WebGLRenderingContext", "WebGL2RenderingContext"]) {
    const proto = globalThis[name]?.prototype;
    if (proto === undefined) continue;
    for (const method of drawMethods) {
      const original = proto[method];
      if (typeof original !== "function" || wrapped.has(original)) continue;
      wrapped.add(original);
      proto[method] = function (...args) {
        if (state.counting) state.pending += 1;
        return original.apply(this, args);
      };
    }
  }
  const tick = () => {
    if (state.counting) state.frames.push(state.pending);
    state.pending = 0;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  globalThis.__jgPerfDraws = {
    start() {
      state.frames = [];
      state.pending = 0;
      state.counting = true;
    },
    stop() {
      state.counting = false;
      return state.frames.slice(0);
    },
  };
})();`;

/** Whole-frame draw counts for one measured window, from the per-frame samples. */
export interface FrameDraws {
  /** Frames the counter sampled; 0 means the page never registered a frame. */
  frames: number;
  min: number;
  p50: number;
  p95: number;
  max: number;
}

/**
 * Reduce per-frame draw totals to the number a budget compares. The p95 is the gate's
 * figure: a shadow or prepass that runs on a cadence is counted, a single spike is not,
 * and it moved by under 2% between runs of the same build where the median moved 12%.
 */
export function summarizeFrameDraws(frames: readonly number[]): FrameDraws {
  const kept = frames.filter((value) => Number.isFinite(value) && value >= 0);
  if (kept.length === 0) return { frames: 0, min: 0, p50: 0, p95: 0, max: 0 };
  const sorted = [...kept].sort((a, b) => a - b);
  const at = (fraction: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]!;
  return {
    frames: kept.length,
    min: sorted[0]!,
    p50: at(0.5),
    p95: at(0.95),
    max: sorted[sorted.length - 1]!,
  };
}

const SAMPLE_FRAMES_SCRIPT = (windowMs: number): string => `new Promise((resolve) => {
  const deltas = [];
  let last = performance.now();
  const startedAt = last;
  const tick = (now) => {
    deltas.push(now - last);
    last = now;
    if (now - startedAt >= ${windowMs}) resolve(deltas);
    else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})`;

/**
 * Resource timing keeps 250 entries by default: a heavy game evicts the three.js module
 * from the list before the node counter looks for it, which read as "nodes unavailable"
 * on a scene that plainly rendered. Raise it before any page script runs.
 */
const RESOURCE_BUFFER_SCRIPT = `(() => {
  try { performance.setResourceTimingBufferSize(4000); } catch {}
})();`;

/** Window the blank-page probe samples: long enough for a few hundred uncapped ticks. */
const CLOCK_PROBE_MS = 300;
/** Probe samples one uncapped run may take before its clock reads as frozen. */
const CLOCK_PROBE_ATTEMPTS = 3;
/** The slowest median blank-page rAF delta still read as an uncapped clock, in ms. */
const UNCAPPED_CLOCK_MAX_MS = 8;

/** Why a run that asked for the uncapped clock is still vsynced, or null when the probe agrees. */
export function cappedClockProblem(medianMs: number): string | null {
  if (!Number.isFinite(medianMs) || medianMs <= 0) return "the clock probe saw no animation frames at all";
  if (medianMs <= UNCAPPED_CLOCK_MAX_MS) return null;
  return `a blank page still ticked at ${Math.round(medianMs * 10) / 10} ms, so rAF is on the display's commit clock and these frame times are 16.7 ms multiples`;
}

/**
 * Median rAF delta on the blank page the session opens with, before the game loads.
 * An uncapped browser ticks well under the 16.7 ms commit interval; a capped one ticks at it.
 * Sampling the clock on its own keeps "the game costs 16.7 ms" from reading the same as
 * "the launch flags never took". A browser still starting its compositor can serve the first
 * sample off the display clock, so a reading that fails is retried: a capped browser fails
 * every attempt, while a startup race passes the next one.
 */
export async function probeFrameClockMs(
  session: CdpSession,
  windowMs = CLOCK_PROBE_MS,
  attempts = CLOCK_PROBE_ATTEMPTS,
): Promise<number> {
  let slowest = 0;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const deltas = (await session.evaluate<number[]>(SAMPLE_FRAMES_SCRIPT(windowMs), { awaitPromise: true })) ?? [];
    const kept = deltas.filter((ms) => Number.isFinite(ms) && ms > 0).sort((a, b) => a - b);
    const median = kept.length === 0 ? 0 : kept[Math.floor(kept.length / 2)]!;
    if (median > 0 && median <= UNCAPPED_CLOCK_MAX_MS) return median;
    slowest = Math.max(slowest, median);
  }
  return slowest;
}

/** The stderr line that keeps an uncapped record from being read as a capped one, or null when capped. */
export function perfFrameClockLine(clock: FrameClock): string | null {
  return clock === "uncapped"
    ? "perf: frame clock uncapped (rAF off the vsync clock) — these ms are not comparable with a capped record"
    : null;
}

interface GlCounts {
  counts: Record<string, number>;
  since: Record<string, number>;
}

interface SceneNodeCount {
  nodes: number | null;
  source: SceneNodeSource;
  scenes: number;
}

function remoteObjectId(result: Record<string, unknown>): string | undefined {
  return (result.result as { objectId?: string } | undefined)?.objectId;
}

/**
 * Count live three.js scene-graph nodes. The page's own sampler counts them from the
 * live scene (`window.__JG.report().render`), which is the same number and does not
 * depend on resource-timing entries surviving; when the sampler is off (an A/B run),
 * fall back to the dev runner's three module, imported by its served URL so
 * `queryObjects` hands back every live instance.
 */
export async function measureSceneNodes(session: CdpSession): Promise<SceneNodeCount> {
  try {
    const fromPage = await session.evaluate<{ nodes: number | null; scenes: number; source: SceneNodeSource }>(`(() => {
      const render = window.__JG?.report?.()?.render;
      if (render === undefined || typeof render.nodes !== "number") return null;
      return { nodes: render.nodes, scenes: render.scenes ?? 1, source: render.nodesSource ?? "scene-graph" };
    })()`);
    if (fromPage !== null && fromPage !== undefined && typeof fromPage.nodes === "number") {
      return { nodes: fromPage.nodes, source: fromPage.source, scenes: fromPage.scenes };
    }
  } catch {
    /* fall through to the CDP walk */
  }
  try {
    await session.send("Runtime.enable");
    const namespace = await session.send("Runtime.evaluate", {
      expression: `(async () => {
        const urls = performance.getEntriesByType("resource").map((entry) => entry.name);
        const url = urls.find((name) => /\\/deps\\/three(\\.module)?\\.js(\\?|$)/.test(name))
          ?? urls.find((name) => /node_modules\\/three\\//.test(name));
        if (url === undefined) return null;
        return await import(url);
      })()`,
      awaitPromise: true,
    });
    const namespaceId = remoteObjectId(namespace);
    if (namespaceId === undefined) return { nodes: null, source: "unavailable", scenes: 0 };

    const counted = await countInstances(session, namespaceId, "Scene", "isScene");
    if (counted.scenes > 0) return { nodes: counted.nodes, source: "scene-graph", scenes: counted.scenes };

    const fallback = await countInstances(session, namespaceId, "Object3D", "isObject3D");
    if (fallback.nodes > 0) return { nodes: fallback.nodes, source: "heap-object3d", scenes: counted.scenes };
    return { nodes: null, source: "unavailable", scenes: counted.scenes };
  } catch {
    return { nodes: null, source: "unavailable", scenes: 0 };
  }
}

async function countInstances(
  session: CdpSession,
  namespaceId: string,
  className: string,
  brand: string,
): Promise<{ nodes: number; scenes: number }> {
  const prototype = await session.send("Runtime.callFunctionOn", {
    objectId: namespaceId,
    functionDeclaration: `function () { return this.${className} === undefined ? null : this.${className}.prototype }`,
  });
  const prototypeId = remoteObjectId(prototype);
  if (prototypeId === undefined) return { nodes: 0, scenes: 0 };

  const found = await session.send("Runtime.queryObjects", { prototypeObjectId: prototypeId });
  const arrayId = ((found.objects ?? {}) as { objectId?: string }).objectId;
  if (arrayId === undefined) return { nodes: 0, scenes: 0 };

  const counted = await session.send("Runtime.callFunctionOn", {
    objectId: arrayId,
    functionDeclaration: `function () {
      let scenes = 0, nodes = 0;
      for (const value of this) {
        if (value === null || typeof value !== "object" || value.${brand} !== true) continue;
        scenes += 1;
        if (typeof value.traverse === "function") value.traverse(() => { nodes += 1 });
        else nodes += 1;
      }
      return { scenes, nodes };
    }`,
    returnByValue: true,
  });
  const value = (counted.result as { value?: { scenes?: number; nodes?: number } } | undefined)?.value;
  return { nodes: value?.nodes ?? 0, scenes: value?.scenes ?? 0 };
}

/** Everything one measured window says about a game, as printed by `bun run perf`. */
export interface PerfRecord extends PerfReport {
  /** The settings this run enabled, `id=value` each, so its numbers carry their cause. */
  overrides: string[];
  /** The `capture.states` entry the run booted into, or null when it played the plain start. */
  state: string | null;
  /** Extra page params the run pinned beside the state, `k=v` each. */
  params: string[];
  /**
   * The rAF clock the browser ran on. `capped` frame times are vsync multiples (16.7 ms steps) and
   * `uncapped` ones are what a frame costs, so the two never compare to each other.
   */
  frameClock: FrameClock;
  /** Which engine the measured window rendered, so a saved record can be audited later. */
  engine?: EngineRecord;
}
export type { PerfReport };

interface RawProfile {
  nodes: ProfileNode[];
  samples: number[];
  timeDeltas: number[];
}

export interface MeasureOptions {
  /** Page target to measure; the caller owns opening and closing it. */
  session: CdpSession;
  /** Dev-server base URL, e.g. `http://127.0.0.1:4601`. */
  base: string;
  game: string;
  /** The graphics tier to pin; omitted measures whatever tier the game itself resolves. */
  quality?: GraphicsTier;
  /** Half viewport at the low tier, for a quick smoke run. */
  draft?: boolean;
  seconds?: number;
  warmupMs?: number;
  /** Run the CPU profiler pass afterwards; the budget gate does not need it. */
  profile?: boolean;
  /** In-page report sampler: `off` loads the same build with `?telemetry=off` for an A/B run. */
  telemetry?: "on" | "off";
  /** Settings seeded into the page's settings storage before it boots. */
  settings?: readonly PerfSettingOverride[];
  /** The game's `capture.states` entry to boot into, so two runs are the same scene. */
  state?: string;
  /** Extra page params pinned beside the state (`spawn=…`, `seed=…`). */
  params?: readonly (readonly [string, string])[];
  /** The rAF clock the caller launched the browser on, echoed into the record. */
  frameClock?: FrameClock;
}

export interface PerfMeasure {
  record: PerfRecord;
  /** Raw profile for the inclusive table (`--profile`); null when profiling was skipped. */
  profile: RawProfile | null;
  /** Wall-clock length of the profile window in ms, for percentages. */
  profileMs: number;
  /** Blank-page rAF median the uncapped run proved its clock with, or null on the capped path. */
  clockProbeMs: number | null;
}

function readGpu(session: CdpSession): Promise<string | undefined> {
  return session.evaluate<string>(`(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (gl === null) return "no webgl2";
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const vendor = info === null ? "" : String(gl.getParameter(info.UNMASKED_VENDOR_WEBGL));
    const renderer = info === null ? String(gl.getParameter(gl.RENDERER)) : String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
    return vendor.length > 0 ? vendor + " " + renderer : renderer;
  })()`);
}

function printInclusive(entries: readonly ProfileEntry[]): void {
  console.error("perf: inclusive time (self + callees)");
  for (const entry of entries) {
    console.error(`${entry.selfMs.toFixed(1).padStart(8)} ms  ${entry.selfPct.toFixed(1).padStart(5)}%  ${entry.fn}  ${entry.at}`);
  }
}

/**
 * Read the seeded values back after boot. A page that drops them (a game resetting storage, a
 * mount that rewrites a default) would otherwise print a number described by a setting it never
 * had, which is the whole failure this flag exists to remove. A game-scoped id is also checked
 * against the settings the game declares, read from the dev runner's published table.
 */
async function confirmSettings(session: CdpSession, settings: readonly PerfSettingOverride[]): Promise<void> {
  if (settings.some((setting) => setting.scope === "game")) {
    const declared = parseDeclaredSettings(
      await session.evaluate<string | null>(`document.documentElement.dataset.jgSettings ?? null`),
    );
    const errors = undeclaredSettingErrors(settings, declared);
    if (errors.length > 0) throw new Error(`perf: ${errors.join("; ")}`);
  }
  const keys = settings.map((setting) => settingStorageKey(setting.id));
  const stored = await session.evaluate<Record<string, string | null>>(`(() => {
    const out = {};
    for (const key of ${JSON.stringify(keys)}) out[key] = localStorage.getItem(key);
    return out;
  })()`);
  const byId: Record<string, string | null> = {};
  settings.forEach((setting, index) => {
    byId[setting.id] = stored?.[keys[index]!] ?? null;
  });
  const dropped = droppedOverrides(settings, byId);
  if (dropped.length > 0) {
    throw new Error(
      `perf: the page did not keep ${dropped.map((setting) => `${setting.key}=${setting.value}`).join(", ")} — its numbers would not describe that setting`,
    );
  }
}

/**
 * Play one game and measure it: warm up, sample frame deltas, snapshot renderer
 * and scene counts, and read the GL objects created after warmup.
 */
export async function measureGame(options: MeasureOptions): Promise<PerfMeasure> {
  const { session, base, game, quality, seconds = DEFAULT_SECONDS, warmupMs = WARMUP_MS } = options;
  const draft = options.draft ?? false;
  const profileRun = options.profile ?? true;
  const settings = options.settings ?? [];
  const params = options.params ?? [];
  const frameClock = options.frameClock ?? "capped";

  let clockProbeMs: number | null = null;
  if (frameClock === "uncapped") {
    const clockMs = await probeFrameClockMs(session);
    const problem = cappedClockProblem(clockMs);
    if (problem !== null) throw new Error(`perf: --uncapped did not take — ${problem}`);
    clockProbeMs = Math.round(clockMs * 100) / 100;
  }

  await session.send("Page.enable");
  await session.send("Page.addScriptToEvaluateOnNewDocument", { source: RESOURCE_BUFFER_SCRIPT });
  await session.send("Page.addScriptToEvaluateOnNewDocument", { source: GL_COUNTERS_SCRIPT });
  await session.send("Page.addScriptToEvaluateOnNewDocument", { source: DRAW_FRAME_COUNTER_SCRIPT });
  if (settings.length > 0) {
    await session.send("Page.addScriptToEvaluateOnNewDocument", { source: perfSettingsScript(settings) });
  }
  const throws = watchPageExceptions(session);
  await applyDevice(session, "desktop", draft ? "half" : "full");
  const url = perfPageUrl({ base, game, quality, telemetry: options.telemetry, state: options.state, params });
  // Same navigation the capture tools use: it fails on a page exception or a failed document
  // instead of waiting out the readiness timeout.
  await navigateCapturePage(session, url.toString(), 90_000);
  // The tier the game resolved, not the flag: a record that names a tier it never rendered at is
  // exactly the evidence gap this flag closes.
  const reportedTier = await readReportedQuality(session);
  if (quality !== undefined) assertQualityApplied(quality, reportedTier);
  if (settings.length > 0) await confirmSettings(session, settings);
  await session.evaluate(`window.__jgengineAgent?.handle?.({ method: "debug_perf_reset" })`);

  const gpu = (await readGpu(session)) ?? "unknown";
  if (/swiftshader|llvmpipe|software/i.test(gpu)) {
    console.error(`perf: software rasterizer (${gpu}) — frame times are not a GPU measurement`);
  }

  await session.evaluate(`new Promise((r) => setTimeout(r, ${warmupMs}))`, { awaitPromise: true });
  await session.evaluate(`window.__jgPerfGl?.reset?.()`);
  await session.evaluate(`window.__jgengineAgent?.handle?.({ method: "debug_perf_reset" })`);

  // Frame timings are sampled without the profiler running, so the fps and
  // percentiles are the loop the player gets; the profile window is separate.
  await session.evaluate(`globalThis.__jgPerfDraws?.start?.()`);
  const startedAt = Date.now();
  const deltas = (await session.evaluate<number[]>(SAMPLE_FRAMES_SCRIPT(seconds * 1000), { awaitPromise: true })) ?? [];
  const drawFrames = (await session.evaluate<number[]>(`globalThis.__jgPerfDraws?.stop?.() ?? []`)) ?? [];
  const windowMs = Date.now() - startedAt;
  const frameDraws = summarizeFrameDraws(drawFrames);

  const snapshot = await session.evaluate<{
    frame: { avgSimMs?: number; avgOutsideMs?: number; phases?: unknown[] } | null;
    render: { drawCalls: number; triangles: number; geometries: number; textures: number } | null;
    probes?: Record<string, unknown>;
    systems?: Record<string, SystemProbeReading>;
    logSummary?: ReportLogs;
    longFrames?: unknown[];
  }>(`window.__jgengineAgent?.handle?.({ method: "debug_snapshot" })?.snapshot ?? null`);
  const gl = (await session.evaluate<GlCounts | null>(`globalThis.__jgPerfGl ?? null`)) ?? { counts: {}, since: {} };
  const sceneNodes = await measureSceneNodes(session);
  const size = await session.evaluate<{ w: number; h: number }>(`({ w: innerWidth, h: innerHeight })`);

  const frame = summarizeFrameDeltas(deltas);
  const since = gl.since;
  const allocations =
    (since.buffers ?? 0) +
    (since.textures ?? 0) +
    (since.vertexArrays ?? 0) +
    (since.programsLinked ?? 0) +
    (since.framebuffers ?? 0);
  const residentPrograms = snapshot?.probes?.shaderPrograms;

  let raw: RawProfile | null = null;
  let profiledMs = 0;
  if (profileRun) {
    await session.send("Profiler.enable");
    await session.send("Profiler.setSamplingInterval", { interval: PROFILE_SAMPLING_US });
    await session.send("Profiler.start");
    const profiledAt = Date.now();
    await session.evaluate(`new Promise((r) => setTimeout(r, ${seconds * 1000}))`, { awaitPromise: true });
    profiledMs = Date.now() - profiledAt;
    const stopped = await session.send("Profiler.stop");
    raw = (stopped.profile ?? { nodes: [], samples: [], timeDeltas: [] }) as RawProfile;
  }

  const top = raw === null ? [] : aggregateSelfTime(raw, profiledMs);

  const record: PerfRecord = {
    game,
    gpu,
    quality: reportedTier ?? quality ?? "unknown",
    viewport: `${size?.w ?? 0}x${size?.h ?? 0}`,
    seconds: Math.round((windowMs / 1000) * 10) / 10,
    at: Date.now(),
    frame,
    render: {
      draws: snapshot?.render?.drawCalls ?? null,
      drawsFrame: frameDraws.frames === 0 ? null : frameDraws.p95,
      drawsFrames: frameDraws.frames,
      triangles: snapshot?.render?.triangles ?? null,
      geometries: snapshot?.render?.geometries ?? null,
      textures: snapshot?.render?.textures ?? null,
      nodes: sceneNodes.nodes,
      nodesSource: sceneNodes.source,
      scenes: sceneNodes.scenes,
    },
    gl: {
      programsLinked: since.programsLinked ?? 0,
      framebuffers: since.framebuffers ?? 0,
      buffers: since.buffers ?? 0,
      textures: since.textures ?? 0,
      vertexArrays: since.vertexArrays ?? 0,
      allocations,
      residentPrograms: typeof residentPrograms === "number" ? residentPrograms : null,
      total: gl.counts,
      attached: (gl.counts.buffers ?? 0) + (gl.counts.textures ?? 0) > 0,
    },
    sim:
      snapshot?.frame === null || snapshot?.frame === undefined
        ? null
        : {
            avgMs: Math.round((snapshot.frame.avgSimMs ?? 0) * 100) / 100,
            outsideMs: Math.round((snapshot.frame.avgOutsideMs ?? 0) * 100) / 100,
          },
    profile: raw === null ? null : { samplingUs: PROFILE_SAMPLING_US, seconds: Math.round((profiledMs / 1000) * 10) / 10, top },
    systems: snapshot?.systems ?? {},
    logs: snapshot?.logSummary ?? null,
    telemetry: null,
    overrides: settings.map((setting) => `${setting.id}=${setting.value}`),
    state: options.state ?? null,
    params: params.map(([key, value]) => `${key}=${value}`),
    frameClock,
  };

  const draws = record.render.draws;
  if (draws !== null && draws > 0 && frameDraws.frames > 0 && (draws < frameDraws.min || draws > frameDraws.max)) {
    console.error(
      `perf: renderer counter read ${draws} draws, outside the whole-frame range ${frameDraws.min}-${frameDraws.max} the wrapped calls saw — one of the two is not counting a frame`,
    );
  }
  throws.stop();
  // A game that threw and kept rendering is not a game that works: the frame counts read like a
  // pass, so the throw is the verdict.
  if (throws.exceptions.length > 0) {
    throw new Error(`${game} threw while being measured: ${throws.exceptions.join("; ")}`);
  }

  return { record, profile: raw, profileMs: profiledMs, clockProbeMs };
}

async function main(): Promise<void> {
  const parsed = parsePerfArgs(process.argv.slice(2));
  if (parsed.kind === "help") {
    console.log(USAGE);
    return;
  }
  const { game, quality, draft, profile, seconds, telemetry, settings, state, params, frameClock, headed } = parsed.args;

  sweepCaptureProfiles();

  if (!existsSync(join(repoRoot, "Games", game, "src", "index.tsx"))) {
    throw new Error(`no game "${game}" in Games/ — run \`bun run games:clone\` first, then retry`);
  }

  // Before any browser: a number measured on an engine older than the game's pin describes a build
  // nobody runs. The dev runner serves this checkout's source, so name it and stop on a mismatch.
  const identity = resolveEngineIdentity({ game, allowMismatch: parsed.args.allowEngineMismatch === true, tool: "perf" });
  console.error(identity.line);
  if (!identity.allowed) {
    console.error(identity.refusal);
    process.exit(1);
  }
  const measuredEngine = engineRecord(identity);

  // The daemon's Chrome runs the display's frame clock and no window, so a run that pins its own
  // clock or asks for a window must launch its own browser instead of borrowing the daemon's.
  const ownBrowser = frameClock === "uncapped"
    ? "--uncapped needs its own browser flags"
    : headed
      ? "--headed needs its own browser window"
      : undefined;
  const warm = await acquireWarmCapture({
    cold: parsed.args.cold === true || ownBrowser !== undefined,
    ...(ownBrowser === undefined ? {} : { because: ownBrowser }),
  });
  /**
   * One measured run against a target: the warm daemon when there is one, otherwise a Vite and
   * Chrome this run owns. A function so a daemon that dies under a run can be retried cold once.
   */
  const runPerf = async (daemon: ShootDaemonState | null): Promise<number> => {
    const server = daemon === null ? await ensureDevServer(repoRoot) : await ensureDaemonTarget(daemon, "dev");
    return withDaemonWatch(daemon, withBrowserSession(
      {
        keep: false,
        timeoutMs: 120_000,
        frameClock,
        headed,
        server: server.child,
        serverPid: server.pid,
        debugPort: daemon?.chromePort,
        attach: daemon !== null,
        leaveWarm: daemon !== null,
      },
      async ({ debugPort }) => {
        const session = await openPageSession(debugPort);
        try {
          const measured = await measureGame({ session, base: server.base, game, quality, draft, seconds, telemetry, settings, state, params, frameClock });
          if (measuredEngine !== null) measured.record.engine = measuredEngine;
          console.error(`perf: tier ${measured.record.quality}${draft ? " (draft: low tier, half viewport)" : ""}`);
          const pin = perfStateLine(state, params);
          if (pin !== null) console.error(pin);
          const clock = perfFrameClockLine(frameClock);
          if (clock !== null) console.error(clock);
          if (measured.clockProbeMs !== null) {
            console.error(`perf: blank page ticked at ${measured.clockProbeMs} ms on the uncapped clock`);
          }
          if (measured.record.overrides.length > 0) {
            console.error(`perf: overrides ${measured.record.overrides.join(" ")}`);
          }
          console.log(JSON.stringify(measured.record, null, 2));
          if (profile && measured.profile !== null) {
            printInclusive(aggregateInclusiveTime(measured.profile, measured.profileMs));
          }
          if (measured.record.profile?.top.length === 0) console.error("perf: the CPU profile produced no samples");
          if (measured.record.gl.attached !== true) {
            console.error("perf: GL allocation counters saw no activity — the WebGL hooks did not attach");
          }
          if (measured.record.render.nodes === null) console.error("perf: could not count scene nodes on this page");
        } finally {
          await session.close();
        }
      },
    ));
  };

  let exitCode = await runPerf(warm.daemon).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    return 1;
  });
  if (warm.daemon !== null && exitCode !== 0 && (await daemonDiedUnder(warm.daemon))) {
    console.error(
      `cold: the daemon on :${warm.daemon.chromePort} died mid-run — falling back to a direct launch, no retry`,
    );
    exitCode = await runPerf(null).catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      return 1;
    });
  }
  if (exitCode !== 0) process.exit(exitCode);
}

if (import.meta.main) {
  await main();
}

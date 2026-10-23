/**
 * One flag table and one parser for every capture CLI: the engine's `bun run shoot/drive`
 * (scripts/shoot-dev.ts, scripts/drive-dev.ts) and the dependency-free `shoot.mjs`/`drive.mjs`
 * a scaffold and `jgengine shoot/drive` ship. Both import or embed these exact functions, so a
 * flag cannot exist in one and silently mean something else (or nothing) in the other.
 *
 * Every function here is self-contained (no imports, no outer references) because the bundled
 * harness embeds it with `Function.prototype.toString`.
 */

/** Which CLI a flag belongs to. */
export type CaptureTool = "shoot" | "drive";

/** One capture CLI flag. `engineOnly` flags parse everywhere but only the engine dev runner honors them. */
export interface CaptureFlag {
  flag: string;
  tools: readonly CaptureTool[];
  /** `none` is a switch; `optional` takes the next argument unless it starts with `--`. */
  value: "none" | "required" | "optional";
  /** Ordered interaction step instead of a session option. */
  step?: boolean;
  /** Collects every occurrence. */
  repeat?: boolean;
  /** Why only the engine dev runner (apps/dev + daemon) can honor it. */
  engineOnly?: string;
  arg?: string;
  help: string;
}

const RUNNER = "needs the engine dev runner";

/** The single source of truth for shoot/drive flags, help text and host support. */
export const CAPTURE_FLAGS: readonly CaptureFlag[] = [
  { flag: "--steps", tools: ["drive"], value: "required", arg: "<file>", engineOnly: "needs the engine dev runner to land shots in the game's docs/ folder", help: "run a JSON step file; cannot be mixed with step flags (see \"Script a drive\")" },
  { flag: "--check", tools: ["drive"], value: "none", engineOnly: "needs the engine dev runner to resolve the step file", help: "with --steps: parse, print the resolved steps with their durations, exit without a browser" },
  { flag: "--click", tools: ["drive"], value: "required", step: true, arg: "<text>", help: "click the first settled, enabled element containing this text (or aria-label)" },
  { flag: "--double-click", tools: ["drive"], value: "required", step: true, arg: "<text>", help: "double-click an actionable text target" },
  { flag: "--click-at", tools: ["drive"], value: "required", step: true, arg: "<x,y>", help: "native left click at CSS viewport pixels (canvas targets, map orders)" },
  { flag: "--right-click-at", tools: ["drive"], value: "required", step: true, arg: "<x,y>", help: "native right click there (RTS move/attack orders, context menus)" },
  { flag: "--fill", tools: ["drive"], value: "required", step: true, arg: "<label=value>", help: "replace a text field by its accessible label, then Tab to commit" },
  { flag: "--key", tools: ["drive"], value: "required", step: true, arg: "<CODE:ms>", help: "hold a key (KeyW:2500), a chord (KeyW+KeyD:2000) or a mouse button over the canvas (mouse0:1200)" },
  { flag: "--wait", tools: ["drive"], value: "required", step: true, arg: "<ms>", help: "pause before the next step" },
  { flag: "--reload", tools: ["drive"], value: "none", step: true, help: "reload the page and await readiness again, keeping this run's storage" },
  { flag: "--shot", tools: ["drive"], value: "required", step: true, arg: "<name|/abs/path.png>", help: "screenshot: a bare name lands in shots/, an absolute path is written verbatim" },
  { flag: "--rpc", tools: ["drive"], value: "required", step: true, arg: "<json>", help: "call the page's agent/editor bridge; debug_snapshot prints the compact summary unless the payload sets detail:\"full\"" },
  { flag: "--probe", tools: ["drive"], value: "optional", step: true, arg: "[name]", help: "print the game's capture.probe metrics as JSON (pair one before and one after a --key hold)" },
  { flag: "--url", tools: ["shoot", "drive"], value: "required", arg: "<url>", help: "capture/drive this page instead of the default target" },
  { flag: "--port", tools: ["shoot", "drive"], value: "required", arg: "<n>", help: "dev-server port to use or start" },
  { flag: "--device", tools: ["shoot", "drive"], value: "required", arg: "<desktop|mobile|mobile-landscape>", help: "viewport/touch/UA profile (shoot also takes both)" },
  { flag: "--width", tools: ["shoot", "drive"], value: "required", arg: "<px>", help: "viewport width override in CSS pixels" },
  { flag: "--height", tools: ["shoot", "drive"], value: "required", arg: "<px>", help: "viewport height override in CSS pixels" },
  { flag: "--size", tools: ["shoot", "drive"], value: "required", arg: "<full|half>", help: "half halves both dimensions for cheap judge shots; full for final/PR shots" },
  { flag: "--quality", tools: ["shoot", "drive"], value: "required", arg: "<full|draft>", engineOnly: RUNNER + " (draft pins ?quality=low and halves the viewport)", help: "draft = fast iteration run: low graphics tier and half size, -draft file names; full (default) for PR evidence" },
  { flag: "--settle", tools: ["shoot", "drive"], value: "required", arg: "<ms>", help: "extra wait after the page reports an honest frame" },
  { flag: "--timeout", tools: ["shoot", "drive"], value: "required", arg: "<s>", help: "readiness/capture timeout in seconds (default 60)" },
  { flag: "--param", tools: ["shoot", "drive"], value: "required", repeat: true, arg: "<key=value>", help: "add a query parameter to the page URL (repeatable)" },
  { flag: "--out", tools: ["shoot"], value: "required", arg: "<path>", help: "output PNG path" },
  { flag: "--playtest", tools: ["drive"], value: "none", help: "sample capture.probe while steps run; print a progress/softlock verdict" },
  { flag: "--strict", tools: ["drive"], value: "none", help: "with --playtest, exit nonzero on a softlock or missing probe" },
  { flag: "--seed", tools: ["drive"], value: "required", arg: "<n>", help: "playtest seed, forwarded as ?seed=n (default 1)" },
  { flag: "--sample", tools: ["drive"], value: "required", arg: "<ms>", help: "playtest probe sampling interval (default 250)" },
  { flag: "--softlock", tools: ["drive"], value: "required", arg: "<ms>", help: "flat-progress span under input that counts as a softlock (default 2000)" },
  { flag: "--epsilon", tools: ["drive"], value: "required", arg: "<n>", help: "smallest metric change that counts as progress (default 0.001)" },
  { flag: "--help", tools: ["shoot", "drive"], value: "none", help: "show this text" },
  { flag: "--game", tools: ["shoot", "drive"], value: "required", arg: "<id>", engineOnly: RUNNER + " to pick a game; a game project drives itself", help: "game id (a positional id works too)" },
  { flag: "--mode", tools: ["shoot", "drive"], value: "required", arg: "<ui|play|poster|preview>", engineOnly: RUNNER, help: "capture mode (shoot default ui, drive default play)" },
  { flag: "--state", tools: ["shoot", "drive"], value: "required", arg: "<name>", engineOnly: RUNNER, help: "boot into a capture.states entry; readiness waits until it has ticked and its models mounted" },
  { flag: "--run", tools: ["shoot", "drive"], value: "required", arg: "<cmd[,cmd]>", engineOnly: RUNNER, help: "run these commands past a start screen (overrides capture.play)" },
  { flag: "--view", tools: ["shoot", "drive"], value: "optional", arg: "[name]", engineOnly: RUNNER, help: "replay a framing from capture.views; with no name, list them" },
  { flag: "--list-views", tools: ["shoot"], value: "none", engineOnly: RUNNER, help: "list the game's capture.views and exit" },
  { flag: "--look", tools: ["shoot", "drive"], value: "required", arg: "<x,z|x,y,z|@marker:id|@entity:id>", engineOnly: RUNNER, help: "pin a detached camera on a world point" },
  { flag: "--look-from", tools: ["shoot", "drive"], value: "required", arg: "<dist[,height[,angle]]>", engineOnly: RUNNER, help: "vantage for --look (default 12,5,0)" },
  { flag: "--spawn", tools: ["shoot", "drive"], value: "required", arg: "<x,y,z[,yaw]>", engineOnly: RUNNER, help: "override the authored player spawn for this run only" },
  { flag: "--style", tools: ["shoot", "drive"], value: "required", arg: "<look>", engineOnly: RUNNER, help: "render with a different look preset (neutral, photoreal, cinematic, toon, comic, retro, flat)" },
  { flag: "--stage", tools: ["shoot"], value: "none", engineOnly: RUNNER, help: "apply the game's UI preview scenario before capture" },
  { flag: "--preview", tools: ["shoot"], value: "optional", arg: "[key]", engineOnly: RUNNER, help: "preview.tsx state instead of the full shell" },
  { flag: "--fixture", tools: ["shoot"], value: "optional", arg: "[name]", engineOnly: RUNNER, help: "capture an engine preview fixture; with no name, list them" },
  { flag: "--list", tools: ["shoot"], value: "none", engineOnly: RUNNER, help: "list the engine preview fixtures and exit" },
  { flag: "--site", tools: ["shoot", "drive"], value: "required", arg: "<path>", engineOnly: "needs the engine's apps/web server", help: "capture/drive a route of the managed apps/web server" },
  { flag: "--connect", tools: ["shoot", "drive"], value: "required", arg: "<port>", engineOnly: "needs the engine's warm Chrome loop", help: "attach to an already-running Chrome" },
  { flag: "--keep", tools: ["shoot", "drive"], value: "none", engineOnly: "needs the engine's warm Chrome loop", help: "leave the dev server and Chrome running for --connect" },
  { flag: "--serve", tools: ["shoot"], value: "none", engineOnly: "needs the engine's warm Chrome loop", help: "keep Chrome warm; start the requested Vite lazily" },
  { flag: "--inspect", tools: ["shoot"], value: "none", engineOnly: "needs the engine's pixel-metrics pass", help: "write shots/<name>.metrics.json beside the PNG" },
  { flag: "--reuse-storage", tools: ["drive"], value: "none", engineOnly: "needs the engine's warm Chrome loop", help: "keep the warm profile's storage instead of clearing it" },
  { flag: "--record", tools: ["drive"], value: "required", arg: "<name>", engineOnly: "needs the engine's video encoder", help: "record the drive to shots/<game>-<name>.mp4 (lockstep)" },
  { flag: "--record-fps", tools: ["drive"], value: "required", arg: "<n>", engineOnly: "needs the engine's video encoder", help: "lockstep output frame rate (default 24)" },
  { flag: "--record-realtime", tools: ["drive"], value: "none", engineOnly: "needs the engine's video encoder", help: "capture only frames the page really renders" },
  { flag: "--record-width", tools: ["drive"], value: "required", arg: "<px>", engineOnly: "needs the engine's video encoder", help: "screencast max width in realtime mode (default 640)" },
];

/** What a step must observe before it runs and after it ran; both are polled page expressions. */
export interface CaptureCondition {
  /** Page expression, evaluated as an async function so a bridge call can answer it. */
  is: string;
  /** Deep-equal value that counts as a match; omitted means any truthy result matches. */
  value?: unknown;
  /** Poll cap; defaults to {@link DRIVE_CONDITION_TIMEOUT_MS}. */
  timeoutMs?: number;
  /** Why this condition exists, echoed in the step log. */
  note?: string;
}

/** One ordered drive interaction. */
export type CaptureStep = (
  | { kind: "click"; text: string }
  | { kind: "double-click"; text: string }
  | { kind: "click-at"; spec: string; button: "left" | "right" }
  | { kind: "fill"; label: string; value: string }
  | { kind: "key"; code: string; holdMs: number }
  | { kind: "wait"; ms: number }
  | { kind: "waitFor"; expression: string; timeoutMs: number }
  | { kind: "reload" }
  | { kind: "shot"; name: string; out?: string }
  | { kind: "rpc"; json: string; summarized: boolean }
  | { kind: "probe"; name: string }
) & {
  /** Polled until true, then the step runs. */
  before?: CaptureCondition;
  /** Polled until true, then the step counts as passed. */
  after?: CaptureCondition;
};

/** A step starts the instant its postcondition holds; no guessed sleep in between. */
export const DRIVE_CONDITION_TIMEOUT_MS = 15_000;
/** How often a condition is re-evaluated while it is failing. */
export const DRIVE_CONDITION_POLL_MS = 50;

/** The step kinds a JSON step file accepts, in the order the help lists them. */
export function driveStepKinds(): string[] {
  return ["click", "doubleClick", "clickAt", "rightClickAt", "fill", "key", "wait", "waitFor", "reload", "shot", "rpc", "probe"];
}


/** Parsed command line: session options keyed by flag name without dashes, ordered steps, bare positionals. */
export interface ParsedCaptureArgs {
  tool: CaptureTool;
  help: boolean;
  positionals: string[];
  /** Switches are `true`; repeatable flags are arrays; `optional` flags given bare are `""`. */
  options: Record<string, string | true | string[]>;
  steps: CaptureStep[];
}

/**
 * Parse a shoot/drive command line against {@link CAPTURE_FLAGS}. Unknown flags, flags of the
 * other tool and malformed step values throw instead of being skipped or taken as a game id.
 */
export function parseCaptureArgs(tool: CaptureTool, argv: readonly string[], flags: readonly CaptureFlag[]): ParsedCaptureArgs {
  const out: ParsedCaptureArgs = { tool, help: false, positionals: [], options: {}, steps: [] };
  const byFlag = new Map(flags.map((entry) => [entry.flag, entry]));
  const number = (flag: string, raw: string): number => {
    const value = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(value) || value < 0) throw new Error(flag + " expects a nonnegative number (got \"" + raw + "\")");
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index]!;
    if (raw === "-h") {
      out.help = true;
      continue;
    }
    if (!raw.startsWith("--")) {
      out.positionals.push(raw);
      continue;
    }
    const entry = byFlag.get(raw);
    if (entry === undefined) throw new Error(tool + ": unknown option " + raw + "; see --help");
    if (!entry.tools.includes(tool)) {
      const other = entry.tools[0];
      throw new Error(tool + ": " + raw + " is a " + other + " option" + (tool === "shoot" && entry.step === true ? "; use drive for ordered steps (drive --shot takes the screenshot)" : ""));
    }
    let value: string | undefined;
    if (entry.value === "required") {
      value = argv[index + 1];
      if (value === undefined || (value.startsWith("--") && raw !== "--rpc")) throw new Error(raw + " requires a value " + (entry.arg ?? ""));
      index += 1;
    } else if (entry.value === "optional") {
      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith("--")) {
        value = next;
        index += 1;
      } else value = "";
    }
    const name = raw.slice(2);
    if (name === "help") {
      out.help = true;
      continue;
    }
    if (entry.step === true) {
      const text = value ?? "";
      if (name === "click" || name === "double-click") out.steps.push({ kind: name, text });
      else if (name === "click-at" || name === "right-click-at") {
        if (!/^\s*(?:\d+(?:\.\d*)?|\.\d+)\s*,\s*(?:\d+(?:\.\d*)?|\.\d+)\s*$/.test(text)) throw new Error(raw + " requires x,y in nonnegative CSS viewport pixels (got \"" + text + "\")");
        out.steps.push({ kind: "click-at", spec: text, button: name === "right-click-at" ? "right" : "left" });
      } else if (name === "fill") {
        const split = text.indexOf("=");
        if (split <= 0 || text.slice(0, split).trim() === "") throw new Error("--fill expects \"<accessible label>=<value>\"");
        out.steps.push({ kind: "fill", label: text.slice(0, split), value: text.slice(split + 1) });
      } else if (name === "key") {
        const colon = text.lastIndexOf(":");
        const code = colon > 0 ? text.slice(0, colon) : text;
        if (code === "") throw new Error("--key expects CODE:ms, e.g. KeyW:2500");
        out.steps.push({ kind: "key", code, holdMs: colon > 0 ? number("--key", text.slice(colon + 1)) : 1000 });
      } else if (name === "wait") out.steps.push({ kind: "wait", ms: number("--wait", text) });
      else if (name === "reload") out.steps.push({ kind: "reload" });
      else if (name === "shot") {
        const absolute = text.startsWith("/") || /^[A-Za-z]:[\\/]/.test(text) || text.startsWith("\\\\");
        if (absolute) out.steps.push({ kind: "shot", name: text, out: text });
        else if (text.includes("/") || text.includes("\\")) {
          throw new Error("--shot takes a bare name or an absolute path, not a relative path (got \"" + text + "\")");
        } else out.steps.push({ kind: "shot", name: text });
      } else if (name === "rpc") {
        let payload: unknown;
        try {
          payload = JSON.parse(text);
        } catch {
          throw new Error("--rpc expects a JSON object, e.g. '{\"method\":\"agent_status\"}' (got " + text + ")");
        }
        if (payload === null || typeof payload !== "object" || Array.isArray(payload)) throw new Error("--rpc expects a JSON object with a method");
        const request = payload as Record<string, unknown>;
        const summarized = request.method === "debug_snapshot" && request.detail === undefined;
        out.steps.push({ kind: "rpc", json: summarized ? JSON.stringify({ ...request, detail: "summary" }) : text, summarized });
      } else if (name === "probe") out.steps.push({ kind: "probe", name: text === "" ? "probe" : text });
      continue;
    }
    if (entry.value === "none") out.options[name] = true;
    else if (entry.repeat === true) {
      const list = out.options[name];
      out.options[name] = Array.isArray(list) ? [...list, value!] : [value!];
    } else out.options[name] = value!;
  }
  for (const name of ["port", "width", "height", "settle", "timeout", "seed", "sample", "softlock", "epsilon", "connect", "record-fps", "record-width"]) {
    const value = out.options[name];
    if (typeof value === "string") number("--" + name, value);
  }
  for (const pair of (out.options.param as string[] | undefined) ?? []) {
    if (pair.indexOf("=") <= 0) throw new Error("--param expects key=value, got \"" + pair + "\"");
  }
  const size = out.options.size;
  if (typeof size === "string" && size !== "full" && size !== "half") throw new Error("--size must be full or half (got " + size + ")");
  const device = out.options.device;
  if (typeof device === "string" && !["desktop", "mobile", "mobile-landscape"].concat(tool === "shoot" ? ["both"] : []).includes(device)) {
    throw new Error("--device must be desktop, mobile, mobile-landscape" + (tool === "shoot" ? ", or both" : "") + " (got " + device + ")");
  }
  return out;
}

function valueType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return "a " + typeof value;
}

function coordinatePair(path: string, value: unknown): string {
  if (Array.isArray(value) && value.length === 2 && value.every((part) => typeof part === "number" && Number.isFinite(part))) {
    return value[0] + "," + value[1];
  }
  throw new Error(path + ": expected [x, y] numbers, got " + JSON.stringify(value));
}

function conditionAt(path: string, value: unknown): CaptureCondition {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(path + ": expected {\"is\": \"<page expression>\", \"value\": <expected>, \"timeoutMs\": <n>, \"note\": \"<why>\"}, got " + JSON.stringify(value));
  const raw = value as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (key !== "is" && key !== "value" && key !== "timeoutMs" && key !== "note") throw new Error(path + ": unknown condition field \"" + key + "\" (valid: is, value, timeoutMs, note)");
  }
  if (typeof raw.is !== "string" || raw.is.trim() === "") throw new Error(path + ": \"is\" must be the page expression to wait for");
  if (raw.timeoutMs !== undefined && (typeof raw.timeoutMs !== "number" || !Number.isFinite(raw.timeoutMs) || raw.timeoutMs <= 0)) {
    throw new Error(path + ": timeoutMs must be a positive number of milliseconds, got " + JSON.stringify(raw.timeoutMs));
  }
  if (raw.note !== undefined && typeof raw.note !== "string") throw new Error(path + ": note must be a string");
  return {
    is: raw.is,
    ...(raw.value === undefined ? {} : { value: raw.value }),
    ...(raw.timeoutMs === undefined ? {} : { timeoutMs: raw.timeoutMs }),
    ...(raw.note === undefined ? {} : { note: raw.note }),
  };
}

const DRIVE_KEY_CODES = [
  ...Array.from({ length: 26 }, (_, i) => "Key" + String.fromCharCode(65 + i)),
  ...Array.from({ length: 10 }, (_, i) => "Digit" + i),
  ...Array.from({ length: 10 }, (_, i) => "Numpad" + i),
  ...Array.from({ length: 12 }, (_, i) => "F" + (i + 1)),
  "Backquote", "Minus", "Equal", "BracketLeft", "BracketRight", "Backslash", "Semicolon", "Quote", "Comma", "Period", "Slash",
  "Space", "Enter", "Tab", "Escape", "Backspace", "Delete", "Insert", "Home", "End", "PageUp", "PageDown",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "CapsLock",
  "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight",
  "mouse0", "mouse1", "mouse2",
];

function keyChordAt(path: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(path + ": expected a key code such as \"KeyH\", got " + JSON.stringify(value));
  const unknown = value.split("+").find((code) => !DRIVE_KEY_CODES.includes(code));
  if (unknown !== undefined) {
    throw new Error(
      path + ": unknown key code \"" + unknown + "\" (valid: KeyA-KeyZ, Digit0-Digit9, F1-F12, ShiftLeft, Space, Escape, mouse0-mouse2, and \"+\" chords of those)",
    );
  }
  return value;
}

function nonnegativeAt(path: string, value: unknown, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(path + ": expected a nonnegative number of milliseconds, got " + JSON.stringify(value));
  return value;
}

function shotNameAt(path: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(path + ": expected a shot name such as \"formation-line\", got " + JSON.stringify(value));
  if (value.includes("/") || value.includes("\\") || value.endsWith(".png")) {
    throw new Error(path + ": a shot is a bare name; it lands in the game's docs/ folder (drop the folder and .png: \"" + value + "\")");
  }
  return value;
}

/**
 * Parse a drive step file — `{ "steps": [ ... ] }` — into the same {@link CaptureStep} list the
 * flags produce, so one executor runs both. Every error names `steps[i]` and the field, and the
 * whole file parses before anything runs, so a half-read script can never drive a game.
 *
 * `source` names the file in errors (the path the caller read).
 */
export function parseStepFile(input: unknown, source: string): CaptureStep[] {
  const kinds = driveStepKinds();
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(source + ": expected {\"steps\":[...]}, got " + valueType(input));
  }
  const top = input as Record<string, unknown>;
  for (const key of Object.keys(top)) {
    if (key !== "steps") throw new Error(source + ": unknown top-level field \"" + key + "\" (valid: steps)");
  }
  if (!Array.isArray(top.steps)) throw new Error(source + ": expected {\"steps\":[...]}, got " + valueType(top.steps));
  if (top.steps.length === 0) throw new Error(source + ": the steps list is empty, so the run would prove nothing");
  const modifiers = ["before", "after", "ms", "timeoutMs", "note"];
  return top.steps.map((raw, index) => {
    const at = "steps[" + index + "]";
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new Error(at + ": expected a step object, got " + valueType(raw));
    const step = raw as Record<string, unknown>;
    const actions = Object.keys(step).filter((key) => kinds.includes(key));
    const unknown = Object.keys(step).find((key) => !kinds.includes(key) && !modifiers.includes(key));
    if (unknown !== undefined) throw new Error(at + ": unknown step kind \"" + unknown + "\" (valid: " + kinds.join(", ") + ")");
    if (actions.length === 0) throw new Error(at + ": one step kind is required (valid: " + kinds.join(", ") + ")");
    if (actions.length > 1) throw new Error(at + ": one step kind per object, got " + actions.join(" and "));
    const kind = actions[0]!;
    const value = step[kind];
    const before = step.before === undefined ? undefined : conditionAt(at + ".before", step.before);
    const after = step.after === undefined ? undefined : conditionAt(at + ".after", step.after);
    const conditions = { ...(before === undefined ? {} : { before }), ...(after === undefined ? {} : { after }) };
    const shape = (action: CaptureStep): CaptureStep => ({ ...action, ...conditions });
    switch (kind) {
      case "click":
      case "doubleClick": {
        const text = typeof value === "string" ? value : "";
        if (text.trim() === "") throw new Error(at + "." + kind + ": expected the text to click, got " + JSON.stringify(value));
        return shape({ kind: kind === "click" ? "click" : "double-click", text });
      }
      case "clickAt":
      case "rightClickAt":
        return shape({ kind: "click-at", spec: coordinatePair(at + "." + kind, value), button: kind === "rightClickAt" ? "right" : "left" });
      case "fill": {
        if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(at + ".fill: expected {\"label\": \"<label>\", \"value\": \"<text>\"}, got " + JSON.stringify(value));
        const field = value as Record<string, unknown>;
        if (typeof field.label !== "string" || field.label.trim() === "") throw new Error(at + ".fill.label: expected the field's accessible label");
        if (typeof field.value !== "string") throw new Error(at + ".fill.value: expected the text to type");
        return shape({ kind: "fill", label: field.label, value: field.value });
      }
      case "key":
        return shape({ kind: "key", code: keyChordAt(at + ".key", value), holdMs: nonnegativeAt(at + ".ms", step.ms, 1000) });
      case "wait":
        return shape({ kind: "wait", ms: nonnegativeAt(at + ".wait", value) });
      case "waitFor": {
        if (typeof value !== "string" || value.trim() === "") throw new Error(at + ".waitFor: expected the page expression to wait for, got " + JSON.stringify(value));
        return shape({ kind: "waitFor", expression: value, timeoutMs: nonnegativeAt(at + ".timeoutMs", step.timeoutMs, DRIVE_CONDITION_TIMEOUT_MS) });
      }
      case "reload":
        if (value !== true) throw new Error(at + ".reload: expected true");
        return shape({ kind: "reload" });
      case "shot":
        return shape({ kind: "shot", name: shotNameAt(at + ".shot", value) });
      case "rpc": {
        if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(at + ".rpc: expected a bridge request object such as {\"method\":\"agent_status\"}, got " + JSON.stringify(value));
        const request = value as Record<string, unknown>;
        if (typeof request.method !== "string" || request.method === "") throw new Error(at + ".rpc: expected a request with a method");
        const summarized = request.method === "debug_snapshot" && request.detail === undefined;
        const body = summarized ? JSON.stringify({ ...request, detail: "summary" }) : JSON.stringify(request);
        return shape({ kind: "rpc", json: body, summarized });
      }
      case "probe":
        return shape({ kind: "probe", name: value === undefined ? "probe" : String(value) });
      default:
        throw new Error(at + ": unknown step kind \"" + kind + "\" (valid: " + kinds.join(", ") + ")");
    }
  });
}

/** How long a step can hold the run: its action plus the cap on each condition. */
export function stepDurationMs(step: CaptureStep): number {
  const own = step.kind === "key" ? step.holdMs : step.kind === "wait" ? step.ms : step.kind === "waitFor" ? step.timeoutMs : 0;
  const before = step.before === undefined ? 0 : step.before.timeoutMs ?? DRIVE_CONDITION_TIMEOUT_MS;
  const after = step.after === undefined ? 0 : step.after.timeoutMs ?? DRIVE_CONDITION_TIMEOUT_MS;
  return own + before + after;
}

/** One line of `--check`: what the step is, what it waits for, its worst-case duration. */
export function describeStep(step: CaptureStep): string {
  switch (step.kind) {
    case "click": return "click \"" + step.text + "\"";
    case "double-click": return "doubleClick \"" + step.text + "\"";
    case "click-at": return (step.button === "right" ? "rightClickAt " : "clickAt ") + step.spec;
    case "fill": return "fill \"" + step.label + "\" = \"" + step.value + "\"";
    case "key": return "key " + step.code + " " + step.holdMs + "ms";
    case "wait": return "wait " + step.ms + "ms (last resort: a guessed sleep)";
    case "waitFor": return "waitFor " + step.expression;
    case "reload": return "reload";
    case "shot": return "shot " + step.name + (step.out === undefined ? "" : " -> " + step.out);
    case "rpc": return "rpc " + step.json;
    case "probe": return "probe " + step.name;
  }
}

/** The `--check` report: every resolved step, its condition caps and the total worst case. */
export function describeStepFile(steps: readonly CaptureStep[], source: string): string {
  const lines = steps.map((step, index) => {
    const waits = [
      step.before === undefined ? "" : " before<=" + (step.before.timeoutMs ?? DRIVE_CONDITION_TIMEOUT_MS) + "ms",
      step.after === undefined ? "" : " after<=" + (step.after.timeoutMs ?? DRIVE_CONDITION_TIMEOUT_MS) + "ms",
    ].join("");
    return "  #" + (index + 1) + " " + describeStep(step) + waits + " (" + stepDurationMs(step) + "ms cap)";
  });
  const total = steps.reduce((sum, step) => sum + stepDurationMs(step), 0);
  return [source + ": " + steps.length + " step(s), " + total + "ms worst case", ...lines].join("\n");
}

/**
 * Throw when a step file is mixed with step flags, naming each flag: a script's order lives in the
 * file, and a half-flag/half-file run is a silent argument to the wrong executor.
 */
export function rejectMixedStepFlags(tool: CaptureTool, argv: readonly string[], flags: readonly CaptureFlag[]): void {
  const mixed = flags.filter((entry) => entry.step === true && argv.includes(entry.flag)).map((entry) => entry.flag);
  if (mixed.length === 0) return;
  throw new Error(tool + ": --steps runs a step file, so drop the step flags (" + mixed.join(", ") + "); the file owns the order");
}

/**
 * Throw when a portable harness (one that drives a game's own dev server) gets a flag only the
 * engine dev runner can honor, naming each flag and why, instead of silently ignoring it.
 */
export function rejectEngineOnlyFlags(parsed: ParsedCaptureArgs, flags: readonly CaptureFlag[]): void {
  const used = flags.filter((entry) => entry.engineOnly !== undefined && parsed.options[entry.flag.slice(2)] !== undefined);
  const positional = parsed.positionals.length > 0 ? ["a game id (\"" + parsed.positionals.join(" ") + "\"): this harness drives the game project it runs in"] : [];
  const reasons = used.map((entry) => entry.flag + " " + entry.engineOnly).concat(positional);
  if (reasons.length === 0) return;
  throw new Error(
    parsed.tool + ": " + reasons.join("; ") +
      ". Run bun run " + parsed.tool + " from a jgengine checkout for those, or drop them here.",
  );
}

/** Help text for a tool's flags, generated from {@link CAPTURE_FLAGS} so hosts cannot drift. */
export function captureFlagHelp(tool: CaptureTool, host: "engine" | "bundled", flags: readonly CaptureFlag[]): string {
  const line = (entry: CaptureFlag) => {
    const head = "  " + entry.flag + (entry.arg === undefined ? "" : " " + entry.arg);
    return head.length < 28 ? head.padEnd(28) + entry.help : head + "\n" + "".padEnd(28) + entry.help;
  };
  const mine = flags.filter((entry) => entry.tools.includes(tool));
  const steps = mine.filter((entry) => entry.step === true).map(line);
  const portable = mine.filter((entry) => entry.step !== true && entry.engineOnly === undefined).map(line);
  const engine = mine.filter((entry) => entry.engineOnly !== undefined).map(line);
  const sections = [];
  if (steps.length > 0) sections.push("Steps (run in order):\n" + steps.join("\n"));
  sections.push("Options:\n" + portable.join("\n"));
  sections.push((host === "engine" ? "Dev runner options:\n" : "Engine dev runner only (bun run " + tool + " in a jgengine checkout):\n") + engine.join("\n"));
  return sections.join("\n\n");
}

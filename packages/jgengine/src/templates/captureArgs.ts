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

/** One ordered drive interaction. */
export type CaptureStep =
  | { kind: "click"; text: string }
  | { kind: "double-click"; text: string }
  | { kind: "click-at"; spec: string; button: "left" | "right" }
  | { kind: "fill"; label: string; value: string }
  | { kind: "key"; code: string; holdMs: number }
  | { kind: "wait"; ms: number }
  | { kind: "reload" }
  | { kind: "shot"; name: string; out?: string }
  | { kind: "rpc"; json: string; summarized: boolean }
  | { kind: "probe"; name: string };

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

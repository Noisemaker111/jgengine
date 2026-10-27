import type { ProbeReadings } from "@jgengine/core/game/playableGame";
import type { TeleportTarget } from "@jgengine/core/movement/teleport";
import type { HeadlessPlayable } from "@jgengine/core/runtime/headlessRunner";

type Letter = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "L" | "M" | "N" | "O" | "P" | "Q" | "R" | "S" | "T" | "U" | "V" | "W" | "X" | "Y" | "Z";
type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
type FunctionKey = "F1" | "F2" | "F3" | "F4" | "F5" | "F6" | "F7" | "F8" | "F9" | "F10" | "F11" | "F12";

/**
 * A key or mouse button a flow can hold, by its `KeyboardEvent.code` (`KeyW`, `Digit1`, `ShiftLeft`)
 * or `mouse0`/`mouse1`/`mouse2`. A typo is a compile error, not a key the game never sees.
 */
export type FlowKey =
  | `Key${Letter}`
  | `Digit${Digit}`
  | `Numpad${Digit}`
  | FunctionKey
  | "Space" | "Enter" | "Escape" | "Tab" | "Backspace" | "Delete" | "Insert" | "Home" | "End" | "PageUp" | "PageDown"
  | "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight"
  | "ShiftLeft" | "ShiftRight" | "ControlLeft" | "ControlRight" | "AltLeft" | "AltRight" | "MetaLeft" | "MetaRight"
  | "Backquote" | "Minus" | "Equal" | "BracketLeft" | "BracketRight" | "Backslash" | "Semicolon" | "Quote" | "Comma" | "Period" | "Slash" | "CapsLock"
  | "mouse0" | "mouse1" | "mouse2";

/** One key, or several held together as a chord (`["ShiftLeft", "KeyW"]`, pressed in that order). */
export type FlowKeys = FlowKey | readonly [FlowKey, ...FlowKey[]];

/** A question about the game's own `capture.probe` readings, typed from the game's probe. */
export type ProbeCheck<TProbe extends ProbeReadings> = (probe: TProbe) => boolean;

/** How long a wait may take before the flow fails at that step. */
export interface FlowWaitOptions {
  /** Milliseconds (game time headless, wall time in the browser). Default 15 000. */
  timeoutMs?: number;
  /** Why the flow waits here, printed when it times out. */
  note?: string;
}

/** How long {@link Flow.hold} keeps the keys down. */
export type FlowHold<TProbe extends ProbeReadings> =
  /** A fixed hold, in milliseconds. */
  | { ms: number; until?: never; timeoutMs?: never }
  /** Hold until the check passes (`ms` is then the minimum), failing at `timeoutMs` (default 15 000). */
  | { until: ProbeCheck<TProbe>; ms?: number; timeoutMs?: number };

/** The result a game command gave. */
export type FlowCommandResult = { status: "applied" } | { status: "rejected"; reason: string; message?: string };

/**
 * What a flow can do in both runners: hold keys, turn the camera, teleport, run commands, wait on the
 * game's probe. Each call is one step; a failing step stops the flow and names itself.
 */
export interface Flow<TProbe extends ProbeReadings> {
  /** Hold keys (a chord with an array) for a time or until a probe check passes. */
  hold(keys: FlowKeys, how: FlowHold<TProbe>): Promise<void>;
  /** Tap keys: down for one short beat, then up. */
  press(keys: FlowKeys): Promise<void>;
  /** Face this heading (radians, the walk controller's yaw): the same `ctx.camera.turnTo` a game's own cheat uses, no pointer drag. */
  heading(yaw: number): Promise<void>;
  /** Move the player (their mount while riding) to a point, dropping carried velocity. */
  teleport(to: TeleportTarget): Promise<void>;
  /** Run a game command; a rejected or unknown command fails the step. */
  command(name: string, input?: unknown): Promise<void>;
  /** Run a game command and return its result, for a step that expects a refusal. */
  tryCommand(name: string, input?: unknown): Promise<FlowCommandResult>;
  /** Scale the game clock (1 normal, up to 120) to fast-forward timers and day cycles. */
  timeScale(scale: number): Promise<void>;
  /** Let time pass with nothing held. Prefer {@link waitFor}: a fixed wait guesses. */
  wait(ms: number): Promise<void>;
  /** Wait until the check passes; returns the readings that passed. */
  waitFor(check: ProbeCheck<TProbe>, options?: FlowWaitOptions): Promise<TProbe>;
  /** Check once, now; a false check fails the flow with the readings. Assert arrival, not that a key went down. */
  expect(check: ProbeCheck<TProbe>, note: string): Promise<TProbe>;
  /** The game's probe readings right now. */
  probe(): Promise<TProbe>;
  /** Print the probe readings under a label in the run's output. */
  report(label: string): Promise<void>;
  /** Screenshot into `shots/<game>/<name>.png`; headless runs skip it. */
  shot(name: string): Promise<void>;
}

/** A browser-only flow: everything a {@link Flow} does, plus the page itself. */
export interface BrowserFlow<TProbe extends ProbeReadings> extends Flow<TProbe> {
  /** Click the first settled, enabled element showing this text (or aria-label). */
  click(text: string, options?: { double?: boolean }): Promise<void>;
  /** Native click at CSS viewport pixels (canvas targets, map orders). */
  clickAt(x: number, y: number, options?: { button?: "left" | "right" }): Promise<void>;
  /** Replace a text field's value by its accessible label, then Tab to commit. */
  fill(label: string, value: string): Promise<void>;
  /** Wait until the page's text shows this. */
  see(text: string | RegExp, options?: FlowWaitOptions): Promise<void>;
  /** Evaluate a page expression and return its value, unchecked: narrow it before use. */
  page(expression: string): Promise<unknown>;
  /** Wait until a page expression is truthy (or deep-equals `value`). */
  waitForPage(expression: string, options?: FlowWaitOptions & { value?: unknown }): Promise<unknown>;
  /** Check a page expression once: truthy, or deep-equal to `value`. */
  expectPage(expression: string, note: string, value?: unknown): Promise<unknown>;
  /** Reload the page and wait for it to be ready again, keeping this run's storage. */
  reload(): Promise<void>;
  /** Call the page's agent bridge (`run_command`, `debug_snapshot`, ...) and return its answer. */
  rpc(request: { method: string } & Record<string, unknown>): Promise<unknown>;
}

interface FlowSpecBase {
  /** A `capture.states` entry to boot into instead of `capture.play`. */
  state?: string;
}

/** A flow both runners can play; headless (the default, fast) unless asked for the browser. */
export interface HeadlessFlowSpec<TProbe extends ProbeReadings> extends FlowSpecBase {
  browser?: false;
  run(flow: Flow<TProbe>): Promise<void>;
}

/** A flow that needs the page: menus, DOM text, clicks. */
export interface BrowserFlowSpec<TProbe extends ProbeReadings> extends FlowSpecBase {
  browser: true;
  run(flow: BrowserFlow<TProbe>): Promise<void>;
}

/** A defined flow that both runners can play. */
export interface HeadlessProofFlow<TProbe extends ProbeReadings = ProbeReadings> {
  readonly kind: "jgengine-flow";
  readonly game: HeadlessPlayable<TProbe>;
  readonly browser: false;
  readonly state: string | undefined;
  run(flow: Flow<TProbe>): Promise<void>;
}

/** A defined flow that only the browser runner can play. */
export interface BrowserProofFlow<TProbe extends ProbeReadings = ProbeReadings> {
  readonly kind: "jgengine-flow";
  /** The game it plays; `null` for an app that is not a `PlayableGame`. */
  readonly game: HeadlessPlayable<TProbe> | null;
  readonly browser: true;
  readonly state: string | undefined;
  run(flow: BrowserFlow<TProbe>): Promise<void>;
}

/** A defined flow, as `<game>/proofs/flows/<name>.flow.ts` exports it by default. */
export type ProofFlow<TProbe extends ProbeReadings = ProbeReadings> = HeadlessProofFlow<TProbe> | BrowserProofFlow<TProbe>;

/**
 * Define a proof flow: the route a proof needs, written as code against the game's own typed probe.
 * `bun run drive <game> --flow <name>` plays it headless by default (no browser, game time, seconds),
 * or in the browser with `browser: true` or `--browser`. Compose flows by calling another's `run`.
 *
 * @capability proof-flow write a game's proof route in TypeScript with typed keys and probe checks; it runs headless or in the browser
 */
export function defineFlow<TProbe extends ProbeReadings>(game: HeadlessPlayable<TProbe>, spec: HeadlessFlowSpec<TProbe>): HeadlessProofFlow<TProbe>;
export function defineFlow<TProbe extends ProbeReadings>(game: HeadlessPlayable<TProbe> | null, spec: BrowserFlowSpec<TProbe>): BrowserProofFlow<TProbe>;
export function defineFlow<TProbe extends ProbeReadings>(
  game: HeadlessPlayable<TProbe> | null,
  spec: HeadlessFlowSpec<TProbe> | BrowserFlowSpec<TProbe>,
): ProofFlow<TProbe> {
  if (spec.browser === true) {
    return { kind: "jgengine-flow", game, browser: true, state: spec.state, run: (flow) => spec.run(flow) };
  }
  if (game === null) throw new Error("defineFlow: a flow without a game must set browser: true");
  return { kind: "jgengine-flow", game, browser: false, state: spec.state, run: (flow) => spec.run(flow) };
}

/** Whether a module's default export is a {@link ProofFlow}.
 * @internal the drive runner's loader check
 */
export function isProofFlow(value: unknown): value is ProofFlow {
  return typeof value === "object" && value !== null && "kind" in value && value.kind === "jgengine-flow";
}

/** The keys of a {@link FlowKeys}, in press order.
 * @internal
 */
export function flowKeyList(keys: FlowKeys): readonly FlowKey[] {
  return typeof keys === "string" ? [keys] : keys;
}

/** Default wait cap for a flow step, in milliseconds. */
export const FLOW_WAIT_MS = 15_000;
/** How long {@link Flow.press} holds its keys. */
export const FLOW_PRESS_MS = 120;

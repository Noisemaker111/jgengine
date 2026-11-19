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

export type FlowKeys = FlowKey | readonly [FlowKey, ...FlowKey[]];

export type ProbeCheck<TProbe extends ProbeReadings> = (probe: TProbe) => boolean;

/** How long a wait may take before the flow fails at that step. */
export interface FlowWaitOptions {
  /** Milliseconds (game time headless, wall time in the browser). Default 15 000. */
  timeoutMs?: number;
  /** Why the flow waits here, printed when it times out. */
  note?: string;
}

export type FlowHold<TProbe extends ProbeReadings> =
  /** A fixed hold, in milliseconds. */
  | { ms: number; until?: never; timeoutMs?: never }
  /** Hold until the check passes (`ms` is then the minimum), failing at `timeoutMs` (default 15 000). */
  | { until: ProbeCheck<TProbe>; ms?: number; timeoutMs?: number };

export type FlowCommandResult = { status: "applied" } | { status: "rejected"; reason: string; message?: string };

export interface Flow<TProbe extends ProbeReadings> {
  hold(keys: FlowKeys, how: FlowHold<TProbe>): Promise<void>;
  press(keys: FlowKeys): Promise<void>;
  /** Face this heading (radians, the walk controller's yaw): the same `ctx.camera.turnTo` a game's own cheat uses, no pointer drag. */
  heading(yaw: number): Promise<void>;
  teleport(to: TeleportTarget): Promise<void>;
  command(name: string, input?: unknown): Promise<void>;
  tryCommand(name: string, input?: unknown): Promise<FlowCommandResult>;
  timeScale(scale: number): Promise<void>;
  wait(ms: number): Promise<void>;
  waitFor(check: ProbeCheck<TProbe>, options?: FlowWaitOptions): Promise<TProbe>;
  expect(check: ProbeCheck<TProbe>, note: string): Promise<TProbe>;
  probe(): Promise<TProbe>;
  report(label: string): Promise<void>;
  shot(name: string): Promise<void>;
}

export interface BrowserFlow<TProbe extends ProbeReadings> extends Flow<TProbe> {
  click(text: string, options?: { double?: boolean }): Promise<void>;
  /** Native click at CSS viewport pixels (canvas targets, map orders). */
  clickAt(x: number, y: number, options?: { button?: "left" | "right" }): Promise<void>;
  /** Hover the real pointer at CSS viewport pixels, no button. */
  moveMouse(x: number, y: number): Promise<void>;
  drag(from: { x: number; y: number }, to: { x: number; y: number }, options?: { pointer?: "mouse" | "touch" }): Promise<void>;
  /** A real finger tap at CSS viewport pixels (needs a touch device such as `--device mobile`). */
  touch(x: number, y: number): Promise<void>;
  /** Turn the real mouse wheel at viewport pixels; positive deltaY scrolls down. */
  wheel(x: number, y: number, deltaY: number, deltaX?: number): Promise<void>;
  /**
   * Turn a pointer-locked view by `dx`,`dy` pixels of real mouse movement, locking the pointer to the
   * canvas first the way the game does. Fails when the page never reports the movement. Returns the
   * movement the page saw.
   */
  look(dx: number, dy: number): Promise<{ x: number; y: number }>;
  aimAt(expression: string, options?: { tolerancePx?: number }): Promise<{ x: number; y: number }>;
  fill(label: string, value: string): Promise<void>;
  type(text: string): Promise<void>;
  see(text: string | RegExp, options?: FlowWaitOptions): Promise<void>;
  page(expression: string): Promise<unknown>;
  waitForPage(expression: string, options?: FlowWaitOptions & { value?: unknown }): Promise<unknown>;
  expectPage(expression: string, note: string, value?: unknown): Promise<unknown>;
  reload(): Promise<void>;
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

export interface BrowserFlowSpec<TProbe extends ProbeReadings> extends FlowSpecBase {
  browser: true;
  run(flow: BrowserFlow<TProbe>): Promise<void>;
}

export interface HeadlessProofFlow<TProbe extends ProbeReadings = ProbeReadings> {
  readonly kind: "jgengine-flow";
  readonly game: HeadlessPlayable<TProbe>;
  readonly browser: false;
  readonly state: string | undefined;
  run(flow: Flow<TProbe>): Promise<void>;
}

export interface BrowserProofFlow<TProbe extends ProbeReadings = ProbeReadings> {
  readonly kind: "jgengine-flow";
  readonly game: HeadlessPlayable<TProbe> | null;
  readonly browser: true;
  readonly state: string | undefined;
  run(flow: BrowserFlow<TProbe>): Promise<void>;
}

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

/** @internal the drive runner's loader check */
export function isProofFlow(value: unknown): value is ProofFlow {
  return typeof value === "object" && value !== null && "kind" in value && value.kind === "jgengine-flow";
}

/** @internal */
export function flowKeyList(keys: FlowKeys): readonly FlowKey[] {
  return typeof keys === "string" ? [keys] : keys;
}

/** Default wait cap for a flow step, in milliseconds. */
export const FLOW_WAIT_MS = 15_000;
export const FLOW_PRESS_MS = 120;
/** How close {@link BrowserFlow.aimAt} must bring the target to the crosshair, in CSS pixels. */
export const FLOW_AIM_TOLERANCE_PX = 6;

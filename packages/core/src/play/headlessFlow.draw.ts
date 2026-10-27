import { actionContextStack, activeActionCodes } from "@jgengine/core/game/controlGate";
import type { GameCaptureConfig, ProbeReadings } from "@jgengine/core/game/playableGame";
import { createActionStateTracker, toActionStateBindingMap } from "@jgengine/core/input/actionBindings";
import { teleportPlayer } from "@jgengine/core/movement/teleport";

import { FLOW_PRESS_MS, FLOW_WAIT_MS, flowKeyList, type Flow, type FlowCommandResult, type FlowKeys, type HeadlessProofFlow, type ProbeCheck } from "./flow";
import { createFlowStepper, runFlowReport, type FlowRunReport } from "./flowSteps";
import { createPlaySession, type PlaySession } from "./playSession.draw";

/** Options for {@link runFlowHeadless}. */
export interface HeadlessFlowOptions {
  /** Seed for `ctx.rng`. Default the runner's. */
  seed?: string | number;
  /** A `capture.states` entry to boot into, overriding the flow's own `state`. */
  state?: string;
}

const DEFAULT_COMMAND_INPUT = { yaw: 0, pitch: 0, aim: { yaw: 0, pitch: 0 } };

/** The text a check prints in a failure: its source, trimmed to one line. */
function describeCheck(check: { toString(): string }): string {
  const source = check.toString().replace(/\s+/g, " ").trim();
  return source.length > 120 ? `${source.slice(0, 117)}...` : source;
}

function keysLabel(keys: FlowKeys): string {
  return flowKeyList(keys).join("+");
}

/** Run the game's `capture.states[state]` (strict) or `capture.play` commands, the way the browser's capture boot does. */
function boot(session: PlaySession, capture: GameCaptureConfig<ProbeReadings> | undefined, state: string | undefined): void {
  const entries = state === undefined ? (capture?.play ?? []) : capture?.states?.[state];
  if (entries === undefined) {
    const known = Object.keys(capture?.states ?? {}).sort();
    throw new Error(`unknown capture state "${state}" — ${known.length > 0 ? `declared states: ${known.join(", ")}` : "the game declares no capture.states"}`);
  }
  for (const entry of entries) {
    const name = typeof entry === "string" ? entry : entry.name;
    const input = typeof entry === "string" ? DEFAULT_COMMAND_INPUT : (entry.input ?? DEFAULT_COMMAND_INPUT);
    const result = session.command(name, input, `boot ${name}`);
    if (result.status === "unknown-command") throw new Error(`boot command "${name}" is not registered — registered: ${session.ctx.game.commands.names().sort().join(", ")}`);
    if (result.status === "rejected" && state !== undefined) throw new Error(`boot command "${name}" for state "${state}" was rejected: ${result.reason}`);
  }
}

/**
 * Play a proof flow headless: the real game through {@link createPlaySession}, keys mapped to the game's own
 * bindings, every wait in game time, so a flow that takes a minute in the browser takes seconds here.
 * Screenshots are skipped. A failing step stops the run and the report names it with the probe readings.
 *
 * @capability headless-flow play a game's TypeScript proof flow headless in seconds, with typed keys and probe checks
 */
export async function runFlowHeadless<TProbe extends ProbeReadings>(flow: HeadlessProofFlow<TProbe>, options: HeadlessFlowOptions = {}): Promise<FlowRunReport> {
  const game = flow.game;
  const session = createPlaySession(game, options.seed === undefined ? {} : { seed: options.seed });
  const { ctx } = session;
  const tickMs = session.dt * 1000;
  const probeHook = game.capture?.probe;

  const readProbe = (): TProbe => {
    if (probeHook === undefined) throw new Error(`${game.game.name} has no capture.probe; add one to wait on game state`);
    return probeHook(ctx);
  };
  const stepper = createFlowStepper(async () => (probeHook === undefined ? undefined : probeHook(ctx)));
  const reports: { label: string; probe: unknown }[] = [];

  const baseInput = game.game.input ?? {};
  const tracker = createActionStateTracker<string>(toActionStateBindingMap(activeActionCodes(ctx, baseInput)));
  const contexts = actionContextStack(ctx);
  let boundVersion = contexts.version();
  const rebindIfContextChanged = (): void => {
    const version = contexts.version();
    if (version === boundVersion) return;
    boundVersion = version;
    tracker.rebind(toActionStateBindingMap(activeActionCodes(ctx, baseInput)));
  };
  const held = (): string[] => tracker.actions().filter((action) => tracker.isDown(action));
  const tick = (): void => {
    rebindIfContextChanged();
    session.tick(held());
    tracker.endFrame();
  };
  const ticksFor = (ms: number): number => Math.max(1, Math.ceil(ms / tickMs - 1e-9));

  // A key the game binds nowhere is a mistake in the flow; one whose action a menu context has switched off
  // is a no-op, as it is in the browser.
  const baseTracker = createActionStateTracker<string>(toActionStateBindingMap(baseInput));
  const isBound = (key: string): boolean => {
    const bound = baseTracker.handleDown(key) !== null;
    baseTracker.reset();
    return bound;
  };
  const keysDown = (keys: FlowKeys): void => {
    for (const key of flowKeyList(keys)) {
      if (!isBound(key)) throw new Error(`key ${key} is bound to no action in ${game.game.name}; bound actions: ${baseTracker.actions().join(", ")}`);
      tracker.handleDown(key);
    }
  };
  const keysUp = (keys: FlowKeys): void => {
    for (const key of flowKeyList(keys)) tracker.handleUp(key);
  };

  const waitUntil = (check: ProbeCheck<TProbe>, timeoutMs: number, what: string): TProbe => {
    const deadline = session.clockMs + timeoutMs;
    for (;;) {
      const readings = readProbe();
      if (check(readings)) return readings;
      if (session.clockMs >= deadline) throw new Error(`${what}: not true after ${timeoutMs} ms of game time`);
      tick();
    }
  };

  const api: Flow<TProbe> = {
    hold: (keys, how) =>
      stepper.run(`hold ${keysLabel(keys)} ${how.until === undefined ? `${how.ms} ms` : `until ${describeCheck(how.until)}`}`, async () => {
        keysDown(keys);
        try {
          const minimum = how.ms ?? 0;
          for (let index = 0, count = minimum > 0 ? ticksFor(minimum) : 0; index < count; index += 1) tick();
          if (how.until !== undefined) waitUntil(how.until, how.timeoutMs ?? FLOW_WAIT_MS, `hold ${keysLabel(keys)} until ${describeCheck(how.until)}`);
        } finally {
          keysUp(keys);
          tick();
        }
      }),
    press: (keys) =>
      stepper.run(`press ${keysLabel(keys)}`, async () => {
        keysDown(keys);
        try {
          for (let index = 0, count = ticksFor(FLOW_PRESS_MS); index < count; index += 1) tick();
        } finally {
          keysUp(keys);
          tick();
        }
      }),
    heading: (yaw) =>
      stepper.run(`heading ${yaw.toFixed(3)}`, async () => {
        if (!Number.isFinite(yaw)) throw new RangeError("heading needs a finite yaw in radians");
        ctx.camera.turnTo(yaw);
        tick();
      }),
    teleport: (to) =>
      stepper.run(`teleport ${to.x},${to.z}`, async () => {
        if (teleportPlayer(ctx, session.userId, to) === null) throw new Error("the player has no body to teleport yet");
        tick();
      }),
    command: (name, input) =>
      stepper.run(`command ${name}`, async () => {
        const result = session.command(name, input ?? DEFAULT_COMMAND_INPUT);
        if (result.status === "unknown-command") throw new Error(`command "${name}" is not registered — registered: ${ctx.game.commands.names().sort().join(", ")}`);
        if (result.status === "rejected") throw new Error(`command "${name}" was rejected: ${result.reason}${result.message === undefined ? "" : ` (${result.message})`}`);
      }),
    tryCommand: (name, input) =>
      stepper.run(`try command ${name}`, async (): Promise<FlowCommandResult> => {
        const result = session.command(name, input ?? DEFAULT_COMMAND_INPUT);
        if (result.status === "unknown-command") throw new Error(`command "${name}" is not registered — registered: ${ctx.game.commands.names().sort().join(", ")}`);
        if (result.status === "applied") return { status: "applied" };
        return { status: "rejected", reason: result.reason, ...(result.message === undefined ? {} : { message: result.message }) };
      }),
    timeScale: (scale) =>
      stepper.run(`time scale ${scale}`, async () => {
        if (!Number.isFinite(scale) || scale < 0 || scale > 120) throw new RangeError("timeScale needs a scale between 0 and 120 (1 = normal)");
        ctx.time.setTimescale(scale);
      }),
    wait: (ms) =>
      stepper.run(`wait ${ms} ms`, async () => {
        for (let index = 0, count = ticksFor(ms); index < count; index += 1) tick();
      }),
    waitFor: (check, waitOptions = {}) =>
      stepper.run(`wait for ${waitOptions.note ?? describeCheck(check)}`, async () =>
        waitUntil(check, waitOptions.timeoutMs ?? FLOW_WAIT_MS, waitOptions.note ?? describeCheck(check))),
    expect: (check, note) =>
      stepper.run(`expect ${note}`, async () => {
        const readings = readProbe();
        if (!check(readings)) throw new Error(`expected ${note}: ${describeCheck(check)} was false`);
        return readings;
      }),
    probe: async () => readProbe(),
    report: (label) =>
      stepper.run(`report ${label}`, async () => {
        reports.push({ label, probe: readProbe() });
      }),
    shot: async () => {},
  };

  return runFlowReport(stepper, reports, async () => {
    await stepper.run(flow.state === undefined && options.state === undefined ? "boot" : `boot state ${options.state ?? flow.state}`, async () => {
      boot(session, game.capture, options.state ?? flow.state);
      tick();
    });
    await flow.run(api);
  });
}

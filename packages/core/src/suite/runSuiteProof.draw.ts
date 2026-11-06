import type { ProbeReadings } from "@jgengine/core/game/playableGame";
import { teleportPlayer } from "@jgengine/core/movement/teleport";
import { FLOW_PRESS_MS, FLOW_WAIT_MS, flowKeyList, type FlowCommandResult, type FlowHold, type FlowKeys, type ProbeCheck } from "@jgengine/core/play/flow";
import { createFlowStepper, runFlowReport, type FlowRunReport } from "@jgengine/core/play/flowSteps";
import { bootCaptureState } from "@jgengine/core/play/headlessFlow.draw";
import { createHeadlessKeys } from "@jgengine/core/play/headlessKeys.draw";
import { createPlaySession } from "@jgengine/core/play/playSession.draw";
import { aliasContext } from "@jgengine/core/runtime/contextIdentity";

import { auditSuiteContent, type SuiteContent } from "./contentAudit";
import type { SuiteProofResult, SuiteReport } from "./gameSuite";
import { openSetupWindow } from "./setupWindow";
import { CHEAT_COMMAND_NAME, type ProofPlay, type ProofSetup, type SuiteProof } from "./suiteProof";

/** Options for {@link runSuiteProof}. */
export interface SuiteProofRunOptions {
  /** Seed for `ctx.rng`. Default `"suite"`, so every run of a proof draws the same numbers. */
  seed?: string | number;
}

/** What one proof run produced: the flow report of its steps, and the entries it proved when it passed. */
export interface SuiteProofRun {
  proves: readonly string[];
  report: FlowRunReport;
}

const DEFAULT_COMMAND_INPUT = { yaw: 0, pitch: 0, aim: { yaw: 0, pitch: 0 } };

function describeCheck(check: { toString(): string }): string {
  const source = check.toString().replace(/\s+/g, " ").trim();
  return source.length > 120 ? `${source.slice(0, 117)}...` : source;
}

const keysLabel = (keys: FlowKeys): string => flowKeyList(keys).join("+");

/**
 * Play one suite proof headless against the real game: boot, setup (cheats allowed, through a context
 * that closes when setup ends), then play, where only player input and the game's own commands reach the
 * game. The proof fails when play runs a cheat command (by `cheat: true` or a cheat-like name), or when
 * none of its checks changed during play: the outcome must come from player input, the game's commands
 * or its systems ticking, never from setup.
 *
 * @capability suite-proof-run run a game suite proof headless and refuse a proof whose outcome came from setup or a cheat
 */
export async function runSuiteProof<TProbe extends ProbeReadings>(proof: SuiteProof<TProbe>, options: SuiteProofRunOptions = {}): Promise<SuiteProofRun> {
  const game = proof.game;
  let phase: "setup" | "play" = "setup";
  let cheated: string | null = null;
  /** The commands the game defined by the time setup starts; one setup defines is setup's code, so a cheat in play. */
  let gameCommands = new Set<string>();
  const session = createPlaySession(game, {
    seed: options.seed ?? "suite",
    onCommand: ({ name }) => {
      if (phase !== "play" || cheated !== null) return;
      if (session.ctx.game.commands.isCheat(name) || CHEAT_COMMAND_NAME.test(name) || !gameCommands.has(name)) cheated = name;
    },
  });
  const { ctx } = session;
  const closedMessage = "setup has ended: a proof's play may change the game only through player input and the game's commands";
  const window = openSetupWindow(ctx, closedMessage);
  // Game helpers setup hands the view to (a per-context model, a store) resolve it to the real context.
  aliasContext(window.view, ctx);
  // The game's own code (ticks, commands, the probe) runs as the window's owner: a store or system that
  // kept the setup's context keeps working, while proof code that kept it is refused.
  const owner = window.owner;
  const probeHook = game.capture?.probe;
  const readProbe = (): TProbe => {
    if (probeHook === undefined) throw new Error(`${game.game.name} has no capture.probe; a proof checks the game through its probe`);
    return owner(() => probeHook(ctx));
  };
  const stepper = createFlowStepper(async () => (probeHook === undefined ? undefined : owner(() => probeHook(ctx))));
  const reports: { label: string; probe: unknown }[] = [];
  const keys = createHeadlessKeys(game, session);

  const assertNoCheat = (): void => {
    if (cheated === null) return;
    const why = gameCommands.has(cheated) ? "the cheat command" : "a command setup defined,";
    throw new Error(`play ran ${why} "${cheated}": a cheat may set up a proof, never prove it`);
  };
  const tick = (): void => {
    owner(() => keys.tick());
    assertNoCheat();
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
  const holdKeys = (held: FlowKeys, how: FlowHold<TProbe>): void => {
    owner(() => keys.down(held));
    try {
      const minimum = how.ms ?? 0;
      for (let index = 0, count = minimum > 0 ? keys.ticksFor(minimum) : 0; index < count; index += 1) tick();
      if (how.until !== undefined) waitUntil(how.until, how.timeoutMs ?? FLOW_WAIT_MS, `hold ${keysLabel(held)} until ${describeCheck(how.until)}`);
    } finally {
      owner(() => keys.up(held));
      tick();
    }
  };
  const pressKeys = (pressed: FlowKeys): void => {
    owner(() => keys.down(pressed));
    try {
      for (let index = 0, count = keys.ticksFor(FLOW_PRESS_MS); index < count; index += 1) tick();
    } finally {
      owner(() => keys.up(pressed));
      tick();
    }
  };
  const run = (name: string, input: unknown): FlowCommandResult => {
    const result = owner(() => session.command(name, input ?? DEFAULT_COMMAND_INPUT));
    if (result.status === "unknown-command") throw new Error(`command "${name}" is not registered — registered: ${ctx.game.commands.names().sort().join(", ")}`);
    assertNoCheat();
    if (result.status === "applied") return { status: "applied" };
    return { status: "rejected", reason: result.reason, ...(result.message === undefined ? {} : { message: result.message }) };
  };

  const open = (): void => {
    if (window.closed) throw new Error(closedMessage);
  };
  const setupApi: ProofSetup<TProbe> = {
    ctx: window.view,
    userId: session.userId,
    command(name, input) {
      open();
      const result = run(name, input);
      if (result.status === "rejected") throw new Error(`setup command "${name}" was rejected: ${result.reason}`);
      tick();
    },
    teleport(to) {
      open();
      if (teleportPlayer(ctx, session.userId, to) === null) throw new Error("the player has no body to teleport yet");
      tick();
    },
    timeScale(scale) {
      open();
      if (!Number.isFinite(scale) || scale < 0 || scale > 120) throw new RangeError("timeScale needs a scale between 0 and 120 (1 = normal)");
      ctx.time.setTimescale(scale);
    },
    hold(held, how) {
      open();
      holdKeys(held, how);
    },
    press(pressed) {
      open();
      pressKeys(pressed);
    },
    wait(ms) {
      open();
      for (let index = 0, count = keys.ticksFor(ms); index < count; index += 1) tick();
    },
    waitFor(check, waitOptions = {}) {
      open();
      return waitUntil(check, waitOptions.timeoutMs ?? FLOW_WAIT_MS, waitOptions.note ?? describeCheck(check));
    },
    probe: () => {
      open();
      return readProbe();
    },
  };

  let before: TProbe | null = null;
  let checks = 0;
  let flipped = false;
  const passed = (check: ProbeCheck<TProbe>): void => {
    checks += 1;
    if (before !== null && !check(before)) flipped = true;
  };
  const playApi: ProofPlay<TProbe> = {
    hold: (held, how) =>
      stepper.run(`hold ${keysLabel(held)} ${how.until === undefined ? `${how.ms} ms` : `until ${describeCheck(how.until)}`}`, async () => {
        holdKeys(held, how);
        if (how.until !== undefined) passed(how.until);
      }),
    press: (pressed) => stepper.run(`press ${keysLabel(pressed)}`, async () => pressKeys(pressed)),
    heading: (yaw) =>
      stepper.run(`heading ${yaw.toFixed(3)}`, async () => {
        if (!Number.isFinite(yaw)) throw new RangeError("heading needs a finite yaw in radians");
        owner(() => ctx.camera.turnTo(yaw));
        tick();
      }),
    act: (name, input) =>
      stepper.run(`act ${name}`, async () => {
        const result = run(name, input);
        if (result.status === "rejected") throw new Error(`"${name}" was refused: ${result.reason}${result.message === undefined ? "" : ` (${result.message})`}`);
        tick();
      }),
    tryAct: (name, input) =>
      stepper.run(`try ${name}`, async () => {
        const result = run(name, input);
        tick();
        return result;
      }),
    wait: (ms) =>
      stepper.run(`wait ${ms} ms`, async () => {
        for (let index = 0, count = keys.ticksFor(ms); index < count; index += 1) tick();
      }),
    waitFor: (check, waitOptions = {}) =>
      stepper.run(`wait for ${waitOptions.note ?? describeCheck(check)}`, async () => {
        const readings = waitUntil(check, waitOptions.timeoutMs ?? FLOW_WAIT_MS, waitOptions.note ?? describeCheck(check));
        passed(check);
        return readings;
      }),
    expect: (check, note) =>
      stepper.run(`expect ${note}`, async () => {
        const readings = readProbe();
        if (!check(readings)) throw new Error(`expected ${note}: ${describeCheck(check)} was false`);
        passed(check);
        return readings;
      }),
    probe: async () => readProbe(),
  };

  // The proof owns this session: when it ends, the game's wall-clock autosave must not fire later
  // against the closed window (it did, as an unhandled SetupClosedError in the next test file).
  let report: Awaited<ReturnType<typeof runFlowReport>>;
  try {
    report = await runFlowReport(stepper, reports, async () => {
      await stepper.run(proof.state === undefined ? "boot" : `boot state ${proof.state}`, async () => {
        owner(() => bootCaptureState(session, game.capture, proof.state));
        tick();
      });
      gameCommands = new Set(ctx.game.commands.names());
      if (proof.setup !== undefined) {
        const setup = proof.setup;
        await stepper.run("setup", async () => {
          await setup(setupApi);
        });
      }
      window.close();
      ctx.time.setTimescale(1);
      phase = "play";
      before = readProbe();
      await proof.play(playApi);
      await stepper.run("verdict", async () => {
        if (checks === 0) throw new Error("play checked nothing: end with an expect or waitFor on the outcome");
        if (!flipped) throw new Error("every check in play was already true when play began: setup produced the outcome, not the player");
      });
    });
  } finally {
    ctx.game.save?.dispose();
  }
  return { proves: proof.proves, report };
}

/** A proof loaded from a game's `proofs/sim/` folder, with the file it came from. */
export interface LoadedSuiteProof {
  file: string;
  proof: SuiteProof;
}

/**
 * Run a game's whole suite: every proof, then the content check. The report is deterministic (no times),
 * so the suite test can compare it with the committed one.
 *
 * @capability game-suite-run run every suite proof and the content check of one game into the report its score is read from
 */
export async function runGameSuite(game: string, proofs: readonly LoadedSuiteProof[], content: SuiteContent | null): Promise<SuiteReport> {
  const results: SuiteProofResult[] = [];
  for (const { file, proof } of proofs) {
    const { report } = await runSuiteProof(proof);
    results.push(report.ok
      ? { file, proves: [...proof.proves], ok: true }
      : { file, proves: [...proof.proves], ok: false, failure: `step ${report.failure.index} (${report.failure.label}): ${report.failure.message}` });
  }
  return { game, proofs: results, data: content === null ? [] : auditSuiteContent(content) };
}

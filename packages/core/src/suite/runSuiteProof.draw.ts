import type { ProbeReadings } from "@jgengine/core/game/playableGame";
import { teleportPlayer } from "@jgengine/core/movement/teleport";
import { FLOW_PRESS_MS, FLOW_WAIT_MS, flowKeyList, type FlowCommandResult, type FlowKeys, type ProbeCheck } from "@jgengine/core/play/flow";
import { createFlowStepper, runFlowReport, type FlowRunReport } from "@jgengine/core/play/flowSteps";
import { bootCaptureState } from "@jgengine/core/play/headlessFlow.draw";
import { createHeadlessKeys } from "@jgengine/core/play/headlessKeys.draw";
import { createPlaySession } from "@jgengine/core/play/playSession.draw";

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
 * game. The proof fails when play runs a cheat command (by `cheat: true` or a cheat-like name), takes no
 * player action, or only checks things that were already true before play began.
 *
 * @capability suite-proof-run run a game suite proof headless and refuse a proof whose outcome came from setup or a cheat
 */
export async function runSuiteProof<TProbe extends ProbeReadings>(proof: SuiteProof<TProbe>, options: SuiteProofRunOptions = {}): Promise<SuiteProofRun> {
  const game = proof.game;
  let phase: "setup" | "play" = "setup";
  let cheated: string | null = null;
  const session = createPlaySession(game, {
    seed: options.seed ?? "suite",
    onCommand: ({ name }) => {
      if (phase === "play" && cheated === null && (session.ctx.game.commands.isCheat(name) || CHEAT_COMMAND_NAME.test(name))) cheated = name;
    },
  });
  const { ctx } = session;
  const probeHook = game.capture?.probe;
  const readProbe = (): TProbe => {
    if (probeHook === undefined) throw new Error(`${game.game.name} has no capture.probe; a proof checks the game through its probe`);
    return probeHook(ctx);
  };
  const stepper = createFlowStepper(async () => (probeHook === undefined ? undefined : probeHook(ctx)));
  const reports: { label: string; probe: unknown }[] = [];
  const keys = createHeadlessKeys(game, session);

  const assertNoCheat = (): void => {
    if (cheated !== null) throw new Error(`play ran the cheat command "${cheated}": a cheat may set up a proof, never prove it`);
  };
  const tick = (): void => {
    keys.tick();
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
  const run = (name: string, input: unknown): FlowCommandResult => {
    const result = session.command(name, input ?? DEFAULT_COMMAND_INPUT);
    if (result.status === "unknown-command") throw new Error(`command "${name}" is not registered — registered: ${ctx.game.commands.names().sort().join(", ")}`);
    assertNoCheat();
    if (result.status === "applied") return { status: "applied" };
    return { status: "rejected", reason: result.reason, ...(result.message === undefined ? {} : { message: result.message }) };
  };

  const closedMessage = "setup has ended: a proof's play may change the game only through player input and the game's commands";
  const window = openSetupWindow(ctx, closedMessage);
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
  let actions = 0;
  let checks = 0;
  let flipped = false;
  const passed = (check: ProbeCheck<TProbe>): void => {
    checks += 1;
    if (before !== null && !check(before)) flipped = true;
  };
  const playApi: ProofPlay<TProbe> = {
    hold: (held, how) =>
      stepper.run(`hold ${keysLabel(held)} ${how.until === undefined ? `${how.ms} ms` : `until ${describeCheck(how.until)}`}`, async () => {
        actions += 1;
        keys.down(held);
        try {
          const minimum = how.ms ?? 0;
          for (let index = 0, count = minimum > 0 ? keys.ticksFor(minimum) : 0; index < count; index += 1) tick();
          if (how.until !== undefined) {
            waitUntil(how.until, how.timeoutMs ?? FLOW_WAIT_MS, `hold ${keysLabel(held)} until ${describeCheck(how.until)}`);
            passed(how.until);
          }
        } finally {
          keys.up(held);
          tick();
        }
      }),
    press: (pressed) =>
      stepper.run(`press ${keysLabel(pressed)}`, async () => {
        actions += 1;
        keys.down(pressed);
        try {
          for (let index = 0, count = keys.ticksFor(FLOW_PRESS_MS); index < count; index += 1) tick();
        } finally {
          keys.up(pressed);
          tick();
        }
      }),
    heading: (yaw) =>
      stepper.run(`heading ${yaw.toFixed(3)}`, async () => {
        if (!Number.isFinite(yaw)) throw new RangeError("heading needs a finite yaw in radians");
        ctx.camera.turnTo(yaw);
        tick();
      }),
    act: (name, input) =>
      stepper.run(`act ${name}`, async () => {
        actions += 1;
        const result = run(name, input);
        if (result.status === "rejected") throw new Error(`"${name}" was refused: ${result.reason}${result.message === undefined ? "" : ` (${result.message})`}`);
        tick();
      }),
    tryAct: (name, input) =>
      stepper.run(`try ${name}`, async () => {
        actions += 1;
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

  const report = await runFlowReport(stepper, reports, async () => {
    await stepper.run(proof.state === undefined ? "boot" : `boot state ${proof.state}`, async () => {
      bootCaptureState(session, game.capture, proof.state);
      tick();
    });
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
      if (actions === 0) throw new Error("play took no player action: hold or press a key, or act through a game command");
      if (checks === 0) throw new Error("play checked nothing: end with an expect or waitFor on the outcome");
      if (!flipped) throw new Error("every check in play was already true when play began: setup produced the outcome, not the player");
    });
  });
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

/**
 * The browser side of a TypeScript proof flow: the same `Flow` calls the headless runner answers,
 * carried out on a live page through the drive's CDP helpers. The page work itself (keys, clicks,
 * screenshots, the agent bridge) comes in through {@link BrowserFlowDriver}, so this file is the
 * mapping and its failure messages, testable without a browser.
 */
import type { ProbeReadings } from "../packages/core/src/game/playableGame";
import { FLOW_PRESS_MS, FLOW_WAIT_MS, flowKeyList, type BrowserFlow, type FlowCommandResult, type FlowKeys, type ProbeCheck } from "../packages/core/src/play/flow";
import type { FlowStepper } from "../packages/core/src/play/flowSteps";

/** What the page answers through the agent bridge: `ok` plus the verb's fields, or an error. */
export type BridgeAnswer = { ok: true; [key: string]: unknown } | { ok: false; error: string };

/** The page work a browser flow needs; drive-dev implements it over CDP. */
export interface BrowserFlowDriver {
  /** Hold a `+`-joined chord for at least `minMs`, then until `until` passes when given. */
  hold(chord: string, minMs: number, until?: { check: () => Promise<boolean>; timeoutMs: number; describe: string }): Promise<void>;
  click(text: string, count: 1 | 2): Promise<void>;
  clickAt(x: number, y: number, button: "left" | "right"): Promise<void>;
  fill(label: string, value: string): Promise<void>;
  /** Evaluate a page expression (awaited when it is a promise). */
  evaluate(expression: string): Promise<unknown>;
  /** Call `window.__jgengineAgent.handle(request)`. */
  bridge(request: { method: string } & Record<string, unknown>): Promise<BridgeAnswer>;
  /** The game's `capture.probe` readings, or `null` when the page exposes none. */
  readProbe(): Promise<ProbeReadings | null>;
  reload(): Promise<void>;
  shot(name: string): Promise<void>;
  /** The run's clock: wall time, or a lockstep recording's virtual time. */
  sleep(ms: number): Promise<void>;
  now(): number;
}

const POLL_MS = 50;

function describeCheck(check: { toString(): string }): string {
  const source = check.toString().replace(/\s+/g, " ").trim();
  return source.length > 120 ? `${source.slice(0, 117)}...` : source;
}

function keysLabel(keys: FlowKeys): string {
  return flowKeyList(keys).join("+");
}

function sameValue(actual: unknown, expected: unknown): boolean {
  return expected === undefined ? Boolean(actual) : JSON.stringify(actual) === JSON.stringify(expected);
}

/** A `BrowserFlow` over a driver, with every call a numbered step of `stepper`. */
export function createBrowserFlow(driver: BrowserFlowDriver, stepper: FlowStepper, reports: { label: string; probe: unknown }[]): BrowserFlow<ProbeReadings> {
  const probe = async (): Promise<ProbeReadings> => {
    const readings = await driver.readProbe();
    if (readings === null) throw new Error("the page exposes no capture.probe (window.__jgProbe); add one to the game to wait on game state");
    return readings;
  };
  const waitUntil = async <T>(read: () => Promise<T>, passes: (value: T) => boolean, timeoutMs: number, what: string): Promise<T> => {
    const started = driver.now();
    let last: T | undefined;
    for (;;) {
      last = await read();
      if (passes(last)) return last;
      if (driver.now() - started >= timeoutMs) throw new Error(`${what}: not true after ${timeoutMs} ms (last value ${JSON.stringify(last ?? null)})`);
      await driver.sleep(POLL_MS);
    }
  };
  const command = async (name: string, input: unknown): Promise<FlowCommandResult> => {
    const answer = await driver.bridge({ method: "run_command", name, ...(input === undefined ? {} : { input }) });
    if (!answer.ok) throw new Error(`command "${name}": ${answer.error}`);
    const { status, reason, message } = answer;
    if (status === "applied") return { status: "applied" };
    if (status === "rejected" && typeof reason === "string") return { status: "rejected", reason, ...(typeof message === "string" ? { message } : {}) };
    throw new Error(`command "${name}" is not registered by this game`);
  };
  const bridgeOk = async (request: { method: string } & Record<string, unknown>): Promise<void> => {
    const answer = await driver.bridge(request);
    if (!answer.ok) throw new Error(`${request.method}: ${answer.error}`);
  };
  const page = (expression: string): Promise<unknown> => driver.evaluate(`(async () => (${expression}))()`);

  return {
    hold: (keys, how) =>
      stepper.run(`hold ${keysLabel(keys)} ${how.until === undefined ? `${how.ms} ms` : `until ${describeCheck(how.until)}`}`, async () => {
        const until = how.until;
        await driver.hold(
          keysLabel(keys),
          how.ms ?? 0,
          until === undefined ? undefined : { check: async () => until(await probe()), timeoutMs: how.timeoutMs ?? FLOW_WAIT_MS, describe: describeCheck(until) },
        );
      }),
    press: (keys) => stepper.run(`press ${keysLabel(keys)}`, () => driver.hold(keysLabel(keys), FLOW_PRESS_MS)),
    heading: (yaw) =>
      stepper.run(`heading ${yaw.toFixed(3)}`, async () => {
        await bridgeOk({ method: "camera_heading", yaw });
        await driver.sleep(100);
      }),
    teleport: (to) =>
      stepper.run(`teleport ${to.x},${to.z}`, async () => {
        await bridgeOk({ method: "teleport", ...to });
        await driver.sleep(100);
      }),
    command: (name, input) =>
      stepper.run(`command ${name}`, async () => {
        const result = await command(name, input);
        if (result.status === "rejected") throw new Error(`command "${name}" was rejected: ${result.reason}${result.message === undefined ? "" : ` (${result.message})`}`);
      }),
    tryCommand: (name, input) => stepper.run(`try command ${name}`, () => command(name, input)),
    timeScale: (scale) => stepper.run(`time scale ${scale}`, () => bridgeOk({ method: "time_scale", scale })),
    wait: (ms) => stepper.run(`wait ${ms} ms`, () => driver.sleep(ms)),
    waitFor: (check: ProbeCheck<ProbeReadings>, options = {}) =>
      stepper.run(`wait for ${options.note ?? describeCheck(check)}`, () =>
        waitUntil(probe, check, options.timeoutMs ?? FLOW_WAIT_MS, options.note ?? describeCheck(check))),
    expect: (check, note) =>
      stepper.run(`expect ${note}`, async () => {
        const readings = await probe();
        if (!check(readings)) throw new Error(`expected ${note}: ${describeCheck(check)} was false`);
        return readings;
      }),
    probe,
    report: (label) =>
      stepper.run(`report ${label}`, async () => {
        reports.push({ label, probe: await probe() });
      }),
    shot: (name) => stepper.run(`shot ${name}`, () => driver.shot(name)),
    click: (text, options = {}) => stepper.run(`click "${text}"`, () => driver.click(text, options.double === true ? 2 : 1)),
    clickAt: (x, y, options = {}) => stepper.run(`click at ${x},${y}`, () => driver.clickAt(x, y, options.button ?? "left")),
    fill: (label, value) => stepper.run(`fill "${label}"`, () => driver.fill(label, value)),
    see: (text, options = {}) =>
      stepper.run(`see ${String(text)}`, async () => {
        const matches = (body: unknown) => typeof body === "string" && (typeof text === "string" ? body.includes(text) : text.test(body));
        await waitUntil(() => driver.evaluate("document.body.innerText"), matches, options.timeoutMs ?? FLOW_WAIT_MS, options.note ?? `page text shows ${String(text)}`);
      }),
    page: (expression) => stepper.run(`page ${expression}`, () => page(expression)),
    waitForPage: (expression, options = {}) =>
      stepper.run(`wait for page ${options.note ?? expression}`, () =>
        waitUntil(() => page(expression), (value) => sameValue(value, options.value), options.timeoutMs ?? FLOW_WAIT_MS, options.note ?? expression)),
    expectPage: (expression, note, value) =>
      stepper.run(`expect ${note}`, async () => {
        const actual = await page(expression);
        if (!sameValue(actual, value)) throw new Error(`expected ${note}: ${expression} is ${JSON.stringify(actual ?? null)}${value === undefined ? "" : `, wanted ${JSON.stringify(value)}`}`);
        return actual;
      }),
    reload: () => stepper.run("reload", () => driver.reload()),
    rpc: (request) =>
      stepper.run(`rpc ${request.method}`, async () => {
        const answer = await driver.bridge(request);
        if (!answer.ok) throw new Error(`rpc ${request.method}: ${answer.error}`);
        return answer;
      }),
  };
}

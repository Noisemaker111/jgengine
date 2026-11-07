import { expect, test } from "bun:test";

import {
  MAX_PLAYERS,
  MAX_STEPS,
  MEASURE_MS,
  MIN_STEPS,
  measureRoom,
  nextStep,
  parseArgs,
  rowNotes,
  summarize,
  type RunSample,
} from "./perf-server";

test("defaults are the four measured room sizes, three repeats, no json file", () => {
  expect(parseArgs([])).toEqual({ players: [16, 32, 64, 128], repeats: 3, json: null, maxSeconds: 60 });
});

test("players, repeats, a json path and a cap parse", () => {
  const args = parseArgs(["--players", "16, 256", "--repeats", "5", "--json", "out.jsonl", "--max-seconds", "30"]);
  expect(args).toEqual({ players: [16, 256], repeats: 5, json: "out.jsonl", maxSeconds: 30 });
});

test("bad input fails by name", () => {
  expect(() => parseArgs(["--players"])).toThrow("--players needs a value");
  expect(() => parseArgs(["--repeats", "--json", "x"])).toThrow("--repeats needs a value");
  expect(() => parseArgs(["--players", "16,0"])).toThrow("--players needs a positive whole number, got 0");
  expect(() => parseArgs(["--repeats", "1.5"])).toThrow("--repeats needs a positive whole number, got 1.5");
  expect(() => parseArgs(["--players", String(MAX_PLAYERS * 2)])).toThrow(`over the cap of ${MAX_PLAYERS}`);
  expect(() => parseArgs(["--nope", "1"])).toThrow("unknown flag --nope");
  expect(() => parseArgs(["64"])).toThrow("unexpected argument 64");
});

test("a run measures up to 100 steps, a slow one stops after 5 s once it has 5, and the hard cap ends it", () => {
  expect(nextStep(0, 0, 999_000, 60)).toBe("step");
  expect(nextStep(50, 1000, 2000, 60)).toBe("step");
  expect(nextStep(MAX_STEPS, 1000, 2000, 60)).toBe("done");
  expect(nextStep(MIN_STEPS - 1, MEASURE_MS * 2, MEASURE_MS * 2, 60)).toBe("step");
  expect(nextStep(MIN_STEPS, MEASURE_MS, MEASURE_MS, 60)).toBe("done");
  expect(nextStep(1, 30_000, 61_000, 60)).toBe("capped");
  expect(nextStep(3, 10, 20, 60, 3)).toBe("done");
});

const sample = (wallMs: number, overrides: Partial<RunSample> = {}): RunSample => ({
  steps: 10, wallMs, cpuMs: wallMs, bytes: 2_000_000, messages: 1000, capped: false, ...overrides,
});

test("a row is the per-game-second median of its repeats", () => {
  const row = summarize(10, [sample(300), sample(100), sample(200)]);
  expect(row).toEqual({
    players: 10,
    repeats: 3,
    steps: 10,
    gameSeconds: 1,
    wallMsPerGameSecond: 200,
    cpuMsPerGameSecond: 200,
    mbOutPerGameSecond: 2,
    messagesOutPerGameSecond: 1000,
    avgMessageBytes: 2000,
    keepsUpInRealTime: true,
    capped: false,
  });
  expect(rowNotes(row, 60)).toEqual([]);
});

test("a room over a second per game second, or stopped at the cap, says so on stderr", () => {
  const row = summarize(128, [sample(500, { steps: 2, capped: true })]);
  expect(row).toMatchObject({ steps: 2, gameSeconds: 0.2, wallMsPerGameSecond: 2500, keepsUpInRealTime: false, capped: true });
  expect(rowNotes(row, 60)).toEqual([
    "perf server: 128 players cannot keep up in real time: 2500 wall ms per game second (over 1000)",
    "perf server: 128 players hit the 60 s cap after 2 measured steps",
  ]);
});

// The router decides how often a roster goes out (once per pose or once per pose interval), so this
// pins only what any policy sends: each subscriber hears the room at least once per game step, at
// most once per pose. A harness that never subscribes, or timers that never fire on the fake clock,
// sends nothing.
test("a real room reaches every subscriber at least once per step", async () => {
  const players = 4;
  const steps = 5;
  const run = await measureRoom(players, 60, steps);
  expect(run).toMatchObject({ steps, capped: false });
  expect(run.messages % players).toBe(0);
  expect(run.messages).toBeGreaterThanOrEqual(players * steps);
  expect(run.messages).toBeLessThanOrEqual(players * players * steps);
  expect(run.bytes).toBeGreaterThan(run.messages * 100);
});

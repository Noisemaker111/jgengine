import { expect, test } from "bun:test";

import { MAX_PLAYERS, measureRoom, parseArgs, rowNotes, stepsFor, summarize, type RunSample } from "./perf-server";

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

test("big rooms measure fewer steps, never under five", () => {
  expect(stepsFor(16)).toBe(100);
  expect(stepsFor(32)).toBe(100);
  expect(stepsFor(64)).toBe(12);
  expect(stepsFor(128)).toBe(5);
  expect(stepsFor(MAX_PLAYERS)).toBe(5);
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
    "perf server: 128 players hit the 60 s cap and measured 2 steps instead of 5",
  ]);
});

test("a real room sends every player's pose to every subscriber", async () => {
  const run = await measureRoom(4, 5, 60);
  expect(run).toMatchObject({ steps: 5, capped: false, messages: 4 * 4 * 5 });
  expect(run.bytes).toBeGreaterThan(run.messages * 100);
  expect(run.wallMs).toBeGreaterThan(0);
});

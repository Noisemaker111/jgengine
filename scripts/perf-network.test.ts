import { expect, test } from "bun:test";

import { ALL_GAMES, parseArgs } from "./perf-network";

test("--all expands to the eight reference games", () => {
  expect(parseArgs(["--all"]).games).toEqual([...ALL_GAMES]);
  expect(ALL_GAMES).toHaveLength(8);
});

test("one game, a play window and a json path parse", () => {
  const args = parseArgs(["deepward", "--seconds", "600", "--json", "out.jsonl"]);
  expect(args).toMatchObject({ games: ["deepward"], seconds: 600, json: "out.jsonl" });
});

test("a flag without a value fails by name", () => {
  expect(() => parseArgs(["deepward", "--seconds"])).toThrow("--seconds needs a value");
  expect(() => parseArgs(["deepward", "--nope"])).toThrow("unknown flag --nope");
});

test("no game is an error, not a silent empty run", () => {
  expect(() => parseArgs([])).toThrow("a game id is required");
});

test("--url measures a deployed base without needing the game in Games/", () => {
  const args = parseArgs(["deepward", "--url", "https://jgengine.com/play/"]);
  expect(args.url).toBe("https://jgengine.com/play/");
});

import { expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { game } from "../game.config";
import { ORBIT_SOUNDS } from "./audio";

const SRC = join(import.meta.dir, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return name.endsWith(".ts") || name.endsWith(".tsx") ? [path] : [];
  }).filter((path) => !path.endsWith(".test.ts"));
}

function playedIds(): Set<string> {
  const ids = new Set<string>();
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/audio\.(?:play|loop)\(\s*"([^"]+)"/g)) ids.add(match[1]!);
  }
  return ids;
}

test("every audio id played or looped in source exists in the sounds record", () => {
  const ids = playedIds();
  expect(ids.size).toBeGreaterThan(0);
  const missing = [...ids].filter((id) => ORBIT_SOUNDS[id] === undefined);
  expect(missing).toEqual([]);
});

test("every sound definition is played somewhere and carries its own id", () => {
  const ids = playedIds();
  for (const [key, def] of Object.entries(ORBIT_SOUNDS)) {
    expect(def.id).toBe(key);
    expect(ids.has(key)).toBe(true);
    expect(def.synth?.voices.length ?? 0).toBeGreaterThan(0);
  }
});

test("cues stay short and gentle", () => {
  for (const def of Object.values(ORBIT_SOUNDS)) {
    expect(def.gain ?? 1).toBeLessThanOrEqual(0.9);
    const end = Math.max(...(def.synth?.voices ?? []).map((v) => (v.delay ?? 0) + v.duration));
    expect(end).toBeLessThan(0.6);
  }
});

test("game config wires the sounds record", () => {
  expect(game.audio?.sounds).toBe(ORBIT_SOUNDS);
});

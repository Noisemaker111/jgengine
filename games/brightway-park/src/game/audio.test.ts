import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { BRIGHTWAY_SOUNDS } from "./audio";

const SRC_ROOT = join(import.meta.dir, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.(ts|tsx)$/.test(name) || /\.test\.tsx?$/.test(name)) return [];
    return [path];
  });
}

const sources = sourceFiles(SRC_ROOT).map((path) => ({ path, text: readFileSync(path, "utf8") }));

function idsMatching(pattern: RegExp): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const { path, text } of sources) {
    for (const match of text.matchAll(pattern)) {
      const id = match[1]!;
      found.set(id, [...(found.get(id) ?? []), path.replace(`${SRC_ROOT}/`, "")]);
    }
  }
  return found;
}

describe("brightway-park audio cues", () => {
  test("every audio.play id in the source exists in the sounds record", () => {
    const played = idsMatching(/audio\.play\(\s*"([^"]+)"/g);
    expect(played.size).toBeGreaterThan(0);
    for (const [id, files] of played) {
      expect({ id, known: Object.hasOwn(BRIGHTWAY_SOUNDS, id), files }).toEqual({ id, known: true, files });
    }
  });

  test("every audio.loop sound id in the source exists in the sounds record", () => {
    const looped = idsMatching(/audio\.loop\(\s*"[^"]+"\s*,\s*"([^"]+)"/g);
    expect(looped.size).toBeGreaterThan(0);
    for (const id of looped.keys()) {
      expect(Object.hasOwn(BRIGHTWAY_SOUNDS, id)).toBe(true);
    }
  });

  test("every sound record entry is keyed by its own id and is a synth patch", () => {
    for (const [key, def] of Object.entries(BRIGHTWAY_SOUNDS)) {
      expect(def.id).toBe(key);
      expect(def.synth).toBeDefined();
      expect(def.url).toBeUndefined();
      expect(def.bus).toBe("sfx");
    }
  });

  test("one-shot cues stay short and moderate in gain", () => {
    for (const [key, def] of Object.entries(BRIGHTWAY_SOUNDS)) {
      if (def.loop === true) continue;
      const voices = def.synth!.voices;
      const end = Math.max(...voices.map((v) => (v.delay ?? 0) + v.duration));
      expect({ key, end: end < 0.6 }).toEqual({ key, end: true });
      expect({ key, gain: (def.gain ?? 1) <= 0.9 }).toEqual({ key, gain: true });
    }
  });
});

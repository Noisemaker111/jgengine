import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { EMBER_SOUNDS } from "./audio";

const SRC = join(import.meta.dir, "..");

/** Every .ts/.tsx source file under src/, except this test and the cue record itself. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      sourceFiles(path, out);
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && path !== join(import.meta.dir, "audio.ts")) {
      out.push(path);
    }
  }
  return out;
}

const played = new Set<string>();
const looped = new Set<string>();
for (const file of sourceFiles(SRC)) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(/\baudio\.play\(\s*"([^"]+)"/g)) played.add(match[1]!);
  for (const match of text.matchAll(/\baudio\.loop\(\s*"[^"]*"\s*,\s*"([^"]+)"/g)) looped.add(match[1]!);
}

/** Longest voice end across a patch, in seconds. */
function patchLength(def: (typeof EMBER_SOUNDS)[string]): number {
  return Math.max(...def.synth!.voices.map((v) => (v.delay ?? 0) + v.duration));
}

describe("ember-command sound cues", () => {
  test("every audio.play id in the source exists in the sounds record", () => {
    expect(played.size).toBeGreaterThan(0);
    const missing = [...played].filter((id) => EMBER_SOUNDS[id] === undefined);
    expect(missing).toEqual([]);
  });

  test("every audio.loop sound in the source exists in the sounds record", () => {
    expect(looped.size).toBeGreaterThan(0);
    const missing = [...looped].filter((id) => EMBER_SOUNDS[id] === undefined);
    expect(missing).toEqual([]);
  });

  test("every record entry is played or looped somewhere, so no dead cue ships", () => {
    // `ui.*` ids replace the engine's UI cues, which the shell plays (ui.deny on every deny notice).
    const unused = Object.keys(EMBER_SOUNDS).filter((id) => !id.startsWith("ui.") && !played.has(id) && !looped.has(id));
    expect(unused).toEqual([]);
  });

  test("each record key matches its SoundDef id and is a synth patch on the sfx bus", () => {
    for (const [key, def] of Object.entries(EMBER_SOUNDS)) {
      expect(def.id).toBe(key);
      expect(def.bus).toBe("sfx");
      expect(def.url).toBeUndefined();
      expect(def.synth?.voices.length ?? 0).toBeGreaterThan(0);
    }
  });

  test("one-shot cues stay under 0.6 s and moderate gain; the drone stays quiet", () => {
    for (const [key, def] of Object.entries(EMBER_SOUNDS)) {
      if (def.loop === true) {
        expect(def.gain ?? 1).toBeLessThanOrEqual(0.35);
        continue;
      }
      expect(patchLength(def)).toBeLessThan(0.6);
      expect(def.gain ?? 1).toBeLessThanOrEqual(0.9);
    }
  });

  test("the hall drone is the only looping cue and is retained by id", () => {
    const loops = Object.entries(EMBER_SOUNDS).filter(([, def]) => def.loop === true).map(([key]) => key);
    expect(loops).toEqual(["bed"]);
    expect(looped.has("bed")).toBe(true);
  });
});

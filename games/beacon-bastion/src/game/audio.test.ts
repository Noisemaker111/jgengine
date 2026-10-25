import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { BEACON_SOUNDS } from "./audio";

const SRC_ROOT = join(import.meta.dir, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return name.endsWith(".ts") || name.endsWith(".tsx") ? [path] : [];
  }).filter((path) => !path.endsWith(".test.ts") && !path.endsWith(".test.tsx"));
}

/** Sound ids the game source plays: `audio.play("id", ...)` and `audio.loop("loopId", "sound", ...)`. */
function playedSoundIds(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const pattern = /audio\.(play|loop)\(\s*"([^"]+)"(?:\s*,\s*"([^"]+)")?/g;
  for (const file of sourceFiles(SRC_ROOT)) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(pattern)) {
      const id = match[1] === "loop" ? match[3] : match[2];
      if (id === undefined) continue;
      found.set(id, [...(found.get(id) ?? []), file]);
    }
  }
  return found;
}

describe("beacon bastion sound cues", () => {
  test("every sound id played from source exists in the sounds record", () => {
    const played = playedSoundIds();
    expect(played.size).toBeGreaterThan(0);
    const missing = [...played.keys()].filter((id) => !(id in BEACON_SOUNDS));
    expect(missing).toEqual([]);
  });

  test("every declared cue is played from source", () => {
    const played = playedSoundIds();
    const unused = Object.keys(BEACON_SOUNDS).filter((id) => !played.has(id));
    expect(unused).toEqual([]);
  });

  test("cues are short and moderately loud", () => {
    for (const [id, def] of Object.entries(BEACON_SOUNDS)) {
      expect(def.id).toBe(id);
      expect(def.synth).toBeDefined();
      expect(def.gain ?? 1).toBeLessThanOrEqual(0.9);
      const voices = def.synth!.voices;
      const end = Math.max(...voices.map((voice) => (voice.delay ?? 0) + voice.duration));
      expect(end).toBeLessThan(0.6);
    }
  });
});

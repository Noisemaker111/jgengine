import { describe, expect, test } from "bun:test";

import { MODEL_LIBRARY_RIGGED_ENTRIES } from "./modelLibraryRiggedEntries";

describe("rigged, vehicle and authored library entries", () => {
  test("every entry records a source, an author and a license that matches its provider", () => {
    const names = new Set<string>();
    for (const entry of MODEL_LIBRARY_RIGGED_ENTRIES) {
      expect(names.has(entry.name)).toBe(false);
      names.add(entry.name);
      expect(entry.author.length).toBeGreaterThan(0);
      expect(entry.homepage).toMatch(/^https:\/\//);
      const license = { rocketbox: "MIT", khronos: "CC-BY-4.0", polyhaven: "CC0-1.0", authored: "MIT" }[entry.origin.provider as string];
      expect(entry.license).toBe(license);
    }
  });

  test("human clips are the locomotion set, walk and run held in place", () => {
    for (const entry of MODEL_LIBRARY_RIGGED_ENTRIES) {
      if (entry.origin.provider !== "rocketbox" || !entry.name.startsWith("human/")) continue;
      expect(entry.origin.clips.map((clip) => clip.name)).toEqual(["Idle", "Walk", "Run", "Talk"]);
      for (const clip of entry.origin.clips) if (clip.folder === "xy") expect(clip.inPlace).toBe(true);
    }
  });
});

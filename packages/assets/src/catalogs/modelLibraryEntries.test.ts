import { describe, expect, test } from "bun:test";

import { MODEL_LIBRARY_ENTRIES } from "./modelLibraryEntries";

describe("model library entries", () => {
  test("every curated entry is a CC0 Poly Haven model with simplification ratios in range", () => {
    expect(MODEL_LIBRARY_ENTRIES.length).toBeGreaterThanOrEqual(50);
    for (const entry of MODEL_LIBRARY_ENTRIES) {
      expect(entry.origin.provider).toBe("polyhaven");
      expect(entry.license).toBe("CC0-1.0");
      if (entry.origin.provider !== "polyhaven") continue;
      expect(entry.origin.near).toBeGreaterThan(0);
      expect(entry.origin.near).toBeLessThanOrEqual(1);
      expect(entry.origin.far).toBeGreaterThan(0);
      const keep = entry.origin.keep;
      if (keep !== undefined) expect(() => new RegExp(keep)).not.toThrow();
    }
  });
});

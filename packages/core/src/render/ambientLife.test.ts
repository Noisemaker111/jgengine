import { describe, expect, test } from "bun:test";

import { resolveAmbientLife } from "./ambientLife";

describe("ambient life", () => {
  test("birds by default, litter and steam only when asked, everything off with false", () => {
    const unset = resolveAmbientLife(undefined, false);
    expect(unset.birds?.count).toBe(14);
    expect(unset.litter).toBeNull();
    expect(unset.steam).toEqual([]);
    expect(resolveAmbientLife(undefined, true).birds?.count).toBe(7);
    const authored = resolveAmbientLife({ birds: false, litter: { groundY: 1.2 }, steam: [{ position: [1, 0, 2] }] }, false);
    expect(authored.birds).toBeNull();
    expect(authored.litter).toEqual({ count: 32, groundY: 1.2 });
    expect(authored.steam).toEqual([{ position: [1, 0, 2], size: 0.8, rise: 4 }]);
    const off = resolveAmbientLife(false, false);
    expect(off.birds).toBeNull();
    expect(off.litter).toBeNull();
  });
});

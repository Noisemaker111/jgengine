import { describe, expect, test } from "bun:test";
import { seededRng } from "./rng";
import { pickUniform, pickWeighted } from "./pick";

describe("pickUniform", () => {
  test("empty returns undefined", () => {
    expect(pickUniform(seededRng(1), [])).toBeUndefined();
  });
  test("always in range", () => {
    const rng = seededRng("pick");
    const items = ["a", "b", "c", "d"];
    for (let i = 0; i < 200; i += 1) expect(items).toContain(pickUniform(rng, items)!);
  });
});

describe("pickWeighted", () => {
  test("zero total returns undefined", () => {
    expect(pickWeighted(seededRng(1), [{ w: 0 }], (x) => x.w)).toBeUndefined();
    expect(pickWeighted(seededRng(1), [], () => 1)).toBeUndefined();
  });
  test("respects weight proportions", () => {
    const rng = seededRng("weights");
    const items = [
      { id: "rare", w: 1 },
      { id: "common", w: 9 },
    ];
    const counts = { rare: 0, common: 0 } as Record<string, number>;
    for (let i = 0; i < 4000; i += 1) counts[pickWeighted(rng, items, (x) => x.w)!.id]! += 1;
    expect(counts.common!).toBeGreaterThan(counts.rare! * 4);
  });
  test("skips non-positive weights", () => {
    const rng = seededRng(3);
    const items = [
      { id: "off", w: 0 },
      { id: "on", w: 5 },
    ];
    for (let i = 0; i < 50; i += 1) expect(pickWeighted(rng, items, (x) => x.w)!.id).toBe("on");
  });
  test("a roll exactly on a boundary goes to the later item", () => {
    const items = [
      { id: "a", w: 1 },
      { id: "b", w: 1 },
    ];
    expect(pickWeighted(() => 0, items, (x) => x.w)?.id).toBe("a");
    expect(pickWeighted(() => 0.5, items, (x) => x.w)?.id).toBe("b");
  });
  test("never returns a zero-weight item at the end", () => {
    const items = [
      { id: "on", w: 1 },
      { id: "off", w: 0 },
    ];
    expect(pickWeighted(() => 0.9999999999, items, (x) => x.w)?.id).toBe("on");
  });
});

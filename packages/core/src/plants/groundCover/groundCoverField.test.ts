import { describe, expect, test } from "bun:test";

import { parseParams } from "../../generator/paramSchema";
import { GROUND_COVER_SCHEMA, growGroundCoverLook, resolveGroundCoverObject } from "./groundCoverField";

const box = (meta: Record<string, unknown>) => ({ id: "lawn", kind: "ground_cover", center: { x: 4, y: 1, z: 2 }, halfExtents: { x: 5, y: 0.5, z: 3 }, meta });

describe("ground-cover field kind", () => {
  test("a volume resolves to its footprint and a look grown from its species, the same every load", () => {
    const a = resolveGroundCoverObject(box({}));
    const b = resolveGroundCoverObject(box({}));
    expect(a?.center).toEqual([4, 0.5, 2]);
    expect(a?.size).toEqual([10, 6]);
    expect(b?.look).toEqual(a?.look);
    expect(a?.look.colour.baseColor).toMatch(/^#/);
  });

  test("a weekly-mown lawn is shorter than the same mix left as a meadow", () => {
    const meadow = growGroundCoverLook(parseParams(GROUND_COVER_SCHEMA, { weeks: 26 }));
    const lawn = growGroundCoverLook(parseParams(GROUND_COVER_SCHEMA, { weeks: 26, mowHeightM: 0.03 }));
    expect(lawn.blade.bladeHeight).toBeLessThan(meadow.blade.bladeHeight);
  });

  test("a busy path holds less cover than an untrodden sward", () => {
    const sward = growGroundCoverLook(parseParams(GROUND_COVER_SCHEMA, { weeks: 30, mowHeightM: 0.04 }));
    const path = growGroundCoverLook(parseParams(GROUND_COVER_SCHEMA, { weeks: 30, mowHeightM: 0.04, trample: 1 }));
    expect(path.blade.density).toBeLessThan(sward.blade.density);
  });
});

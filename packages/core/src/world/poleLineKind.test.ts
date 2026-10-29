import { describe, expect, test } from "bun:test";

import { parseParams } from "../generator/paramSchema";
import { POLE_LINE_KIND, POLE_LINE_SCHEMA, resolvePoleLine } from "./poleLineKind";

const line = { id: "line", kind: POLE_LINE_KIND, points: [{ x: 0, y: 0, z: 0 }, { x: 80, y: 0, z: 0 }] };
const lowest = (meta: Record<string, unknown>): number[] =>
  resolvePoleLine(line, parseParams(POLE_LINE_SCHEMA, { spacing: 10, wireCount: 1, ...meta })).cables.map((cable) =>
    Math.min(...cable.points.map((point) => point[1])),
  );

describe("pole_line seed", () => {
  test("the same seed hangs the same cables", () => {
    expect(lowest({ seed: "a" })).toEqual(lowest({ seed: "a" }));
  });

  test("a different seed changes how deep each span sags", () => {
    expect(lowest({ seed: "a" })).not.toEqual(lowest({ seed: "b" }));
  });

  test("spans vary within one run, and not at all with no sag variation", () => {
    expect(new Set(lowest({ seed: "a" })).size).toBeGreaterThan(1);
    expect(new Set(lowest({ seed: "a", sagJitter: 0 })).size).toBe(1);
    expect(lowest({ seed: "a", sagJitter: 0 })).toEqual(lowest({ seed: "b", sagJitter: 0 }));
  });
});

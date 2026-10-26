import { describe, expect, test } from "bun:test";
import type { FrustumSample } from "@jgengine/core/sensor/frustumSensor";

import { frustumSampleDisplayEqual } from "./frustumSampleEqual";

function sample(partial: Partial<FrustumSample> & Pick<FrustumSample, "id">): FrustumSample {
  return {
    inView: true,
    distance: 5,
    screenX: 0,
    screenY: 0,
    framing: 0.5,
    dwellSeconds: 1.2,
    ...partial,
  };
}

describe("frustumSampleDisplayEqual", () => {
  test("treats identical display readout as equal", () => {
    const a = sample({ id: "boss", framing: 0.504, dwellSeconds: 1.24 });
    const b = sample({ id: "boss", framing: 0.501, dwellSeconds: 1.2 });
    expect(frustumSampleDisplayEqual(a, b)).toBe(true);
  });

  test("notifies when subject id changes", () => {
    expect(frustumSampleDisplayEqual(sample({ id: "a" }), sample({ id: "b" }))).toBe(false);
  });

  test("notifies when framing percent changes", () => {
    expect(
      frustumSampleDisplayEqual(sample({ id: "a", framing: 0.4 }), sample({ id: "a", framing: 0.5 })),
    ).toBe(false);
  });

  test("null and sample are not equal", () => {
    expect(frustumSampleDisplayEqual(null, sample({ id: "a" }))).toBe(false);
    expect(frustumSampleDisplayEqual(null, null)).toBe(true);
  });
});

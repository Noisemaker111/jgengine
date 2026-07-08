import { describe, expect, test } from "bun:test";

import { resolveRigKind, turntableAsObserver } from "./rigResolve";

describe("resolveRigKind", () => {
  test("infers the turntable rig from its block alone, no explicit rig", () => {
    expect(resolveRigKind({ turntable: { distance: 12 } })).toBe("turntable");
  });

  test("an explicit rig still wins over an inferred block", () => {
    expect(resolveRigKind({ rig: "orbit", turntable: { distance: 12 } })).toBe("orbit");
  });

  test("defaults to orbit, and perspective:first maps to the first rig", () => {
    expect(resolveRigKind(undefined)).toBe("orbit");
    expect(resolveRigKind({})).toBe("orbit");
    expect(resolveRigKind({ perspective: "first" })).toBe("first");
  });
});

describe("turntableAsObserver", () => {
  test("maps a flat target to an observer point bind and carries the orbit fields", () => {
    const mapped = turntableAsObserver({
      turntable: { target: { x: 0, y: 0.5, z: 0 }, distance: 12, height: 7, orbitSpeed: 0.12, fov: 42 },
    });
    expect(mapped.observer?.bind).toEqual({ kind: "point", position: { x: 0, y: 0.5, z: 0 } });
    expect(mapped.observer?.distance).toBe(12);
    expect(mapped.observer?.orbitSpeed).toBe(0.12);
    expect(mapped.observer?.fov).toBe(42);
  });

  test("omits fields that were not set rather than writing undefined", () => {
    const mapped = turntableAsObserver({ turntable: { distance: 9 } });
    expect("bind" in (mapped.observer ?? {})).toBe(false);
    expect("height" in (mapped.observer ?? {})).toBe(false);
    expect(mapped.observer?.distance).toBe(9);
  });
});

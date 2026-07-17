import { describe, expect, test } from "bun:test";

import {
  acquireTarget,
  createTargetAcquirer,
  type AcquisitionPolicy,
} from "@jgengine/core/ai/targetAcquisition";

type Pos = readonly [number, number];

function distancePolicy(
  positions: Record<string, Pos | null>,
  self: Pos,
  extra: Partial<AcquisitionPolicy> = {},
): AcquisitionPolicy {
  return {
    candidates: () => Object.keys(positions),
    distance: (_selfId, candidateId) => {
      const p = positions[candidateId];
      if (p === undefined || p === null) return null;
      return Math.hypot(self[0] - p[0], self[1] - p[1]);
    },
    ...extra,
  };
}

describe("acquireTarget", () => {
  test("thin default picks the nearest candidate (unbounded range)", () => {
    const policy = distancePolicy({ far: [50, 0], near: [4, 0], mid: [12, 0] }, [0, 0]);
    const result = acquireTarget(policy, "self");
    expect(result.targetId).toBe("near");
    expect(result.considered).toBe(3);
    expect(result.changed).toBe(true);
  });

  test("dynamic range envelope varies acquisition per candidate", () => {
    // Elite mobs see farther than grunts: range depends on the candidate.
    const policy = distancePolicy({ grunt: [8, 0], elite: [8, 0] }, [0, 0], {
      range: (_selfId, candidateId) => (candidateId === "elite" ? 10 : 5),
    });
    const result = acquireTarget(policy, "self");
    // grunt is 8 away with a 5 range → out; elite is 8 away with a 10 range → in.
    expect(result.targetId).toBe("elite");
    expect(result.considered).toBe(1);
  });

  test("eligibility filter rejects candidates before range/perception", () => {
    let perceptionCalls = 0;
    const policy = distancePolicy({ friend: [1, 0], foe: [5, 0] }, [0, 0], {
      eligible: (_selfId, candidateId) => candidateId === "foe",
      perceptible: () => {
        perceptionCalls += 1;
        return true;
      },
    });
    const result = acquireTarget(policy, "self");
    expect(result.targetId).toBe("foe");
    expect(result.considered).toBe(1);
    // Perception (the costly gate) only ran for the eligible, in-range candidate.
    expect(perceptionCalls).toBe(1);
  });

  test("perception/LOS gate drops candidates that pass range", () => {
    const policy = distancePolicy({ behindWall: [2, 0], visible: [6, 0] }, [0, 0], {
      perceptible: (_selfId, candidateId) => candidateId !== "behindWall",
    });
    expect(acquireTarget(policy, "self").targetId).toBe("visible");
  });

  test("custom scoring and deterministic tie-break", () => {
    // score = threat; tie broken by id order.
    const threat: Record<string, number> = { a: 5, b: 5, c: 3 };
    const policy = distancePolicy({ a: [1, 0], b: [1, 0], c: [1, 0] }, [0, 0], {
      score: (_selfId, candidateId) => threat[candidateId] ?? 0,
    });
    const result = acquireTarget(policy, "self");
    expect(result.targetId).toBe("a"); // a and b tie at 5; id order prefers a
  });

  test("null distance rejects despawned candidates", () => {
    const policy = distancePolicy({ gone: null, here: [9, 0] }, [0, 0]);
    expect(acquireTarget(policy, "self").targetId).toBe("here");
  });

  test("self is never acquired", () => {
    const policy = distancePolicy({ self: [0, 0], other: [3, 0] }, [0, 0]);
    expect(acquireTarget(policy, "self").targetId).toBe("other");
  });

  describe("retention hysteresis", () => {
    test("switchMargin keeps the held target when a challenger only ties/marginally wins", () => {
      const threat: Record<string, number> = { held: 10, challenger: 11 };
      const policy = distancePolicy({ held: [1, 0], challenger: [1, 0] }, [0, 0], {
        score: (_selfId, candidateId) => threat[candidateId] ?? 0,
        retention: { switchMargin: 3 },
      });
      const result = acquireTarget(policy, "self", "held");
      expect(result.targetId).toBe("held"); // 11 < 10 + 3
      expect(result.changed).toBe(false);

      threat.challenger = 14; // now clears the margin
      expect(acquireTarget(policy, "self", "held").targetId).toBe("challenger");
    });

    test("dropRangeScale retains a held target past the acquisition edge", () => {
      const policy = distancePolicy({ held: [9, 0] }, [0, 0], {
        range: 6,
        retention: { dropRangeScale: 2 }, // held kept out to 12
      });
      // Cold acquire fails at distance 9 with range 6.
      expect(acquireTarget(policy, "self").targetId).toBeNull();
      // But an already-held target at 9 stays acquired (9 <= 6 * 2).
      const retained = acquireTarget(policy, "self", "held");
      expect(retained.targetId).toBe("held");
      expect(retained.changed).toBe(false);
    });
  });
});

describe("createTargetAcquirer", () => {
  test("holds the target across passes and round-trips through hold()", () => {
    const positions: Record<string, Pos | null> = { a: [3, 0], b: [4, 0] };
    const policy: AcquisitionPolicy = {
      candidates: () => Object.keys(positions),
      distance: (_selfId, id) => {
        const p = positions[id];
        return p == null ? null : Math.hypot(p[0], p[1]);
      },
      retention: { dropRangeScale: 1 },
    };
    const acquirer = createTargetAcquirer(policy);
    expect(acquirer.acquire("self")).toBe("a");
    expect(acquirer.target()).toBe("a");
    expect(acquirer.considered()).toBe(2);

    // Serialize round-trip: the only state is the held id.
    const saved = acquirer.target();
    const restored = createTargetAcquirer(policy);
    restored.hold(saved);
    expect(restored.target()).toBe("a");
    expect(restored.acquire("self")).toBe("a");

    restored.clear();
    expect(restored.target()).toBeNull();
  });
});

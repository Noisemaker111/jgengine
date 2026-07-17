import { describe, expect, test } from "bun:test";

import { resolveLocalAvoidance, type AvoidanceAgent } from "@jgengine/core/movement/avoidance";
import {
  assignFormationSlots,
  facingYaw,
  placeFormation,
  wedgeFormation,
  type Vec2,
} from "@jgengine/core/movement/formation";

/**
 * Adoption probe: the three group-movement seams composed as a game would use
 * them — face the destination, slot the group into a formation, match members
 * to slots stably across ticks, and separate overlap locally. Plus one
 * non-formation crowd case that reuses avoidance on its own.
 */
describe("group movement adoption", () => {
  test("squad probe: scattered members reach a stable, non-overlapping wedge", () => {
    const radius = 0.4;
    const members: Vec2[] = [
      [-3, -6],
      [4, -5],
      [0, -8],
      [-5, -4],
      [3, -7],
    ];
    const start: Vec2 = [0, -6];
    const destination: Vec2 = [0, 6];
    const facing = facingYaw(start, destination);
    const slots = placeFormation(destination, facing, members.length, wedgeFormation({ spacing: 1.5 }));

    // Tick 1: initial assignment.
    let assignment = assignFormationSlots(members, slots);
    expect([...assignment].sort()).toEqual([0, 1, 2, 3, 4]);

    // Tick 2: members drift slightly; stickiness keeps the assignment stable.
    const drifted: Vec2[] = members.map((m) => [m[0] + 0.1, m[1] + 0.2]);
    const restuck = assignFormationSlots(drifted, slots, { previous: assignment, stickiness: 50 });
    expect(restuck).toEqual(assignment);
    assignment = restuck;

    // Snap each member onto its slot, then let local avoidance settle overlaps.
    const agents: AvoidanceAgent[] = assignment.map((slot) => ({
      position: slots[slot]!,
      radius,
    }));
    resolveLocalAvoidance(agents, { iterations: 8 });
    for (let i = 0; i < agents.length; i += 1) {
      for (let j = i + 1; j < agents.length; j += 1) {
        const dist = Math.hypot(
          agents[i]!.position[0] - agents[j]!.position[0],
          agents[i]!.position[1] - agents[j]!.position[1],
        );
        expect(dist).toBeGreaterThanOrEqual(2 * radius - 1e-6);
      }
    }
  });

  test("crowd case: a jammed doorway spreads without a formation", () => {
    // 12 agents piled at a chokepoint; avoidance alone (no formation) unpacks them.
    const agents: AvoidanceAgent[] = [];
    for (let i = 0; i < 12; i += 1) {
      agents.push({ position: [Math.cos(i) * 0.15, Math.sin(i) * 0.15], radius: 0.3 });
    }
    resolveLocalAvoidance(agents, { iterations: 16 });
    let overlapping = 0;
    for (let i = 0; i < agents.length; i += 1) {
      for (let j = i + 1; j < agents.length; j += 1) {
        const dist = Math.hypot(
          agents[i]!.position[0] - agents[j]!.position[0],
          agents[i]!.position[1] - agents[j]!.position[1],
        );
        if (dist < 2 * 0.3 - 0.05) overlapping += 1;
      }
    }
    expect(overlapping).toBe(0);
  });
});

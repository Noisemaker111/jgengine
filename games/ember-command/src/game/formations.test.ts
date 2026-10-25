import { beforeEach, describe, expect, test } from "bun:test";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import type { Vec2 } from "@jgengine/core/movement/formation";

import {
  anchorFormation,
  columnFormation,
  formationOffsets,
  formationSlotFor,
  formationSlots,
  holdFormation,
  offsetToWorld,
  reshapeFormation,
  type FormationKind,
} from "./formations";
import { resetSession, session, type UnitRuntime } from "./session";
import { FORMATION_HOLD_TOLERANCE, FORMATION_SPACING } from "./tuning";

const KINDS: FormationKind[] = ["line", "wedge", "column"];

/** Minimal stand-in for the scene: only `scene.entity.get` is read by the formation helpers. */
function ctxWith(positions: Map<string, EntityPosition>): GameContext {
  return {
    scene: {
      entity: {
        get: (id: string) => (positions.has(id) ? { id, position: positions.get(id)! } : null),
      },
    },
  } as unknown as GameContext;
}

function addPlayerUnit(id: string): UnitRuntime {
  const unit: UnitRuntime = {
    id,
    catalogId: "footman",
    faction: "player",
    kind: "unit",
    command: { kind: "idle" },
    leash: 0,
    attackCooldown: 0,
  };
  session.units.set(id, unit);
  return unit;
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

describe("formation shapes", () => {
  test("a formation keeps its offsets when the anchor moves", () => {
    for (const kind of KINDS) {
      const facing = 0.7; // rad — an arbitrary heading, not axis-aligned
      const origin = formationSlots(kind, { x: 0, z: 0 }, facing, 7);
      const moved = formationSlots(kind, { x: 12, z: -5 }, facing, 7);
      expect(moved).toHaveLength(origin.length);
      origin.forEach((slot, i) => {
        // Every rank translates with the anchor: same facing, same shape, no reshuffle.
        expect(moved[i]![0] - slot[0]).toBeCloseTo(12, 9);
        expect(moved[i]![1] - slot[1]).toBeCloseTo(-5, 9);
      });
    }
  });

  test("each shape spreads its members on its own axis", () => {
    const count = 5;
    const line = formationOffsets("line", count);
    const wedge = formationOffsets("wedge", count);
    const column = formationOffsets("column", count);

    // Line: one rank, spread across the group's right axis only.
    const lineRight = new Set(line.map((offset) => offset[0]));
    expect(lineRight.size).toBe(count);
    expect(line.every((offset) => offset[1] === 0)).toBe(true);

    // Column: single file, every member on the group's centreline, one spacing apart.
    expect(column.every((offset) => offset[0] === 0)).toBe(true);
    expect(column[1]![1]).toBeCloseTo(-FORMATION_SPACING, 9);
    expect(column[4]![1]).toBeCloseTo(-4 * FORMATION_SPACING, 9);

    // Wedge: the tip forward on the centreline, later ranks stepping out and back.
    expect(wedge[0]).toEqual([0, 0]);
    expect(wedge[1]![0]).toBeGreaterThan(0);
    expect(wedge[2]![0]).toBeLessThan(0);
    expect(wedge[1]![1]).toBeLessThan(wedge[0]![1]);
  });

  test("a column generator hands back the offsets the placement uses", () => {
    const offsets = columnFormation({ spacing: 2 })(3);
    expect(offsets).toHaveLength(3);
    offsets.forEach((offset, i) => {
      expect(Math.abs(offset[0])).toBe(0);
      expect(offset[1]).toBeCloseTo(-2 * i, 9);
    });
    // placeFormation at zero facing puts each slot straight back along -z.
    const slots = formationSlots("column", { x: 3, z: 3 }, 0, 3, 2);
    expect(slots[1]![0]).toBeCloseTo(3, 9);
    expect(slots[1]![1]).toBeCloseTo(1, 9);
  });

  test("an offset round-trips through the yaw frame", () => {
    const anchor = { x: -4, z: 9 };
    const facing = 2.1;
    const world = offsetToWorld(anchor, facing, [0, -FORMATION_SPACING]);
    // Placement's own frame maps local offsets the same way the held slots do.
    const placed = formationSlots("column", anchor, facing, 2)[1]!;
    expect(placed[0]).toBeCloseTo(world[0], 9);
    expect(placed[1]).toBeCloseTo(world[1], 9);
    // And the group's centre sits on the anchor.
    expect(dist(offsetToWorld(anchor, facing, [0, 0]), [anchor.x, anchor.z])).toBeLessThan(1e-9);
  });
});

describe("holding the anchor", () => {
  beforeEach(() => resetSession());

  test("a re-anchored group keeps its offsets and every member holds one", () => {
    const positions = new Map<string, EntityPosition>([
      ["f1", [0, 0, 0]],
      ["f2", [0, 0, 3]],
      ["f3", [2, 0, 1]],
    ]);
    const ctx = ctxWith(positions);
    const units = ["f1", "f2", "f3"].map(addPlayerUnit);

    anchorFormation(ctx, units, 10, 10, false);
    const shape = formationOffsets("line", units.length).map((offset) => `${offset[0].toFixed(4)}:${offset[1].toFixed(4)}`).sort();
    const before = units.map((u) => session.formation.offsets[u.id]!);
    expect(units.map((u) => `${session.formation.offsets[u.id]![0].toFixed(4)}:${session.formation.offsets[u.id]![1].toFixed(4)}`).sort()).toEqual(shape);

    // The group marches onto the slots it was given, then is ordered again elsewhere.
    units.forEach((u) => positions.set(u.id, [u.guardPoint!.x, 0, u.guardPoint!.z]));
    anchorFormation(ctx, units, 18, 2, false);

    expect(session.formation.anchor).toEqual({ x: 18, z: 2 });
    expect(session.formation.members).toEqual(["f1", "f2", "f3"]);
    // The same offsets come back — a re-anchor re-places the shape, it does not re-invent it.
    const after = units.map((u) => session.formation.offsets[u.id]!);
    expect(after.map((o) => o.join(":")).sort()).toEqual(before.map((o) => o.join(":")).sort());
    // And each member stands on (anchor + its own offset): that is what the hold loop keeps true.
    for (const unit of units) {
      const held = formationSlotFor(session.formation, unit.id)!;
      expect(unit.guardPoint!.x).toBeCloseTo(held[0], 6);
      expect(unit.guardPoint!.z).toBeCloseTo(held[1], 6);
    }
  });

  test("a member that drifts off its slot walks back, one at post does not", () => {
    const positions = new Map<string, EntityPosition>([
      ["f1", [0, 0, 0]],
      ["f2", [0, 0, 2]],
    ]);
    const ctx = ctxWith(positions);
    const units = ["f1", "f2"].map(addPlayerUnit);
    anchorFormation(ctx, units, 12, 0, false);
    // Both arrive, then f2 is shoved six units off its post by a fight that ended.
    units.forEach((u) => positions.set(u.id, [u.guardPoint!.x, 0, u.guardPoint!.z]));
    units[0]!.command = { kind: "idle" };
    units[1]!.command = { kind: "idle" };
    const slot = formationSlotFor(session.formation, "f2")!;
    positions.set("f2", [slot[0] + FORMATION_HOLD_TOLERANCE + 3, 0, slot[1]]);

    holdFormation(ctx);

    expect(units[0]!.command.kind).toBe("idle");
    const back = units[1]!.command;
    expect(back.kind).toBe("move");
    expect(back.kind === "move" && back.x).toBeCloseTo(slot[0], 6);
    expect(back.kind === "move" && back.z).toBeCloseTo(slot[1], 6);
  });

  test("choosing a new shape re-dresses the standing group without moving the anchor", () => {
    const positions = new Map<string, EntityPosition>([
      ["f1", [-1, 0, 0]],
      ["f2", [1, 0, 0]],
      ["f3", [0, 0, 1]],
    ]);
    const ctx = ctxWith(positions);
    const units = ["f1", "f2", "f3"].map(addPlayerUnit);
    anchorFormation(ctx, units, 6, 6, false);
    const anchor = { ...session.formation.anchor };

    reshapeFormation(ctx, "column");

    expect(session.formation.kind).toBe("column");
    expect(session.formation.anchor).toEqual(anchor);
    // Column members share the centreline: their offsets differ only along forward.
    const offsets = units.map((u) => session.formation.offsets[u.id]!);
    expect(offsets.every((offset) => offset[0] === 0)).toBe(true);
    const targets = units.map((u) => u.guardPoint!);
    expect(new Set(targets.map((t) => `${t.x.toFixed(4)}:${t.z.toFixed(4)}`)).size).toBe(units.length);
  });
});

import { beforeEach, describe, expect, test } from "bun:test";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";

import { resetSession, session, type UnitRuntime } from "../session";
import { tickUnits } from "./units";

interface Recorder {
  ctx: GameContext;
  moves: { id: string; to: EntityPosition }[];
  damages: { from: string; to: string; amount: number }[];
}

function fakeCtx(positions: Map<string, EntityPosition>): Recorder {
  const moves: { id: string; to: EntityPosition }[] = [];
  const damages: { from: string; to: string; amount: number }[] = [];
  const entity = {
    get: (id: string) => (positions.has(id) ? { id, position: positions.get(id)! } : null),
    moveTowardCommit: (id: string, to: EntityPosition) => {
      moves.push({ id, to });
      return to;
    },
    setPose: () => true,
    effect: (input: { from: string; to: string; via?: { amount?: number } }) => {
      damages.push({ from: input.from, to: input.to, amount: input.via?.amount ?? 0 });
      return [];
    },
  };
  const ctx = { scene: { entity } } as unknown as GameContext;
  return { ctx, moves, damages };
}

function addUnit(id: string, catalogId: string, faction: "player" | "enemy", command: UnitRuntime["command"]): void {
  session.units.set(id, {
    id,
    catalogId,
    faction,
    kind: "unit",
    command,
    leash: 0,
    attackCooldown: 0,
  });
}

describe("unit AI", () => {
  beforeEach(() => resetSession());

  test("an idle unit strikes an adjacent hostile", () => {
    addUnit("f1", "footman", "player", { kind: "idle" });
    addUnit("e1", "grunt", "enemy", { kind: "idle" });
    const rec = fakeCtx(
      new Map<string, EntityPosition>([
        ["f1", [0, 0, 0]],
        ["e1", [1.5, 0, 0]], // inside footman reach (1.9)
      ]),
    );
    tickUnits(rec.ctx, 0.5);
    expect(rec.damages.some((d) => d.from === "f1" && d.to === "e1")).toBe(true);
  });

  test("an idle unit closes on a hostile that is in aggro range but out of reach", () => {
    addUnit("f1", "footman", "player", { kind: "idle" });
    addUnit("e1", "grunt", "enemy", { kind: "idle" });
    const rec = fakeCtx(
      new Map<string, EntityPosition>([
        ["f1", [0, 0, 0]],
        ["e1", [6, 0, 0]], // within aggro (8), beyond reach
      ]),
    );
    tickUnits(rec.ctx, 0.5);
    expect(rec.moves.some((m) => m.id === "f1")).toBe(true);
    expect(rec.damages.length).toBe(0);
  });

  test("attack-move advances toward its destination when no enemy is near", () => {
    addUnit("e1", "grunt", "enemy", { kind: "attackMove", x: 0, z: 30 });
    const rec = fakeCtx(new Map<string, EntityPosition>([["e1", [0, 0, -30]]]));
    tickUnits(rec.ctx, 0.5);
    expect(rec.moves.some((m) => m.id === "e1")).toBe(true);
  });

  test("does not target a friendly unit", () => {
    addUnit("f1", "footman", "player", { kind: "idle" });
    addUnit("f2", "footman", "player", { kind: "idle" });
    const rec = fakeCtx(
      new Map<string, EntityPosition>([
        ["f1", [0, 0, 0]],
        ["f2", [1.5, 0, 0]],
      ]),
    );
    tickUnits(rec.ctx, 0.5);
    expect(rec.damages.length).toBe(0);
  });
});

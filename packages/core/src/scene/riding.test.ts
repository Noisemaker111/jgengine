import { expect, test } from "bun:test";

import { defineGameDefinition } from "../game/defineGame";
import { createGameContext } from "../runtime/gameContext";

import { ridingOf } from "./riding";

function world() {
  const definition = defineGameDefinition({ name: "Riding", multiplayer: "off" });
  const ctx = createGameContext({ definition, content: {}, player: { userId: "p1", isNew: true } });
  ctx.scene.entity.spawn("player", { id: "p1", position: [0, 0, 0], role: "player" });
  ctx.scene.entity.spawn("raptor", { id: "r1", position: [2, 0, 0], role: "npc" });
  return ctx;
}

test("riding hands controls to the mount and carries the rider on its seat", () => {
  const ctx = world();
  const riding = ridingOf(ctx);
  expect(riding.ride("p1", "r1", [0, 1.2, -0.2])).toEqual({ ok: true });
  expect(ctx.player.possession.active("p1")).toBe("r1");
  expect(ctx.scene.entity.get("p1")!.movement.frozen).toBe(true);
  expect(riding.mountOf("p1")).toBe("r1");
  expect(riding.riderOf("r1")).toBe("p1");

  // The mount runs north and turns; after movement the rider sits on its back.
  ctx.scene.entity.setPose("r1", { position: [2, 0, 10], rotationY: Math.PI / 2 });
  ctx.sim.runStages("afterMovement", 1 / 60);
  const rider = ctx.scene.entity.get("p1")!;
  expect(rider.position[0]).toBeCloseTo(1.8);
  expect(rider.position[1]).toBeCloseTo(1.2);
  expect(rider.position[2]).toBeCloseTo(10);
  expect(rider.rotationY).toBeCloseTo(Math.PI / 2);
  expect(riding.ride("p1", "r1", [0, 1, 0])).toEqual({ ok: false, reason: "already riding" });
});

test("getting off returns control and sets the rider down beside the mount; riders round-trip", () => {
  const ctx = world();
  const riding = ridingOf(ctx);
  riding.ride("p1", "r1", [0, 1.2, 0]);
  const saved = JSON.parse(JSON.stringify(riding.snapshot()));
  expect(riding.dismount("p1")).toBe("r1");
  expect(ctx.player.possession.active("p1")).toBe("p1");
  expect(ctx.scene.entity.get("p1")!.movement.frozen).toBe(false);
  // Facing +Z, the mount's left is +X.
  expect(ctx.scene.entity.get("p1")!.position[0]).toBeCloseTo(4);
  expect(riding.dismount("p1")).toBeNull();

  riding.restore(saved);
  expect(riding.mountOf("p1")).toBe("r1");
  riding.reset();
  expect(riding.mountOf("p1")).toBeNull();
});

import { describe, expect, test } from "bun:test";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { game } from "../../game.config";
import { loop } from "../../loop";
import { content } from "../content";
import { streetPlayOf } from "../streetPlay";
import { tickTide } from "../tide/tideRuntime";

function boot() {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: "boat-test", isNew: true } });
  loop.onInit(ctx);
  loop.onNewPlayer(ctx);
  ctx.game.commands.run("game.start", {});
  return ctx;
}
type Ctx = ReturnType<typeof boot>;

/** Ride a hull in the open bay off the beach, holding keys for a while; returns the telemetry trail. */
function ride(kind: string, plan: { keys: string[]; seconds: number }[]) {
  const ctx = boot();
  tickTide(ctx);
  const at: [number, number, number] = [-280, -0.4, 160];
  const id = ctx.scene.entity.spawn(kind, { position: at, rotationY: Math.PI, role: "prop", meta: { owned: true } });
  streetPlayOf(ctx).enterVehicle(ctx, id);
  const held = new Set<string>();
  ctx.input.isDown = ((action: string) => held.has(action)) as typeof ctx.input.isDown;
  const original = ctx.input.axis.bind(ctx.input);
  ctx.input.axis = ((bindings: Record<string, { positive?: readonly string[]; negative?: readonly string[] }>) => {
    const out: Record<string, number> = {};
    for (const [name, binding] of Object.entries(bindings)) {
      const pos = (binding.positive ?? []).some((a) => held.has(a)) ? 1 : 0;
      const neg = (binding.negative ?? []).some((a) => held.has(a)) ? 1 : 0;
      out[name] = pos - neg;
    }
    return out;
  }) as unknown as typeof original;
  const trail: { speed: number; lateral: number; water: string; x: number; z: number; heading: number }[] = [];
  for (const step of plan) {
    held.clear();
    for (const key of step.keys) held.add(key);
    for (let t = 0; t < step.seconds; t += 1 / 60) {
      streetPlayOf(ctx).tick(ctx, 1 / 60);
      const body = ctx.scene.entity.get(id)!;
      trail.push({ speed: streetPlayOf(ctx).telemetry().speedMs, lateral: 0, water: streetPlayOf(ctx).telemetry().water, x: body.position[0], z: body.position[2], heading: body.rotationY });
    }
  }
  return { ctx, id, trail };
}

describe("hulls on the engine's boat model", () => {
  test("the jet-ski climbs onto the plane, carves a turn and coasts down", () => {
    const run = ride("car_sport", [{ keys: ["moveForward"], seconds: 4 }, { keys: ["moveForward", "moveRight"], seconds: 1.5 }, { keys: [], seconds: 3 }]);
    const flat = run.trail[4 * 60 - 1]!;
    expect(flat.speed).toBeGreaterThan(12);
    expect(run.trail.some((point) => point.water === "PLANING")).toBe(true);
    const turned = run.trail[Math.round(5.5 * 60) - 1]!;
    expect(Math.abs(turned.heading - flat.heading)).toBeGreaterThan(0.4);
    expect(run.trail.at(-1)!.speed).toBeLessThan(turned.speed);
  });

  test("the gondola is slow and steady: low top speed and a lazy turn", () => {
    const ski = ride("car_sport", [{ keys: ["moveForward"], seconds: 4 }]);
    const gondola = ride("car_suv", [{ keys: ["moveForward"], seconds: 4 }, { keys: ["moveForward", "moveRight"], seconds: 1.5 }]);
    const top = gondola.trail[4 * 60 - 1]!;
    expect(top.speed).toBeLessThan(ski.trail.at(-1)!.speed / 2);
    expect(top.speed).toBeGreaterThan(2);
    expect(gondola.trail.some((point) => point.water === "PLANING")).toBe(false);
  });
});

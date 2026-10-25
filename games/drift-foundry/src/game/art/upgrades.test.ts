import { expect, test } from "bun:test";
import { createBodyBind, type BodySnapshot } from "@jgengine/core/scene/bodyBind";
import { PARTS } from "../parts/catalog";
import { createRunSession } from "../run/session";
import { upgradeBodies, UPGRADE_KINDS } from "./upgrades";

test("every real pickup has its own model kind and follows the chassis pose", () => {
  expect(new Set(Object.values(UPGRADE_KINDS)).size).toBe(PARTS.length);
  const session = createRunSession();
  for (const part of PARTS) {
    const snapshot = session.snapshot();
    const bodies = upgradeBodies("racer", { ...snapshot, installed: { ...snapshot.installed, [part.slot]: part }, pose: { ...snapshot.pose, position: [7, 2, 31], heading: 1.25 } });
    expect(bodies).toHaveLength(1);
    expect(bodies[0]!.kind).toBe(UPGRADE_KINDS[part.id]);
    expect(bodies[0]!.position).toEqual([7, 2, 31]);
    expect(bodies[0]!.rotationY).toBe(1.25);
  }
});

test("real installs replace the spawned model identity and restart removes all weldments", () => {
  const visible = new Map<string, BodySnapshot>();
  const removed: string[] = [];
  const binding = createBodyBind({
    has: id => visible.has(id),
    spawn: (kind, options) => { visible.set(options.id, { kind, ...options }); return options.id; },
    despawn: id => { removed.push(id); return visible.delete(id); },
    setPose: (id, pose) => { const body = visible.get(id); if (!body) return false; visible.set(id, { ...body, ...pose }); return true; },
    update: () => true,
  });
  const session = createRunSession();
  binding.sync(upgradeBodies("racer", session.snapshot()));
  expect(visible.size).toBe(0);
  session.start();
  const seen = new Set<string>();
  let maximumVisible = 0;
  for (let i = 0; i < 350; i++) {
    session.tick(1 / 30, { throttle: 1, brake: 0, steer: 0 }, { jumpPressed: false, plowBracing: false, salvageSwap: true });
    const bodies = upgradeBodies("racer", session.snapshot());
    binding.sync(bodies, 1 / 30);
    for (const body of bodies) seen.add(body.kind);
    maximumVisible = Math.max(maximumVisible, visible.size);
  }
  expect(seen.has(UPGRADE_KINDS.salvage_v6)).toBe(true);
  expect(maximumVisible).toBeLessThanOrEqual(4);
  expect(seen.has(UPGRADE_KINDS.truck_engine)).toBe(true);
  expect(removed).toContain("racer:upgrade:salvage_v6");
  expect(visible.has("racer:upgrade:salvage_v6")).toBe(false);
  session.restart();
  binding.sync(upgradeBodies("racer", session.snapshot()));
  expect(visible.size).toBe(0);
  expect(binding.boundIds().size).toBe(0);
});

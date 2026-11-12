import { describe, expect, test } from "bun:test";
import { teleportPlayer } from "@jgengine/core/movement/teleport";
import { createHeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { game } from "../game.config";
import { onInit, onNewPlayer, onTick } from "../loop";
import { stageRun } from "./capture";
import { runSessionStore } from "./run/session";
import { ROW_SIX_TRACK } from "./tracks/catalog";

const runner = () => createHeadlessRunner({ definition: game.game, content: undefined, loop: { onInit, onNewPlayer, onTick }, maxStepSeconds: 1 });

describe("teleport in a run (#3095)", () => {
  test("puts the kart the session drives where it was asked, and the run carries on from there", () => {
    const live = runner();
    stageRun(live.ctx, "midrun");
    live.step(0.1, { held: [] });
    const session = runSessionStore.peek(live.ctx)!;
    const before = session.snapshot().run;
    expect(before).toBeGreaterThan(40);

    // Ahead of the crusher, off the line the kart was on.
    const to = ROW_SIX_TRACK.point("main", before + 20, 2);
    const moved = teleportPlayer(live.ctx, live.userId, { x: to.x, z: to.z, yaw: ROW_SIX_TRACK.spawn.heading });
    expect(moved).toEqual({ ok: true, entity: live.userId });

    live.step(0.1, { held: [] });
    const kart = live.ctx.scene.entity.get(live.userId)!;
    expect(Math.hypot(kart.position[0] - to.x, kart.position[2] - to.z)).toBeLessThan(0.5);
    expect(session.snapshot().pose.position[2]).toBeCloseTo(kart.position[2], 6);
    expect(session.snapshot().run).toBeGreaterThan(before + 19);
    expect(session.snapshot().phase).toBe("running");
  });
});

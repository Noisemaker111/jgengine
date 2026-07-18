import { beforeAll, describe, expect, test } from "bun:test";

import { defineGameDefinition as defineEngineGame } from "@jgengine/core/game/defineGame";
import { createHostedWorldSession, type HostedWorldSession } from "@jgengine/core/runtime/hostedWorldSession";

import { game } from "../../game.config";
import { classEntityId } from "../model";
import { isMobInstance, mobCount, onMobDied } from "../ai/mobs";
import { heroOf } from "./hero";

const ALICE_CLASS = "warrior";
const BOB_CLASS = "mage";

// `game.game` (the core GameDefinition) carries no `loop` — the shell's `defineGame` strips it
// off into the top-level `game.loop` for the shell's own driver. A host runner needs the real
// loop wired in to register commands and tick movement, so the test supplies it explicitly by
// re-running `defineGame`. (Isolation is automatic per #632: `createGameContext` mints a fresh
// per-context `EntityStore`, and claudecraft's runtime Maps (heroes, mobs, pets, auras, ...) are
// keyed off `ctx` via `perContext`, so worlds no longer collide over shared module state.)
const hostDefinition = defineEngineGame({ ...game.game, loop: game.loop });

describe("claudecraft host-authoritative multiplayer", () => {
  let session: HostedWorldSession;

  beforeAll(() => {
    session = createHostedWorldSession({ definition: hostDefinition, content: game.content });
    session.join("alice", true);
    session.join("bob", true);
  });

  test("class.select attributes each command to the right connected player", () => {
    const aliceResult = session.command("alice", "class.select", { classId: ALICE_CLASS });
    const bobResult = session.command("bob", "class.select", { classId: BOB_CLASS });
    expect(aliceResult.status).toBe("applied");
    expect(bobResult.status).toBe("applied");

    const ctx = session.runner().context();
    expect(heroOf(ctx, "alice")?.classId).toBe(ALICE_CLASS);
    expect(heroOf(ctx, "bob")?.classId).toBe(BOB_CLASS);

    expect(ctx.scene.entity.get("alice")?.name).toBe(classEntityId(ALICE_CLASS));
    expect(ctx.scene.entity.get("bob")?.name).toBe(classEntityId(BOB_CLASS));
  });

  test("per-player movement only advances the player holding input", () => {
    const ctx = session.runner().context();
    const aliceStartZ = ctx.scene.entity.get("alice")!.position[2];
    const bobStartZ = ctx.scene.entity.get("bob")!.position[2];

    ctx.game.players!.setInput("alice", { held: ["moveForward"], pointer: null });

    for (let i = 0; i < 30; i++) session.tick(1 / 30);

    const aliceEndZ = ctx.scene.entity.get("alice")!.position[2];
    const bobEndZ = ctx.scene.entity.get("bob")!.position[2];

    expect(aliceEndZ).toBeGreaterThan(aliceStartZ);
    expect(bobEndZ).toBeCloseTo(bobStartZ);
  });
});

describe("per-world runtime state isolation (#632)", () => {
  test("two hosted worlds keep hero and mob runtime state independent, even with the same userId", () => {
    const worldA = createHostedWorldSession({ definition: hostDefinition, content: game.content });
    const worldB = createHostedWorldSession({ definition: hostDefinition, content: game.content });
    worldA.join("alice", true);
    worldB.join("alice", true);

    worldA.command("alice", "class.select", { classId: "warrior" });
    worldB.command("alice", "class.select", { classId: "mage" });

    const ctxA = worldA.runner().context();
    const ctxB = worldB.runner().context();

    expect(heroOf(ctxA, "alice")?.classId).toBe("warrior");
    expect(heroOf(ctxB, "alice")?.classId).toBe("mage");

    expect(mobCount(ctxA)).toBeGreaterThan(0);
    expect(mobCount(ctxA)).toBe(mobCount(ctxB));

    // World spawns are seeded deterministically, so the same instanceId exists in both rosters —
    // the isolation proof is that killing it in world A never touches world B's copy.
    const mobId = ctxA.scene.entity.list().find((entity) => isMobInstance(ctxA, entity.id))!.id;
    expect(isMobInstance(ctxB, mobId)).toBe(true);

    onMobDied(ctxA, mobId);

    expect(isMobInstance(ctxA, mobId)).toBe(false);
    expect(isMobInstance(ctxB, mobId)).toBe(true);
    expect(mobCount(ctxA)).toBe(mobCount(ctxB) - 1);
  });
});

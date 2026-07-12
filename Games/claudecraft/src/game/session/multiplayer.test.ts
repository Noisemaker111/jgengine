import { beforeAll, describe, expect, test } from "bun:test";

import { defineGame as defineEngineGame } from "@jgengine/core/game/defineGame";
import { createHostedWorldSession, type HostedWorldSession } from "@jgengine/core/runtime/hostedWorldSession";

import { game } from "../../game.config";
import { classEntityId } from "../model";
import { heroOf } from "./hero";

const ALICE_CLASS = "warrior";
const BOB_CLASS = "mage";

// `game.game` (the core GameDefinition) carries no `loop` — the shell's `defineGame` strips it
// off into the top-level `game.loop` for the shell's own driver. A host runner needs the real
// loop wired in to register commands and tick movement, so the test supplies it explicitly.
//
// `defineGame` also bakes a single, module-scoped `EntityStore` into `game.game.scene` at import
// time, so every `createGameContext`/`createHostedWorldSession` built straight from the shared
// `game` export collides with any other live world built from it in the same process (e.g.
// `gameplay.test.ts`'s `beforeAll` ctx) — both try to spawn the same fixed-id NPCs into the same
// store. Re-running `defineGame` here mints a fresh, independent `EntityStore` for this file's
// own hosted session, matching how `hostedWorldSession.test.ts` builds a fresh definition per
// session instead of reusing one.
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

    expect(heroOf("alice")?.classId).toBe(ALICE_CLASS);
    expect(heroOf("bob")?.classId).toBe(BOB_CLASS);

    const ctx = session.runner().context();
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

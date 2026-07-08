import { describe, expect, test } from "bun:test";

import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { browseSessions, quickMatch } from "@jgengine/core/multiplayer/matchmaking";

import { DEMO_WORLD_LISTINGS, socialHubGame, stageSocialHub } from "./socialHubDemo";

const ME = "user_local";

function makeStagedContext() {
  const ctx = createGameContext({
    definition: socialHubGame.game,
    content: socialHubGame.content,
    player: { userId: ME, isNew: true },
  });
  socialHubGame.loop.onInit?.(ctx);
  socialHubGame.loop.onNewPlayer?.(ctx);
  return ctx;
}

describe("socialHubDemo staging", () => {
  const ctx = makeStagedContext();

  test("friends, pending request, and party are staged for the local player", () => {
    expect(ctx.game.social.friends.list(ME).map((friend) => friend.userId).sort()).toEqual([
      "kira",
      "rin",
    ]);
    expect(ctx.game.social.friends.requestsFor(ME).map((request) => request.fromUserId)).toEqual([
      "nova",
    ]);
    expect(ctx.game.social.party.membersOf(ME).sort()).toEqual([ME, "kira", "rin"].sort());
  });

  test("a world invite with a join target is waiting", () => {
    const invites = ctx.game.social.worldInvites.listFor(ME);
    expect(invites).toHaveLength(1);
    const accepted = ctx.game.social.worldInvites.accept(ME, invites[0]!.id);
    expect(accepted).toEqual({ target: { serverId: "srv_mesa", joinCode: "MESA42" } });
  });

  test("every built-in chat channel has staged history visible to the local player", () => {
    expect(ctx.game.chat.history("global", { viewerUserId: ME })).toHaveLength(2);
    expect(ctx.game.chat.history("party", { viewerUserId: ME })).toHaveLength(1);
    expect(ctx.game.chat.history("proximity", { viewerUserId: ME })).toHaveLength(1);
  });

  test("friend heroes are spawned as player-role entities so proximity chat and emotes resolve", () => {
    expect(ctx.scene.entity.get("rin")?.role).toBe("player");
    expect(ctx.scene.entity.get("kira")?.role).toBe("player");
    const emote = ctx.game.social.emotes.play(ME, "wave");
    expect("recipients" in emote && [...emote.recipients].sort()).toEqual(["kira", "rin"]);
  });

  test("the demo world listings drive browse and quick match", () => {
    expect(browseSessions(DEMO_WORLD_LISTINGS).map((listing) => listing.serverId)).toEqual([
      "srv_full",
      "srv_reef",
      "srv_mesa",
    ]);
    expect(quickMatch(DEMO_WORLD_LISTINGS, { mode: "coop" })?.serverId).toBe("srv_reef");
  });
});

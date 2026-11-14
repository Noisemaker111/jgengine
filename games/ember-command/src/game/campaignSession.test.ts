import { beforeEach, describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";

import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { CAMPAIGN, campaignReadout, campaignSession, campaignStore, campaignStores, startCampaignMission } from "./campaign";
import { content } from "./content";
import { resetSession } from "./session";

function boot() {
  resetSession();
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "ember-session-test", assets: createAssetCatalog(), multiplayer: "off", persist: false }),
    content,
    player: { userId: "ember-session", isNew: true },
  });
  return ctx;
}

/** A campaign mission is a session: the field desk opens it, it carries the pay it will bank, it settles. */
describe("Lawn Order mission session", () => {
  beforeEach(() => resetSession());

  test("starting a mission opens a session carrying its authored pay", () => {
    const ctx = boot();
    const loop = campaignSession(ctx);
    expect(loop.kind()).toBe("mission");
    expect(loop.phase()).toBe("idle");
    expect(startCampaignMission(ctx)).toBe(true);
    expect(loop.phase()).toBe("open");
    expect(loop.snapshot()).toMatchObject({ session: 1, closed: 0 });
    // The carried quantity is the yard's pay for this mission, in sugar plus leaf.
    expect(loop.carried()).toBeGreaterThan(0);
    expect(campaignReadout(ctx)?.phase).toBe("live");
  });

  test("a cleared mission settles its pay into the yard's stores once", () => {
    const ctx = boot();
    const loop = campaignSession(ctx);
    startCampaignMission(ctx);
    const step = CAMPAIGN[0]!;
    const before = campaignStores(campaignStore.read(ctx));
    const settlement = loop.settle({ won: true, missionId: step.mission.id, rewards: step.mission.rewards });
    expect(settlement.result.banked).toBe(true);
    expect(loop.snapshot()).toMatchObject({ session: 1, closed: 1, carried: 0 });
    const after = campaignStores(campaignStore.read(ctx));
    expect(after.sugar + after.leaf).toBeGreaterThan(before.sugar + before.leaf);
    // The same boundary cannot pay twice for the same mission.
    expect(() => loop.settle({ won: true, missionId: step.mission.id, rewards: step.mission.rewards })).toThrow();
    const settled = campaignStores(campaignStore.read(ctx));
    expect(settled.sugar + settled.leaf).toBe(after.sugar + after.leaf);
  });

  test("a failed mission closes the session and banks nothing", () => {
    const ctx = boot();
    const loop = campaignSession(ctx);
    startCampaignMission(ctx);
    const before = campaignStores(campaignStore.read(ctx));
    const settlement = loop.settle({ won: false, missionId: CAMPAIGN[0]!.mission.id, rewards: null });
    expect(settlement.result.banked).toBe(false);
    expect(loop.phase()).toBe("closed");
    expect(campaignStores(campaignStore.read(ctx))).toEqual(before);
  });
});

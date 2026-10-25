import { beforeEach, describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createHeadlessRunner, type HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { content } from "../content";
import { CREEP_CATALOG } from "../entities/enemies/catalog";
import { resetSession, session } from "../session";
import { setupWorld } from "../world/setup";
import { keep } from "../keep";
import { BOUNTY_RULE, bountyReadout, bountyScale, killBounty } from "./bounty";
import { carriedRelic, chooseRelic, drawRelics, freshLegacy, legacy, writeLegacy, type LegacyState } from "./legacy";

let runner: HeadlessRunner;
const gold = () => keep.of(runner.ctx).num("keep.gold");
beforeEach(() => {
  resetSession();
  runner = createHeadlessRunner({
    definition: defineGameDefinition({ name: "Beacon bounty", multiplayer: "off" }),
    content,
    loop: { onInit: setupWorld, onNewPlayer() {} },
  });
});

describe("kill pay scales with the unit's weight and the wave", () => {
  test("wave 1 pays the authored weight and every later wave pays more", () => {
    expect(killBounty("raider_scout", 1)).toBe(CREEP_CATALOG.raider_scout!.bounty);
    expect(killBounty("raider_scout", 5)).toBeGreaterThan(killBounty("raider_scout", 1));
    expect(killBounty("raider_scout", 9)).toBeGreaterThan(killBounty("raider_scout", 5));
  });

  test("the curve is authored data, not a magic number per unit", () => {
    expect(bountyScale(1)).toBe(1);
    expect(bountyScale(1 + 1 / BOUNTY_RULE.perWave)).toBeCloseTo(2, 5);
    expect(bountyScale(999)).toBe(BOUNTY_RULE.maxScale);
  });

  test("a heavier raider still pays more than a light one on the same wave", () => {
    for (const wave of [1, 4, 8, 12]) {
      expect(killBounty("raider_brute", wave)).toBeGreaterThan(killBounty("raider_scout", wave));
      expect(killBounty("raider_warlord", wave)).toBeGreaterThan(killBounty("raider_brute", wave));
    }
  });

  test("a relic's bounty bonus multiplies the same way", () => {
    expect(killBounty("raider_scout", 5, 1.4)).toBe(Math.round(killBounty("raider_scout", 5) * 1.4));
  });

  test("a late wave's kill is visibly worth more, and the readout says so", () => {
    const readout = bountyReadout(8, 240);
    expect(readout.scale).toBeGreaterThan(1);
    expect(readout.closing).toBeGreaterThan(readout.opening);
    expect(readout.opening).toBe(CREEP_CATALOG.raider_scout!.bounty);
    expect(readout.earned).toBe(240);
  });
});

describe("the bounty on the live field", () => {
  test("a kill on a late wave pays more than the same kill on wave 1", () => {
    const opening = gold();
    runner.ctx.game.events.emit("entity.died", {
      instanceId: "scout-opening",
      catalogId: "raider_scout",
      reason: { kind: "environment", source: "test" },
      position: [0, 0, 0],
    });
    const firstPay = gold() - opening;
    expect(firstPay).toBe(4);
    expect(keep.of(runner.ctx).num("keep.bounty_earned")).toBe(firstPay);

    for (let wave = 0; wave < 5; wave += 1) {
      session.encounter.openWave();
      session.encounter.completeWave();
    }
    expect(session.encounter.view().wave).toBe(6);
    const later = gold();
    runner.ctx.game.events.emit("entity.died", {
      instanceId: "scout-late",
      catalogId: "raider_scout",
      reason: { kind: "environment", source: "test" },
      position: [0, 0, 0],
    });
    const latePay = gold() - later;
    expect(latePay).toBeGreaterThan(firstPay);
    expect(latePay).toBe(killBounty("raider_scout", 6));
    expect(keep.of(runner.ctx).num("keep.bounty_earned")).toBe(firstPay + latePay);
  });

  test("a carried relic raises the pay without changing the wave curve", () => {
    writeLegacy(runner.ctx, carrying("writ"));
    const before = gold();
    runner.ctx.game.events.emit("entity.died", {
      instanceId: "scout-writ",
      catalogId: "raider_scout",
      reason: { kind: "environment", source: "test" },
      position: [0, 0, 0],
    });
    expect(gold() - before).toBe(Math.round(4 * 1.4));
  });
});

describe("the seeded relic offer", () => {
  test("the same seed offers the same three relics", () => {
    const first = drawRelics("beacon:bounty");
    expect(first).toHaveLength(3);
    expect(new Set(first).size).toBe(3);
    expect(drawRelics("beacon:bounty")).toEqual(first);
  });

  test("the next run's offer is drawn, not remembered", () => {
    const seeds = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const offers = seeds.map((seed) => drawRelics(seed).join(","));
    expect(new Set(offers).size).toBeGreaterThan(1);
  });

  test("a relic can only be taken from the current offer", () => {
    writeLegacy(runner.ctx, { ...freshLegacy(), offer: drawRelics("beacon:pick") });
    const offered = legacy.read(runner.ctx).offer;
    expect(chooseRelic(runner.ctx, offered[0]!)).toBe(true);
    expect(carriedRelic(legacy.read(runner.ctx))?.id).toBe(offered[0]!);
    expect(legacy.read(runner.ctx).offer).toHaveLength(0);
    expect(chooseRelic(runner.ctx, "not-a-relic")).toBe(false);
    expect(carriedRelic(legacy.read(runner.ctx))?.id).toBe(offered[0]!);
  });
});

/** The keep as a loaded document would leave it: one relic carried, nothing at risk. */
function carrying(id: string | null): LegacyState {
  const fresh = freshLegacy();
  return { ...fresh, run: { ...fresh.run, run: 1, changeId: id } };
}

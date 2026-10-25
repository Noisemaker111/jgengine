import { beforeEach, describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createHeadlessRunner, type HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { content } from "../content";
import { STARTING_GOLD, STARTING_LIVES } from "../entities/base/catalog";
import { resetSession, session } from "../session";
import { setupWorld } from "../world/setup";
import { keep } from "../keep";
import {
  BANK_RULE,
  BOONS,
  RELIC_TABLE,
  carriedRelic,
  chooseRelic,
  drawRelics,
  finishRun,
  freshLegacy,
  legacy,
  openingGold,
  openingLives,
  relicBountyScale,
  startDefense,
  upgradeLegacy,
  writeLegacy,
  type LegacyState,
} from "./legacy";

let runner: HeadlessRunner;
const gold = () => keep.of(runner.ctx).num("keep.gold");

beforeEach(() => {
  resetSession();
  runner = createHeadlessRunner({
    definition: defineGameDefinition({ name: "Beacon legacy", multiplayer: "off" }),
    content,
    loop: { onInit: setupWorld, onNewPlayer() {} },
  });
});

/** A keep carrying one relic, written the way a loaded document would set it. */
function carrying(id: string | null): LegacyState {
  const fresh = freshLegacy();
  return { ...fresh, run: { ...fresh.run, changeId: id } };
}

/** Reach wave `wave` and finish the defense there, the way the keep's death or a victory does. */
function finishAt(wave: number, purse: number): void {
  resetSession();
  for (let index = 1; index < wave; index += 1) {
    session.encounter.openWave();
    session.encounter.completeWave();
  }
  keep.of(runner.ctx).set("keep.gold", purse);
  keep.of(runner.ctx).set("keep.banked", false);
  finishRun(runner.ctx);
}

describe("what a finished defense banks", () => {
  test("the engine loop banks half the purse and the keep adds the waves it held", () => {
    finishAt(7, 120);
    const banked = legacy.read(runner.ctx);
    expect(banked.bankedGold).toBe(60);
    expect(banked.standing).toBe(7);
    expect(banked.run.completed).toBe(1);
    expect(banked.run.bankedTotal).toBe(60);
    expect(banked.offer).toHaveLength(BANK_RULE.offerCount);
  });

  test("the vault caps the bank and standing stacks across runs", () => {
    finishAt(6, 9999);
    expect(legacy.read(runner.ctx).bankedGold).toBe(BANK_RULE.cap);
    startDefense(runner.ctx);
    finishAt(4, 10);
    const second = legacy.read(runner.ctx);
    expect(second.standing).toBe(10);
    expect(second.run.completed).toBe(2);
    expect(second.bankedGold).toBe(5);
  });

  test("the same finished run offers the same relics, and another run offers another draw", () => {
    finishAt(5, 40);
    const first = legacy.read(runner.ctx).offer;
    writeLegacy(runner.ctx, freshLegacy());
    startDefense(runner.ctx);
    finishAt(5, 40);
    expect(legacy.read(runner.ctx).offer).toEqual(first);
    startDefense(runner.ctx);
    finishAt(5, 60);
    expect(legacy.read(runner.ctx).offer).not.toEqual(first);
  });
});

describe("the relic the next defense carries", () => {
  test("the offer is three distinct relics from the engine's seeded draft", () => {
    const first = drawRelics("beacon:test");
    expect(first).toHaveLength(BANK_RULE.offerCount);
    expect(new Set(first).size).toBe(BANK_RULE.offerCount);
    expect(drawRelics("beacon:test")).toEqual(first);
    expect(new Set(["a", "b", "c", "d", "e"].map((seed) => drawRelics(seed).join(","))).size).toBeGreaterThan(1);
  });

  test("carrying a relic needs it to be one of the offered three", () => {
    writeLegacy(runner.ctx, { ...freshLegacy(), offer: drawRelics("pick") });
    const offered = legacy.read(runner.ctx).offer;
    expect(chooseRelic(runner.ctx, offered[1]!)).toBe(true);
    expect(carriedRelic(legacy.read(runner.ctx))?.id).toBe(offered[1]!);
    expect(legacy.read(runner.ctx).offer).toHaveLength(0);

    const unoffered = BOONS.find((boon) => !offered.includes(boon.id))!;
    writeLegacy(runner.ctx, { ...freshLegacy(), offer: drawRelics("pick") });
    expect(chooseRelic(runner.ctx, unoffered.id)).toBe(false);
    expect(chooseRelic(runner.ctx, null)).toBe(true);
    expect(carriedRelic(legacy.read(runner.ctx))).toBeNull();
  });

  test("opening gold is the flat purse plus the bank plus the relic", () => {
    expect(openingGold({ ...freshLegacy(), bankedGold: 120, run: { ...freshLegacy().run, changeId: "spoils" } }))
      .toBe(STARTING_GOLD + 120 + 60);
    expect(openingGold({ ...freshLegacy(), bankedGold: BANK_RULE.cap + 500 })).toBe(STARTING_GOLD + BANK_RULE.cap);
  });

  test("a life relic raises the keep above its authored twenty", () => {
    expect(openingLives({ ...freshLegacy(), run: { ...freshLegacy().run, changeId: "gate" } })).toBe(STARTING_LIVES + 5);
    expect(openingLives(freshLegacy())).toBe(STARTING_LIVES);
  });

  test("a bounty relic multiplies kill pay and nothing else", () => {
    expect(relicBountyScale({ ...freshLegacy(), run: { ...freshLegacy().run, changeId: "writ" } })).toBeCloseTo(1.4, 5);
    expect(relicBountyScale(freshLegacy())).toBe(1);
  });

  test("the whole table is authored once, with a relic per change", () => {
    expect(RELIC_TABLE).toHaveLength(BOONS.length);
    expect(RELIC_TABLE.map((relic) => relic.id)).toEqual(BOONS.map((boon) => boon.id));
    for (const relic of RELIC_TABLE) expect(relic.after).toBe(1);
  });

  test("the pick the result card takes is the relic the next defense opens with", () => {
    finishAt(8, 160);
    keep.of(runner.ctx).set("keep.fallen", true);
    const banked = legacy.read(runner.ctx);
    const pick = banked.offer[1]!;
    const effect = BOONS.find((boon) => boon.id === pick)!.effect;

    runner.ui.invoke("legacy.choose", { boon: pick });
    const opened = legacy.read(runner.ctx);
    expect(carriedRelic(opened)?.id).toBe(pick);
    expect(opened.offer).toHaveLength(0);
    expect(opened.run.run).toBe(opened.run.completed + 1);
    expect(gold()).toBe(STARTING_GOLD + banked.bankedGold + (effect.gold ?? 0));
    expect(gold()).toBe(openingGold(opened));
  });

  test("a defense restarted without a pick keeps the relic it already carried", () => {
    writeLegacy(runner.ctx, carrying("writ"));
    keep.of(runner.ctx).set("keep.fallen", true);
    runner.ui.invoke("defense.restart", {});
    expect(carriedRelic(legacy.read(runner.ctx))?.id).toBe("writ");
  });
});

describe("a stored keep", () => {
  test("the pre-loop document migrates into the engine's run state", () => {
    const migrated = upgradeLegacy({ standing: 12, runs: 3, bankedGold: 90, boonId: "gate", offer: [] });
    expect(migrated).not.toBeNull();
    expect(migrated!.run.completed).toBe(3);
    expect(migrated!.run.run).toBe(4);
    expect(migrated!.run.changeId).toBe("gate");
    expect(migrated!.standing).toBe(12);
  });

  test("an unreadable section is refused rather than half applied", () => {
    expect(upgradeLegacy({ standing: -1, runs: 0, bankedGold: 0, boonId: null, offer: [] })).toBeNull();
    expect(upgradeLegacy({ standing: 1, runs: 0 })).toBeNull();
    expect(upgradeLegacy({ ...freshLegacy(), run: { ...freshLegacy().run, run: 1, completed: 4 } })).toBeNull();
    expect(upgradeLegacy(freshLegacy())).not.toBeNull();
  });
});

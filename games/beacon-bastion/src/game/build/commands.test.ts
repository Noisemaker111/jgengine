import { beforeEach, describe, expect, test } from "bun:test";
import type { HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";
import { attachRefusalNotices } from "@jgengine/core/game/notices";

import { STARTING_GOLD } from "../entities/base/catalog";
import { TOWER_CATALOG } from "../entities/towers/catalog";
import { keep, sellValue, towerLevel } from "../keep";
import { session } from "../session";
import { advanceKeep, beaconRunner } from "../testing";
import { BUILD_PLOTS } from "../world/path";

const archer = TOWER_CATALOG.tower_archer!;
const cannon = TOWER_CATALOG.tower_cannon!;

let runner: HeadlessRunner;
const world = () => keep.of(runner.ctx);
const gold = () => world().num("keep.gold");
const plotPoint = (index: number) => BUILD_PLOTS[index]!.position;
const occupant = (index: number) => world().occupant(BUILD_PLOTS[index]!.id);

/** Pick a tower card, click a plot, put the card down, and let the build finish. */
function build(slot: 1 | 2 | 3, plotIndex: number): string {
  runner.ui.invoke(`buildTower${slot}`, {});
  runner.ui.invoke("tower.build", { point: plotPoint(plotIndex) });
  runner.ui.invoke(`buildTower${slot}`, {});
  advanceKeep(runner, 5);
  return occupant(plotIndex)!;
}

beforeEach(() => {
  runner = beaconRunner("Beacon Bastion (test)", { terrain: true });
});

describe("tower.build on plots", () => {
  test("placing raises the tower entity on the plot and charges its price", () => {
    const id = build(1, 0);
    expect(runner.ctx.scene.entity.get(id)).not.toBeNull();
    expect(towerLevel(world(), id)).toBe(1);
    expect(gold()).toBe(STARTING_GOLD - archer.cost);
  });

  test("clicking an occupied plot inspects its tower instead of rejecting", () => {
    const id = build(1, 0);
    runner.ui.invoke("buildTower2", {});
    expect(runner.ui.tryInvoke("tower.build", { point: plotPoint(0) }).status).toBe("applied");
    expect(session.inspectedTowerId).toBe(id);
    expect(gold()).toBe(STARTING_GOLD - archer.cost);
  });

  test("clicking open ground closes the inspect panel", () => {
    build(1, 0);
    runner.ui.invoke("tower.build", { point: plotPoint(0) });
    expect(session.inspectedTowerId).not.toBeNull();
    runner.ui.invoke("tower.build", { point: [500, 0, 500] });
    expect(session.inspectedTowerId).toBeNull();
  });

  test("an empty plot with nothing selected still rejects, and says why", () => {
    expect(runner.ui.tryInvoke("tower.build", { point: plotPoint(1) })).toEqual({ status: "rejected", reason: "no-tower-selected", message: "Pick a tower first" });
    expect(occupant(1)).toBeNull();
  });

  test("a tower the player cannot afford rejects and names the shortfall", () => {
    world().set("keep.gold", archer.cost - 15);
    runner.ui.invoke("buildTower1", {});
    expect(runner.ui.tryInvoke("tower.build", { point: plotPoint(1) })).toEqual({ status: "rejected", reason: "cost", message: `${archer.label} needs 15 more gold` });
    expect(occupant(1)).toBeNull();
  });
});

test("a refused build shows its message as a deny notice in the shared feed", () => {
  const detach = attachRefusalNotices(runner.ctx.game.events, runner.ctx.game.notices, { localUserId: () => runner.ctx.player.userId });
  runner.ui.tryInvoke("tower.build", { point: plotPoint(1) });
  expect(runner.ctx.game.notices.list().at(-1)).toMatchObject({ text: "Pick a tower first", tone: "deny" });
  detach();
});

describe("sellTower (keybind)", () => {
  test("refunds the sell value, despawns the tower, and frees the plot", () => {
    const id = build(2, 0);
    const before = gold();
    const refund = sellValue(world(), id, cannon.id);
    runner.ui.invoke("sellTower", { instanceId: id });
    advanceKeep(runner, 0.25);
    expect(gold()).toBe(before + refund);
    expect(refund).toBe(Math.round(cannon.cost * 0.7));
    expect(runner.ctx.scene.entity.get(id)).toBeNull();
    expect(occupant(0)).toBeNull();
  });

  test("acts on the inspected tower when no id is given", () => {
    const id = build(1, 0);
    runner.ui.invoke("tower.build", { point: plotPoint(0) });
    runner.ui.invoke("sellTower", { yaw: 0, pitch: 0 });
    advanceKeep(runner, 0.25);
    expect(world().instance(id)).toBeNull();
    expect(session.inspectedTowerId).toBeNull();
  });

  test("rejects when nothing is inspected", () => {
    expect(runner.ui.tryInvoke("sellTower", {})).toEqual({ status: "rejected", reason: "no-tower" });
  });

  test("a freed plot accepts a new tower", () => {
    const first = build(1, 0);
    runner.ui.invoke("sellTower", { instanceId: first });
    const second = build(3, 0);
    expect(second).not.toBe(first);
    expect(world().instance(second)?.kind).toBe("tower_frost");
  });
});

describe("upgradeTower (keybind)", () => {
  test("charges the declared upgrade cost and raises the level", () => {
    const id = build(1, 0);
    const before = gold();
    runner.ui.invoke("upgradeTower", { instanceId: id });
    expect(towerLevel(world(), id)).toBe(2);
    expect(gold()).toBe(before - Math.round(archer.cost * 0.75));
  });

  test("rejects without enough gold, at the fork, and once mastered", () => {
    const id = build(2, 0);
    expect(runner.ui.tryInvoke("upgradeTower", { instanceId: id })).toMatchObject({ status: "rejected", reason: "cost", message: expect.stringMatching(/^Rank II needs \d+ more gold$/) });
    world().set("keep.gold", 10_000);
    runner.ui.invoke("upgradeTower", { instanceId: id });
    runner.ui.invoke("upgradeTower", { instanceId: id });
    expect(towerLevel(world(), id)).toBe(3);
    // The key never picks a path for the player.
    expect(runner.ui.tryInvoke("upgradeTower", { instanceId: id })).toMatchObject({ status: "rejected", reason: "choose-branch" });
    runner.ui.invoke("beacon.act", { action: "tower_cannon:mortar:1", target: id });
    runner.ui.invoke("upgradeTower", { instanceId: id });
    expect(towerLevel(world(), id)).toBe(5);
    expect(world().num(`${id}.stun_ms`)).toBe(500);
    expect(runner.ui.tryInvoke("upgradeTower", { instanceId: id })).toMatchObject({ status: "rejected", reason: "max-level" });
  });

  test("the aim key walks first, last, strongest, nearest and round again", () => {
    const id = build(1, 0);
    const aims: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      runner.ui.invoke("cycleAim", { instanceId: id });
      aims.push(String(world().fact(`${id}.aim`)));
    }
    expect(aims).toEqual(["last", "strongest", "nearest", "first"]);
  });

  test("selling an upgraded tower refunds a share of its build and its upgrade", () => {
    const id = build(1, 0);
    runner.ui.invoke("upgradeTower", { instanceId: id });
    const before = gold();
    runner.ui.invoke("sellTower", { instanceId: id });
    expect(gold()).toBe(before + Math.round((archer.cost + Math.round(archer.cost * 0.75)) * 0.7));
  });
});

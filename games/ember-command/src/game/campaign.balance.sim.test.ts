import { expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createHeadlessRunner } from "@jgengine/core/runtime/headlessRunner";
import { missionMarkers } from "@jgengine/core/mission/triggers";
import { physics } from "../world";
import { editorLayers } from "../editorLayers";
import * as liveLayers from "../editorLayers";
import { content } from "./content";
import { onInit } from "../loop";
import { CAMPAIGN, campaignRuntime, campaignStore } from "./campaign";
import { livingUnits, reservedSupply, resetSession, session, usedSupply } from "./session";
import { systems } from "./systems";
import { bindScene } from "../editorLayers";
import { rebindWorld } from "../world";
import * as worldModule from "../world";
import { sceneSet, type MapId } from "../maps";
import { rebindYard } from "./yardInstance";

/** Put the headless game on a lawn, as the shell does when the scene set switches. */
function onLawn(id: MapId): void {
  sceneSet.select(id);
  bindScene(id);
  rebindWorld();
  rebindYard();
}

const markers = missionMarkers(editorLayers);
const markers6 = () => missionMarkers(liveLayers.editorLayers);
const STORES = [{ sugar: 0, leaf: 0 }, { sugar: 120, leaf: 40 }, { sugar: 320, leaf: 120 }, { sugar: 480, leaf: 180 }, { sugar: 720, leaf: 280 }, { sugar: 1120, leaf: 430 }];
type Ctx = ReturnType<typeof createHeadlessRunner>["ctx"];

/** A mid-skill player: keeps foragers busy on both resources, digs two barracks and gardens as the brood fills, hatches steadily, defends the nest. */
function economy(ctx: Ctx, tick: number): void {
  if (tick % 30 !== 0) return;
  const ids = (id: string) => livingUnits("player", "unit").filter((u) => u.catalogId === id).map((u) => u.id);
  const sugar = ctx.game.economy.balance(ctx.player.userId, "sugar");
  const leaf = ctx.game.economy.balance(ctx.player.userId, "leaf");
  const barracks = livingUnits("player", "building").filter((u) => u.catalogId === "barracks").length + session.buildQueue.jobs.filter((j) => j.spec.type === "barracks").length;
  const gardens = session.buildQueue.jobs.filter((j) => j.spec.type === "fungus_garden").length;
  if (barracks < 2 && sugar >= 140 && leaf >= 60) {
    ctx.game.commands.run("build.arm", { type: "barracks" });
    ctx.game.commands.run("unit.order", { selection: [], point: [9 - barracks * 18, 0, 31] });
    ctx.game.commands.run("unit.cancel", {});
  } else if (usedSupply() + reservedSupply() + 4 > session.supplyCap && gardens === 0 && sugar >= 60 && leaf >= 30) {
    ctx.game.commands.run("build.arm", { type: "fungus_garden" });
    ctx.game.commands.run("unit.order", { selection: [], point: [-14 + (session.supplyCap % 32), 0, 43] });
    ctx.game.commands.run("unit.cancel", {});
  } else {
    if (ids("worker").length < 7) ctx.game.commands.run("train.worker", {});
    ctx.game.commands.run(tick % 60 === 0 ? "train.soldier" : "train.spitter", {});
  }
  const workers = ids("worker");
  const leafers = workers.filter((id) => { const c = session.units.get(id)?.command; return c?.kind === "gather" && c.resource === "leaf"; }).length;
  for (const id of workers) {
    if (session.units.get(id)?.command.kind === "gather") continue;
    ctx.game.commands.run("unit.order", { selection: [id], point: leafers < workers.length / 2 ? [-22, 0, 26] : [-15, 0, 30] });
  }
}

const fighters = () => livingUnits("player", "unit").filter((u) => u.catalogId !== "worker").map((u) => u.id);
function attack(ctx: Ctx, x: number, z: number): void {
  ctx.game.commands.run("unit.attackMove", {});
  ctx.game.commands.run("unit.order", { selection: fighters(), point: [x, 0, z] });
}

function run(index: number, plan: (ctx: Ctx, tick: number) => void, seconds: number): string {
  resetSession();
  onLawn(CAMPAIGN[index]!.map);
  const definition = defineGameDefinition({ name: "bal", multiplayer: "off", world: worldModule.world, physics, systems, loop: { onInit, onNewPlayer() {} } });
  const runner = createHeadlessRunner({ definition, content, loop: definition.loop! });
  const ctx = runner.ctx;
  campaignStore.write(ctx, { won: CAMPAIGN.slice(0, index).map((s) => s.mission.id), mode: "campaign", stores: STORES[index]! });
  ctx.game.commands.run("match.start", {});
  const id = CAMPAIGN[index]!.mission.id;
  const lost: Record<string, number> = {};
  ctx.game.events.on("entity.died", (e) => { const d = livingUnits("player", "unit").length; void d; lost[e.catalogId] = (lost[e.catalogId] ?? 0) + 1; });
  let elapsed = 0;
  for (let t = 0; t < seconds; t += 0.1) {
    const tick = Math.round(t * 10);
    economy(ctx, tick);
    plan(ctx, tick);
    runner.step(0.1);
    elapsed = t;
    const view = campaignRuntime(ctx).view();
    if (view?.missionId !== id || view?.status !== "active") break;
  }
  const view = campaignRuntime(ctx).view();
  const red = ["worker", "soldier", "spitter", "scout", "beetle", "hero"].reduce((n, k) => n + (lost[k] ?? 0), 0);
  const black = ["raider", "major", "wasp"].reduce((n, k) => n + (lost[k] ?? 0), 0);
  return `M${index + 1} ${CAMPAIGN[index]!.mission.title}: ${view?.status}${view?.outcome ? ` (${view.outcome})` : ""} in ${Math.round(elapsed)}s — red lost ${red}${lost["hero"] ? " incl. Marshal" : ""}, black lost ${black}`;
}

/**
 * Campaign balance, played headless: a mid-skill script (two barracks, gardens as the brood fills, a
 * steady hatch, foragers on both resources, the obvious plan per mission) must win all six missions,
 * and the finale must still cost it real losses.
 */
test("a mid-skill colony wins all six missions", () => {
  const out: string[] = [];
  out.push(run(0, (ctx, tick) => {
    if (tick % 50 === 0 && campaignRuntime(ctx).view()?.objectiveId === "march_muster") {
      ctx.game.commands.run("unit.order", { selection: ["hero", ...fighters()], point: [markers["campaign_popsicle"]!.x, 0, markers["campaign_popsicle"]!.z] });
    }
  }, 600));
  out.push(run(1, (ctx, tick) => {
    if (tick === 400) attack(ctx, 10, 9);
    if (tick > 600 && tick % 50 === 0) attack(ctx, markers["campaign_far_bank"]!.x, markers["campaign_far_bank"]!.z);
  }, 300));
  out.push(run(2, (ctx, tick) => { if (tick % 100 === 0) attack(ctx, 0, 27); }, 260));
  out.push(run(3, (ctx, tick) => {
    if (tick < 700 && tick % 100 === 0) attack(ctx, 0, 27);
    if (tick >= 700 && tick % 50 === 0) attack(ctx, markers["campaign_brood_raid"]!.x, markers["campaign_brood_raid"]!.z);
    if (tick >= 900 && tick % 50 === 0) attack(ctx, -16, -27);
  }, 480));
  out.push(run(4, (ctx, tick) => {
    if (tick < 650 && tick % 50 === 0) ctx.game.commands.run("unit.order", { selection: fighters(), point: [3, 0, 29] });
    if (tick >= 650 && tick < 1300 && tick % 100 === 0) attack(ctx, 0, 27);
    if (tick >= 1300 && tick % 50 === 0) attack(ctx, 0, -36);
  }, 600));
  // The front yard: cross the driveway on the cracks, dig the wasps out of the mailbox, then the nest.
  out.push(run(5, (ctx, tick) => {
    if (tick >= 500 && tick < 900 && tick % 50 === 0) attack(ctx, markers6()["campaign_far_bank"]!.x, markers6()["campaign_far_bank"]!.z);
    if (tick >= 900 && campaignRuntime(ctx).view()?.objectiveId === "clear_mailbox" && tick % 50 === 0) attack(ctx, 32, 33);
    if (tick >= 900 && campaignRuntime(ctx).view()?.objectiveId === "raze_far_nest" && tick % 50 === 0) attack(ctx, 28, -34);
  }, 700));
  onLawn("backyard");
  // Every mission falls to a mid-skill script, and none of them for free.
  console.log(out.join("\n"));
  for (const line of out) expect(line).toContain(": completed");
  expect(out.join("\n")).toMatch(/M5 [^\n]*red lost (1\d|[2-9]\d)/);
}, 600_000);

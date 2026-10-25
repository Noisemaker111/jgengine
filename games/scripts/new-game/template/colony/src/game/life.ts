import { gamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { pursue } from "@jgengine/core/scene/behaviors";
import { defineSystem } from "@jgengine/shell/gameKit";

import { editorLayers } from "../editorLayers";
import { arrive, colonistKinds, crew, isRaider, NODES, tickCrew } from "./crew";
import { tool } from "./hooks";
import { idea } from "./idea";
import { colonyGrid, hqCell, raidCamps } from "./places";
import { colony, fact } from "./spec";

const CAMPS = raidCamps(editorLayers);
const [food] = idea.resources;

/** Countdowns kept to the frame; the world keeps them to the second so the HUD and a save see them. */
const clock = perContext((_ctx: GameContext) => ({ raid: -1, arrival: idea.arrive, hunger: 3, think: 0, serial: 0, seeded: false }));

/** A fresh colony gets its headquarters, its first colonists and its gathering nodes; a loaded one is made whole. */
export function found(ctx: GameContext): void {
  const world = colony.of(ctx);
  if (world.instances("hq").length === 0) world.place("hq", { cell: hqCell(colonyGrid(editorLayers), idea.hq.size) }, { free: true });
  for (const node of NODES) {
    if (ctx.scene.entity.get(node.id) !== null) continue;
    ctx.scene.entity.spawn(node.node, { id: node.id, position: [node.x, ctx.world.groundHeightAt(node.x, node.z), node.z], role: "npc" });
  }
  // Colonists are not saved as bodies: the first frame of a run (new or loaded) brings them in at the headquarters.
  const run = clock(ctx);
  if (!run.seeded) {
    run.seeded = true;
    const people = Math.max(1, world.num(fact("people")));
    for (let index = 0; index < people; index += 1) arrive(ctx);
  }
}

/** Raiders come out of a camp and hunt the nearest colonist. */
function raid(ctx: GameContext): void {
  const world = colony.of(ctx);
  const number = world.num(fact("raids")) + 1;
  const kinds = idea.raiders.kinds.filter((raider) => raider.from <= number);
  const count = 1 + number * 2;
  const camp = CAMPS[(number - 1) % CAMPS.length]!;
  const run = clock(ctx);
  for (let index = 0; index < count; index += 1) {
    const word = kinds[index % kinds.length]!;
    run.serial += 1;
    const angle = index * 2.399;
    const x = camp.x + Math.cos(angle) * 3;
    const z = camp.z + Math.sin(angle) * 3;
    ctx.scene.entity.spawn(word.id, {
      id: `${word.id}-r${number}-${run.serial}`,
      position: [x, ctx.world.groundHeightAt(x, z), z],
      role: "npc",
      behaviors: [pursue({ aggroRadius: 400, reach: 1.6, leashRange: 4000, speed: word.speed, hunts: colonistKinds, attack: { effect: "damage", amount: word.damage, intervalSec: 1.2 } })],
    });
  }
  world.set(fact("raiding"), true);
  ctx.game.notices.push({ text: `Raid ${number}: ${count} ${idea.raiders.label.toLowerCase()} are coming`, tone: "warn" });
}

function raidersLeft(ctx: GameContext): number {
  return ctx.scene.entity.list().filter((body) => isRaider(ctx, body.id)).length;
}

/** Towers shoot the nearest raider in reach, once a second. */
function towersFire(ctx: GameContext): void {
  for (const instance of colony.of(ctx).instances()) {
    const word = idea.structures.find((structure) => structure.id === instance.kind);
    if (word?.role !== "tower" || !instance.ready) continue;
    const target = ctx.scene.entity.inRadius(instance.id, word.range ?? 16, (id) => isRaider(ctx, id))[0];
    if (target === undefined) continue;
    ctx.scene.entity.vfx({ preset: word.shot ?? "bolt", from: instance.id, to: target });
    ctx.scene.entity.effect({ from: instance.id, to: target, effect: "damage", via: { amount: word.damage ?? 10 } });
  }
}

/** The colony's life: colonists work, eat and arrive; raids come and are beaten off; towers shoot. */
export const lifeSystem = defineSystem({
  id: "colony.life",
  tick: { type: "frame" },
  create(ctx) {
    ctx.game.events.on("entity.died", (event) => {
      if (event.instanceId.startsWith("col-")) {
        crew(ctx).hands.delete(event.instanceId);
        ctx.game.notices.push({ text: `A ${idea.colonists.one.toLowerCase()} has died`, tone: "deny" });
      }
    });
  },
  update(ctx, dt) {
    if (gamePhase(ctx) !== "playing") return;
    const world = colony.of(ctx);
    found(ctx);
    if (world.fact(fact("lost")) === true) return;
    tickCrew(ctx, dt);
    const run = clock(ctx);
    const alive = crew(ctx).hands.size;
    if (alive !== world.num(fact("people"))) world.set(fact("people"), alive);
    const selected = ctx.scene.entity.selection.size();
    const held = tool.read(ctx);
    if (selected !== held.selected) tool.update(ctx, (state) => ({ ...state, selected, armed: selected > 0 ? null : state.armed }));

    // Raids: a countdown, then a wave out of a camp; beaten off when the last raider falls.
    if (run.raid < 0) run.raid = world.num(fact("raid_in"));
    if (world.fact(fact("raiding")) === true) {
      run.think -= dt;
      if (run.think <= 0) {
        run.think = 1;
        towersFire(ctx);
        if (raidersLeft(ctx) === 0) {
          run.raid = idea.raiders.every;
          world.set(fact("raiding"), false);
          world.set(fact("raid_in"), run.raid);
          world.change({ [fact("raids")]: 1 });
          ctx.game.notices.push({ text: `Raid beaten off. The next comes in ${idea.raiders.every}s.`, tone: "success" });
          void ctx.game.save?.checkpoint();
        }
      }
    } else {
      const before = Math.ceil(run.raid);
      run.raid -= dt;
      if (Math.ceil(run.raid) !== before) world.set(fact("raid_in"), Math.max(0, Math.ceil(run.raid)));
      if (run.raid <= 0) raid(ctx);
    }

    // Arrivals: a free bed and food to spare bring a new colonist.
    run.arrival -= dt;
    if (run.arrival <= 0) {
      run.arrival = idea.arrive;
      if (world.num(fact("beds")) > alive && world.num(fact(food!.id)) >= 15) {
        world.change({ [fact(food!.id)]: -10 });
        arrive(ctx);
        ctx.game.notices.push({ text: `A new ${idea.colonists.one.toLowerCase()} has arrived`, tone: "success" });
      }
    }

    // Hunger: with the stores empty every colonist weakens.
    run.hunger -= dt;
    if (run.hunger <= 0) {
      run.hunger = 3;
      if (world.num(fact(food!.id)) <= 0) for (const id of crew(ctx).hands.keys()) ctx.scene.entity.effect({ from: id, to: id, effect: "damage", via: { amount: 2 } });
    }
  },
});

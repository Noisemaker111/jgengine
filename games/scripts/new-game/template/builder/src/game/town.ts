import { gamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { defineSystem } from "@jgengine/shell/gameKit";

import { editorLayers } from "../editorLayers";
import { tool } from "./hooks";
import { idea } from "./idea";
import { realmGrid, seatCell } from "./places";
import { fact, realm, upgradeCost } from "./spec";

const PULSE_SECONDS = 8;
const pace = perContext((_ctx: GameContext) => ({ pulse: PULSE_SECONDS }));

const buildingOf = (kind: string) => idea.buildings.find((building) => building.id === kind) ?? null;
const resourceLabel = (id: string) => idea.resources.find((resource) => resource.id === id)?.label ?? id;

/** A fresh realm gets its seat in the middle of the grid; a loaded one already has it. */
export function foundSeat(ctx: GameContext): void {
  const world = realm.of(ctx);
  if (world.instances("seat").length > 0) return;
  world.place("seat", { cell: seatCell(realmGrid(editorLayers), idea.seat.size) }, { free: true });
}

/** Every few seconds each working building shows what it just made, so production is visible. */
function pulse(ctx: GameContext): void {
  const world = realm.of(ctx);
  const fed = world.fact(fact("fed")) !== false;
  for (const instance of world.instances()) {
    const building = buildingOf(instance.kind);
    if (building?.role !== "producer" || building.makes === undefined || !instance.ready || instance.position === null) continue;
    if (!fed && building.makes !== idea.resources[0]!.id) continue;
    const made = Math.round((building.rate ?? 0) * world.num(`${instance.id}.level`) * PULSE_SECONDS);
    if (made <= 0) continue;
    const [x, z] = instance.position;
    ctx.scene.entity.floatText({ position: [x, ctx.world.groundHeightAt(x, z) + 4.5, z], text: `+${made} ${resourceLabel(building.makes)}`, kind: "heal", scale: 1.2 });
  }
}

/** Net change per minute of every resource, as the HUD shows it. */
function rates(ctx: GameContext): Record<string, number> {
  const world = realm.of(ctx);
  const fed = world.fact(fact("fed")) !== false;
  const people = world.num(fact("people"));
  const out: Record<string, number> = Object.fromEntries(idea.resources.map((resource) => [resource.id, 0]));
  out[idea.resources[0]!.id] = -idea.eats * people;
  if (fed) out[idea.coin] = (out[idea.coin] ?? 0) + idea.tax * people;
  for (const building of idea.buildings) {
    if (building.role !== "producer" || building.makes === undefined) continue;
    if (!fed && building.makes !== idea.resources[0]!.id) continue;
    out[building.makes] = (out[building.makes] ?? 0) + (building.rate ?? 0) * world.num(fact(`works_${building.id}`));
  }
  return Object.fromEntries(Object.entries(out).map(([id, perSecond]) => [id, Math.round(perSecond * 60)]));
}

/** Facts the HUD reads, so a screen never digs in the world itself. */
export function realmView(ctx: GameContext) {
  const world = realm.of(ctx);
  const held = tool.read(ctx);
  const perMinute = rates(ctx);
  const tier = world.num(fact("tier"));
  const selected = held.selected === null ? null : world.instance(held.selected);
  const selectedWord = selected === null ? null : buildingOf(selected.kind);
  const level = selected === null ? 0 : world.num(`${selected.id}.level`);
  return {
    resources: idea.resources.map((resource) => ({ ...resource, amount: Math.floor(world.num(fact(resource.id))), perMinute: perMinute[resource.id] ?? 0 })),
    tier,
    tierLabel: idea.tiers[tier - 1]?.label ?? "",
    nextTier: idea.tiers[tier] ?? null,
    people: world.num(fact("people")),
    jobs: world.num(fact("jobs")),
    idle: Number(world.fact(fact("idle")) ?? 0),
    fed: world.fact(fact("fed")) !== false,
    won: world.fact(fact("won")) === true,
    dismissed: held.dismissed,
    armed: held.armed,
    buildings: idea.buildings.map((building) => ({ id: building.id, unlocked: tier >= building.tier, refusal: world.canPlace(building.id, { cell: [0, 0] })?.reason ?? null })),
    selected:
      selected === null
        ? null
        : {
            id: selected.id,
            kind: selected.kind,
            label: selected.label,
            ready: selected.ready,
            level,
            word: selectedWord,
            upgrade: selectedWord === null || selectedWord.role === "crown" || level >= 3 ? null : upgradeCost(selectedWord) * level,
          },
    mission: world.missionView(),
    next: world.next(),
    building: world.orders("build").map((order) => ({ id: order.id, label: order.label, progress: order.progress })),
    built: world.instances().filter((instance) => instance.kind !== "seat").length,
  };
}

export const townSystem = defineSystem({
  id: "realm.town",
  tick: { type: "frame" },
  update(ctx, dt) {
    if (gamePhase(ctx) !== "playing") return;
    foundSeat(ctx);
    const timing = pace(ctx);
    timing.pulse -= dt;
    if (timing.pulse > 0) return;
    timing.pulse = PULSE_SECONDS;
    pulse(ctx);
  },
});

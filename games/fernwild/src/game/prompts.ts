import { command, keybind, proximityPrompt, type PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { editorLayers } from "../editorLayers";
import { idea } from "./idea";
import { herdMarkers, nodeMarkers } from "./places";
import { camp, fact } from "./spec";

const label = (id: string) => idea.resources.find((resource) => resource.id === id)?.label ?? id;
const price = (cost: Readonly<Record<string, unknown>>) =>
  Object.entries(cost)
    .map(([id, amount]) => `${Math.abs(Number(amount))} ${label(id.replace(/^camp\./, ""))}`)
    .join(", ");

const act = (action: string, target: string) => command(`${idea.spec}.act`, { action, target });

/** What E does here: gather the node, tame the creature, or fix or upgrade what you built. */
export function prompts(ctx: GameContext): PositionedPrompt[] {
  const world = camp.of(ctx);
  const out: PositionedPrompt[] = [];
  for (const node of nodeMarkers(editorLayers)) {
    const word = idea.nodes.find((entry) => entry.id === node.node)!;
    const left = Math.floor(world.num(`${node.id}.left`));
    const text = left > 0 ? `${word.verb} ${word.label} (+${word.amount} ${label(word.gives)})` : `${word.label}: picked clean`;
    out.push({ id: node.id, position: { x: node.x, z: node.z }, prompt: proximityPrompt({ radius: 2.6, display: keybind("interact", text), invoke: act(`gather_${word.id}`, node.id) }) });
  }
  for (const herd of herdMarkers(editorLayers)) {
    if (world.fact(`${herd.id}.tame`) === true) continue;
    const body = ctx.scene.entity.get(herd.id);
    const word = idea.allies.find((entry) => entry.id === herd.ally)!;
    if (body === null) continue;
    out.push({ id: herd.id, position: { x: body.position[0], z: body.position[2] }, prompt: proximityPrompt({ radius: 4, display: keybind("interact", `${word.verb} ${word.label} (${price(word.cost)})`), invoke: act(`tame_${word.id}`, herd.id) }) });
  }
  for (const built of world.instances()) {
    if (!built.ready || built.position === null) continue;
    const health = ctx.scene.entity.stats.get(built.id, "health");
    const hurt = health !== null && health.current < health.max * 0.7;
    const level = world.num(`${built.id}.level`);
    const text = hurt
      ? `Repair ${built.label} (${price(world.costOf("repair", built.id))})`
      : level >= 3
        ? `${built.label}: top level`
        : `Upgrade ${built.label} to level ${level + 1} (${price(world.costOf("upgrade", built.id))})`;
    out.push({ id: built.id, priority: -1, position: { x: built.position[0], z: built.position[1] }, prompt: proximityPrompt({ radius: 2.4, display: keybind("interact", text), invoke: act(hurt ? "repair" : "upgrade", built.id) }) });
  }
  return out;
}

/** Facts the HUD reads, so a screen never digs in the world itself. */
export function campView(ctx: GameContext) {
  const world = camp.of(ctx);
  return {
    resources: idea.resources.map((resource) => ({ ...resource, amount: Math.floor(world.num(fact(resource.id))) })),
    wave: world.num(fact("wave")),
    held: world.num(fact("held")),
    alive: world.num(fact("alive")),
    raiding: world.fact(fact("raiding")) === true,
    duskIn: Math.ceil(world.num(fact("dusk_in"))),
    tamed: world.num(fact("tamed")),
    fallen: world.fact(fact("fallen")) === true,
    won: world.fact(fact("won")) === true,
    next: world.next(),
    mission: world.missionView(),
    building: world.orders("build").map((order) => ({ id: order.id, label: order.label, progress: order.progress })),
  };
}

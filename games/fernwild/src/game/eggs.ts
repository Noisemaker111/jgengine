import { command, keybind, proximityPrompt, type PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { createRemainsField, type RemainsSnapshot } from "../engine-local/remains/remains";

import { stow } from "./bags";
import { wildFemales } from "./creatures";
import { incubationBand } from "./data/breeding";
import { itemLabel, SPOILS } from "./data/items";
import { EGG_LAY_SECONDS, EGGS_NEARBY_CAP, eggItem, eggSizeFor } from "./data/kibble";

/** Metres an egg can be taken from, and the ground around a mother that counts as "her" eggs. */
const TAKE_REACH = 2.2;
const NEST_RADIUS = 8;
/** An egg rots where it lies on the same clock as one in the bag. */
const EGG_LASTS = SPOILS[eggItem("m")]?.seconds ?? 1800;

export interface EggsSave {
  next: Record<string, number>;
  eggs: RemainsSnapshot;
}

/**
 * ARK's wild eggs: an egg-laying female drops an unfertilized egg every so often, beside her, up to a
 * couple lying around at once; they rot if nobody takes them. Live-bearers (mammals) lay none.
 */
const eggsOf = perContext(() => ({
  field: createRemainsField({ lastsSeconds: EGG_LASTS }),
  next: new Map<string, number>(),
}));

/** The egg a species lays, or null when it bears live young. */
export function layerEgg(species: string, radius: number): string | null {
  return incubationBand(species) === null ? null : eggItem(eggSizeFor(radius));
}

export function tickEggs(ctx: GameContext): void {
  const state = eggsOf(ctx);
  const now = ctx.time.now();
  state.field.expire(now);
  const seen = new Set<string>();
  for (const mother of wildFemales(ctx)) {
    const egg = layerEgg(mother.species, mother.radius);
    if (egg === null) continue;
    seen.add(mother.id);
    const due = state.next.get(mother.id);
    if (due === undefined) {
      state.next.set(mother.id, now + ctx.rng() * EGG_LAY_SECONDS);
      continue;
    }
    if (now < due) continue;
    state.next.set(mother.id, now + EGG_LAY_SECONDS * (0.5 + ctx.rng()));
    const nearby = state.field.list().filter((entry) => Math.hypot(entry.at[0] - mother.at[0], entry.at[2] - mother.at[2]) <= NEST_RADIUS).length;
    if (nearby >= EGGS_NEARBY_CAP) continue;
    // Behind her a little, on the ground.
    const angle = ctx.rng() * Math.PI * 2;
    const x = mother.at[0] + Math.sin(angle) * (mother.radius + 0.4);
    const z = mother.at[2] + Math.cos(angle) * (mother.radius + 0.4);
    state.field.leave({ owner: mother.id, at: [x, ctx.world.groundHeightAt(x, z), z], contents: [{ item: egg, count: 1 }], now });
  }
  for (const id of state.next.keys()) if (!seen.has(id)) state.next.delete(id);
}

/** Every egg on the ground: where, and which egg. */
export function eggsOnGround(ctx: GameContext): { id: string; item: string; at: readonly [number, number, number] }[] {
  return eggsOf(ctx).field.list().flatMap((entry) => entry.contents.map((stack) => ({ id: entry.id, item: stack.item, at: entry.at })));
}

function eggNear(ctx: GameContext) {
  const me = ctx.scene.entity.get(ctx.player.userId);
  return me === null ? null : eggsOf(ctx).field.nearest(me.position, TAKE_REACH);
}

/** E at an egg: into the bag. */
export function takeEgg(ctx: GameContext): void {
  const entry = eggNear(ctx);
  if (entry === null) return;
  const taken = eggsOf(ctx).field.take(entry.id, (stack) => stow(ctx, stack.item, stack.count));
  for (const stack of taken) ctx.game.notices.push({ text: `Took ${itemLabel(stack.item)}`, tone: "success" });
}

/**
 * Below the creature in the crosshair (2), so E on a sleeping mother opens her and not the egg she just laid
 * beside her; above a plain pick-up (1), so an egg beats the bush or stone it lies by.
 */
const EGG_PRIORITY = 1.5;

export function eggPrompts(ctx: GameContext): PositionedPrompt[] {
  const entry = eggNear(ctx);
  const item = entry?.contents[0]?.item;
  if (entry === null || item === undefined) return [];
  return [{ id: `egg:${entry.id}`, position: { x: entry.at[0], z: entry.at[2] }, priority: EGG_PRIORITY, prompt: proximityPrompt({ radius: TAKE_REACH + 1, display: keybind("interact", `Take ${itemLabel(item)}`), invoke: command("takeEgg") }) }];
}

export function eggsSave(ctx: GameContext) {
  return {
    key: "fernwild.eggs",
    snapshot: (): EggsSave => ({ next: Object.fromEntries(eggsOf(ctx).next), eggs: eggsOf(ctx).field.snapshot() }),
    hydrate: (data: EggsSave) => {
      const state = eggsOf(ctx);
      state.next = new Map(Object.entries(data.next));
      state.field.restore(data.eggs);
    },
  };
}

export function resetEggs(ctx: GameContext): void {
  const state = eggsOf(ctx);
  state.field.reset();
  state.next.clear();
}

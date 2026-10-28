import { command, keybind, proximityPrompt, type PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import { createRemainsField, type RemainsField, type RemainsSnapshot, type RemainsStack } from "@jgengine/core/remains/remains";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

import { BAG, HOTBAR, stow } from "./bags";
import { itemLabel } from "./data/items";

/**
 * How long a survivor's body lies with their things before it falls apart. ARK's own body time depends on the
 * server; an hour is the usual single-player feel (approximate).
 */
export const BODY_LASTS = 3600;
/** How close you stand to your body to take your things back. */
const RECOVER_REACH = 3;

const bodiesOf = perContext((): RemainsField => createRemainsField({ lastsSeconds: BODY_LASTS }));

/** Every body lying in the world. */
export function bodies(ctx: GameContext) {
  return bodiesOf(ctx).list();
}

/** Everything in a bag or the hotbar, taken out of them. */
function emptyPockets(ctx: GameContext): RemainsStack[] {
  const taken: RemainsStack[] = [];
  for (const inventoryId of [BAG, HOTBAR]) {
    const items = new Set<string>();
    for (const slot of ctx.player.inventory.state(inventoryId).slots) if (slot !== null) items.add(slot.itemId);
    for (const item of items) {
      const count = ctx.player.inventory.count(inventoryId, item);
      ctx.player.inventory.take(inventoryId, item, count);
      taken.push({ item, count });
    }
  }
  return taken;
}

/** On death, everything the survivor carried or wore stays with their body where they fell. Returns how many stacks were left. */
export function leaveBody(ctx: GameContext, at: readonly [number, number, number], wornItems: readonly string[] = []): number {
  const contents = [...emptyPockets(ctx), ...wornItems.map((item) => ({ item, count: 1 }))];
  const left = bodiesOf(ctx).leave({ owner: ctx.player.userId, at, contents, now: ctx.time.now() });
  return left === null ? 0 : left.contents.length;
}

function bodyNear(ctx: GameContext) {
  const me = ctx.scene.entity.get(ctx.player.userId);
  return me === null ? null : bodiesOf(ctx).nearest(me.position, RECOVER_REACH, ctx.player.userId);
}

/** E at your body: take back all that fits; the rest stays with it. */
export function recoverBody(ctx: GameContext): void {
  const body = bodyNear(ctx);
  if (body === null) return;
  const taken = bodiesOf(ctx).take(body.id, (stack) => stow(ctx, stack.item, stack.count));
  const still = bodiesOf(ctx).list().some((entry) => entry.id === body.id);
  const stacks = taken.length;
  ctx.game.notices.push(
    still
      ? { text: `Took ${stacks} ${stacks === 1 ? "stack" : "stacks"} back; no room for the rest`, tone: "deny" }
      : { text: stacks === 1 ? `Took back your ${itemLabel(taken[0]!.item)}` : `Took back your things (${stacks} stacks)`, tone: "success" },
  );
}

export function bodyPrompts(ctx: GameContext): PositionedPrompt[] {
  const body = bodyNear(ctx);
  if (body === null) return [];
  return [{ id: `body:${body.id}`, position: { x: body.at[0], z: body.at[2] }, priority: 4, prompt: proximityPrompt({ radius: RECOVER_REACH + 1, display: keybind("interact", "Take back your things"), invoke: command("recoverBody") }) }];
}

/** Bodies that have lain too long fall apart, with what is still in them. */
export function tickBodies(ctx: GameContext): void {
  for (const gone of bodiesOf(ctx).expire(ctx.time.now())) {
    if (gone.owner === ctx.player.userId) ctx.game.notices.push({ text: "Your body has decayed, and what it held is lost", tone: "deny" });
  }
}

/** The survivor's nearest own body for the HUD: how far, and how long it lasts. */
export function bodyView(ctx: GameContext): { distance: number; secondsLeft: number; stacks: number } | null {
  const me = ctx.scene.entity.get(ctx.player.userId);
  if (me === null) return null;
  const mine = bodiesOf(ctx).nearest(me.position, Infinity, ctx.player.userId);
  if (mine === null) return null;
  return { distance: Math.hypot(mine.at[0] - me.position[0], mine.at[2] - me.position[2]), secondsLeft: Math.max(0, mine.until - ctx.time.now()), stacks: mine.contents.length };
}

export function bodiesSave(ctx: GameContext) {
  return {
    key: "fernwild.bodies",
    snapshot: (): RemainsSnapshot => bodiesOf(ctx).snapshot(),
    hydrate: (data: RemainsSnapshot) => bodiesOf(ctx).restore(data),
  };
}

export function resetBodies(ctx: GameContext): void {
  bodiesOf(ctx).reset();
}

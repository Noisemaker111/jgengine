import { gamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { wander } from "@jgengine/core/scene/behaviors";
import { defineSystem } from "@jgengine/shell/gameKit";

import { editorLayers } from "../editorLayers";
import { fish, reelIn, tickFishing } from "./fishing";
import { idea } from "./idea";
import { herdSpots, homeSpot, marketSpot, placeById, plotSpots, signSpots, spawnSpot, stallSpot, villagerSpots } from "./places";
import { fact, farm, HOUR, openPlots } from "./spec";

/** Metres from a place that still count as being at it. */
const AT = 4;
const MARKET_REACH = 7;

const session = perContext((_ctx: GameContext) => ({ seed: 0, think: 0, shown: new Map<string, string>() }));

const near = (ctx: GameContext, spot: { x: number; z: number }, reach: number) => {
  const me = ctx.scene.entity.get(ctx.player.userId);
  return me !== null && Math.hypot(me.position[0] - spot.x, me.position[2] - spot.z) <= reach;
};

const goods = () => [...idea.crops.map((crop) => ({ id: crop.id, label: crop.label, price: crop.price })), ...idea.fish.map((entry) => ({ id: entry.id, label: entry.label, price: entry.price }))];

/** The seed you plant with: the selected crop if you grow it, else the first you do. */
export function selectedCrop(ctx: GameContext) {
  const world = farm.of(ctx);
  const owned = idea.crops.filter((crop) => world.fact(fact(`has_${crop.id}`)) === true);
  return owned.find((crop) => crop.id === idea.crops[session(ctx).seed]?.id) ?? owned[0] ?? idea.crops[0]!;
}

export const atMarket = (ctx: GameContext) => near(ctx, marketSpot(editorLayers), MARKET_REACH);

/** The hour on the in-world clock, 0-24. */
export const hourOf = (ctx: GameContext) => ctx.time.calendar().dayFraction * 24;

export const marketOpen = (ctx: GameContext) => {
  const hour = hourOf(ctx);
  return hour >= idea.market.opens && hour < idea.market.closes;
};

/** Everything in the bag and what it would all sell for. */
export function bag(ctx: GameContext) {
  const world = farm.of(ctx);
  const held = goods()
    .map((entry) => ({ ...entry, count: Math.floor(world.num(fact(entry.id))) }))
    .filter((entry) => entry.count > 0);
  return { held, value: held.reduce((sum, entry) => sum + entry.count * entry.price, 0), count: held.reduce((sum, entry) => sum + entry.count, 0) };
}

function plant(ctx: GameContext, plotId: string): void {
  const plot = plotSpots(editorLayers).find((entry) => entry.id === plotId);
  if (plot === undefined) return;
  if (plot.index > openPlots(ctx)) {
    ctx.game.notices.push({ text: `Buy more land at the ${idea.market.label.toLowerCase()} to farm this row`, tone: "deny" });
    return;
  }
  const world = farm.of(ctx);
  const occupant = world.occupant(plotId);
  if (occupant !== null) {
    const crop = world.instance(occupant);
    if (crop === null) return;
    if (!crop.ready) {
      ctx.game.notices.push({ text: `${crop.label} is still growing`, tone: "info" });
      return;
    }
    const done = world.act(`harvest_${crop.kind}`, occupant);
    if (!done.ok) ctx.game.notices.push({ text: done.message, tone: "deny" });
    else ctx.game.notices.push({ text: `+${idea.crops.find((entry) => entry.id === crop.kind)?.yield ?? 1} ${crop.label.toLowerCase()}`, tone: "success" });
    return;
  }
  const seed = selectedCrop(ctx);
  const refused = world.canPlace(seed.id, { slot: plotId });
  if (refused !== null) {
    ctx.game.notices.push({ text: refused.reason === "cost" ? `Not enough ${idea.currency.label.toLowerCase()} for ${seed.label.toLowerCase()} seeds (${seed.seed})` : refused.message, tone: "deny" });
    return;
  }
  world.place(seed.id, { slot: plotId });
}

/** The stall buys the whole bag at once. */
function ship(ctx: GameContext): void {
  const held = bag(ctx);
  if (held.count === 0) {
    ctx.game.notices.push({ text: "Nothing to sell yet - harvest a crop or catch a fish", tone: "deny" });
    return;
  }
  farm.of(ctx).change({
    ...Object.fromEntries(held.held.map((entry) => [fact(entry.id), -entry.count])),
    [fact(idea.currency.id)]: held.value,
    [fact("earned")]: held.value,
    [fact("shipped")]: held.count,
  });
  ctx.game.notices.push({ text: `Sold ${held.count} for ${held.value} ${idea.currency.label.toLowerCase()}`, tone: "success" });
}

/** Sleep through to morning: the clock jumps, the world catches up (crops grow overnight) and the day saves. */
function sleep(ctx: GameContext): void {
  reelIn(ctx);
  const dayLength = idea.world.sky.dayLength;
  const fraction = ctx.time.calendar().dayFraction;
  const morning = idea.world.sky.startHour / 24;
  const skipped = (((morning - fraction + 1) % 1) || 1) * dayLength;
  ctx.time.hydrate({ ...ctx.time.snapshot(), now: ctx.time.now() + skipped });
  const world = farm.of(ctx);
  world.advance(skipped);
  world.change({ [fact("day")]: 1 });
  ctx.game.notices.push({ text: `Day ${world.num(fact("day"))}. ${world.num(fact("ripe")) > 0 ? "Crops ripened overnight." : "A fresh morning."} Saved.`, tone: "success" });
  void ctx.game.save?.checkpoint();
}

/** A signpost walks you down the road: you arrive at the place it names, facing the way it faces. */
export function travel(ctx: GameContext, signId: string): void {
  const sign = signSpots(editorLayers).find((entry) => entry.id === signId);
  if (sign === undefined) return;
  const to = placeById(editorLayers, sign.to);
  if (to === null) return;
  reelIn(ctx);
  ctx.scene.entity.setPose(ctx.player.userId, { position: [to.x, ctx.world.groundHeightAt(to.x, to.z), to.z], rotationY: to.rotationY });
}

/** A number key: at the market it buys that offer; anywhere else it picks that seed. */
export function storeOffers(ctx: GameContext) {
  const world = farm.of(ctx);
  return [
    ...idea.crops
      .filter((crop) => crop.unlock > 0 && world.fact(fact(`has_${crop.id}`)) !== true)
      .map((crop) => ({ id: `unlock_${crop.id}`, target: undefined as string | undefined, label: `${crop.label} seeds`, does: `grows in ${crop.hours} h, sells for ${crop.price}`, price: crop.unlock })),
    ...idea.upgrades.map((upgrade) => {
      const stage = world.num(`${upgrade.id}.stage`) || 1;
      return { id: `buy_${upgrade.id}`, target: upgrade.id as string | undefined, label: stage > upgrade.levels ? `${upgrade.label} (best)` : `${upgrade.label} ${stage + 1}`, does: upgrade.does, price: upgrade.cost * stage };
    }),
  ];
}

function digit(ctx: GameContext, index: number): void {
  if (atMarket(ctx)) {
    const offer = storeOffers(ctx)[index];
    if (offer === undefined) return;
    if (!marketOpen(ctx)) {
      ctx.game.notices.push({ text: `The ${idea.market.label.toLowerCase()} opens at ${idea.market.opens}:00`, tone: "deny" });
      return;
    }
    const done = farm.of(ctx).act(offer.id, offer.target);
    ctx.game.notices.push(done.ok ? { text: `Bought: ${offer.label}`, tone: "success" } : { text: done.message, tone: "deny" });
    return;
  }
  if (idea.crops[index] === undefined) return;
  const crop = idea.crops[index]!;
  if (farm.of(ctx).fact(fact(`has_${crop.id}`)) !== true) {
    ctx.game.notices.push({ text: `Buy ${crop.label.toLowerCase()} seeds at the ${idea.market.label.toLowerCase()}`, tone: "deny" });
    return;
  }
  session(ctx).seed = index;
}

/** Called once for the local player: you at the cottage door, the villagers in the square, animals on the farm. */
export function onNewPlayer(ctx: GameContext): void {
  const spawn = spawnSpot(editorLayers);
  ctx.scene.entity.spawn("player", { id: ctx.player.userId, position: [spawn.x, ctx.world.groundHeightAt(spawn.x, spawn.z), spawn.z], rotationY: spawn.rotationY, role: "player" });
  for (const villager of villagerSpots(editorLayers)) {
    ctx.scene.entity.spawn(villager.villager, { id: villager.id, position: [villager.x, ctx.world.groundHeightAt(villager.x, villager.z), villager.z], rotationY: villager.rotationY, role: "npc", behaviors: [wander({ radius: 3 })] });
  }
  for (const herd of herdSpots(editorLayers)) {
    ctx.scene.entity.spawn(`animal${herd.animal + 1}`, { id: herd.id, position: [herd.x, ctx.world.groundHeightAt(herd.x, herd.z), herd.z], rotationY: herd.rotationY, role: "npc", behaviors: [wander({ radius: 5 })] });
  }
}

/** Each crop stands in its plot as a sprout while it grows and as the ripe crop once it is ready. */
function showCrops(ctx: GameContext): void {
  const shown = session(ctx).shown;
  const world = farm.of(ctx);
  const standing = new Set<string>();
  for (const crop of world.instances("crop")) {
    if (crop.position === null) continue;
    standing.add(crop.id);
    const want = `${crop.ready ? "ripe" : "sprout"}_${crop.kind}`;
    if (shown.get(crop.id) === want && ctx.scene.entity.get(crop.id) !== null) continue;
    ctx.scene.entity.despawn(crop.id);
    const [x, z] = crop.position;
    ctx.scene.entity.spawn(want, { id: crop.id, position: [x, ctx.world.groundHeightAt(x, z), z], rotationY: (x * 7 + z * 3) % 6.28, role: "prop" });
    shown.set(crop.id, want);
  }
  for (const id of [...shown.keys()]) {
    if (standing.has(id)) continue;
    ctx.scene.entity.despawn(id);
    shown.delete(id);
  }
}

export const farmSystem = defineSystem({
  id: "farm.play",
  tick: { type: "frame" },
  create(ctx) {
    ctx.game.commands.define<{ plot?: string }>("plant", {
      apply(state, input) {
        if (input.plot !== undefined) plant(state, input.plot);
        return state;
      },
    });
    ctx.game.commands.define("ship", {
      apply(state) {
        if (near(state, stallSpot(editorLayers), AT)) ship(state);
        else state.game.notices.push({ text: `Sell at the ${idea.stall.label.toLowerCase()} by the ${idea.home.label.toLowerCase()}`, tone: "deny" });
        return state;
      },
    });
    ctx.game.commands.define("sleep", {
      apply(state) {
        if (near(state, homeSpot(editorLayers), AT)) sleep(state);
        else state.game.notices.push({ text: `Sleep at the ${idea.home.label.toLowerCase()}`, tone: "deny" });
        return state;
      },
    });
    ctx.game.commands.define<{ spot?: string }>("fish", {
      apply(state, input) {
        if (input.spot !== undefined) fish(state, input.spot);
        return state;
      },
    });
    ctx.game.commands.define<{ sign?: string }>("travel", {
      apply(state, input) {
        if (input.sign !== undefined) travel(state, input.sign);
        return state;
      },
    });
    ctx.game.commands.define<{ villager?: string }>("talk", {
      apply(state, input) {
        const word = idea.villagers.find((villager) => villager.id === input.villager);
        if (word !== undefined) state.game.notices.push({ text: `${word.name}: "${farm.of(state).says(word.id)[0] ?? word.line}"`, tone: "info", ttlMs: 5000 });
        return state;
      },
    });
    for (let index = 0; index < 6; index += 1) {
      ctx.game.commands.define(`digit${index + 1}`, {
        apply(state) {
          digit(state, index);
          return state;
        },
      });
    }
  },
  update(ctx, dt) {
    if (gamePhase(ctx) !== "playing") return;
    tickFishing(ctx);
    const state = session(ctx);
    state.think -= dt;
    if (state.think > 0) return;
    state.think = 0.25;
    showCrops(ctx);
  },
});

/** Hours left until a growing crop is ripe, rounded up. */
export function hoursLeft(ctx: GameContext, instanceId: string): number {
  const order = farm.of(ctx).orders("grow").find((entry) => entry.target === instanceId);
  return order === undefined ? 0 : Math.max(1, Math.ceil(order.remaining / HOUR));
}

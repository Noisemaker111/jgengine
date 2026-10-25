import { command, keybind, proximityPrompt, type PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { editorLayers } from "../editorLayers";
import { atMarket, bag, hoursLeft, hourOf, marketOpen, selectedCrop, storeOffers } from "./farm";
import { fishingState, fishingView } from "./fishing";
import { idea } from "./idea";
import { fishingSpots, homeSpot, marketSpot, plotSpots, signSpots, stallSpot } from "./places";
import { fact, farm, openPlots, stageOf } from "./spec";

const label = (text: string) => ({ kind: "label" as const, text });

/** What E does here: plant or harvest the plot, sell at the stall, sleep, cast or reel, talk. */
export function prompts(ctx: GameContext): PositionedPrompt[] {
  const world = farm.of(ctx);
  const out: PositionedPrompt[] = [];
  const open = openPlots(ctx);
  const seed = selectedCrop(ctx);
  for (const plot of plotSpots(editorLayers)) {
    const at = { x: plot.x, z: plot.z };
    if (plot.index > open) {
      out.push({ id: plot.id, position: at, priority: -2, prompt: proximityPrompt({ radius: 1.6, display: label(`Untilled - buy land at the ${idea.market.label.toLowerCase()}`) }) });
      continue;
    }
    const occupant = world.occupant(plot.id);
    const crop = occupant === null ? null : world.instance(occupant);
    const invoke = command("plant", { plot: plot.id });
    if (crop === null) out.push({ id: plot.id, position: at, prompt: proximityPrompt({ radius: 2.3, display: keybind("interact", `Plant ${seed.label.toLowerCase()} (${seed.seed} ${idea.currency.label.toLowerCase()})`), invoke }) });
    else if (crop.ready) {
      const word = idea.crops.find((entry) => entry.id === crop.kind);
      out.push({ id: plot.id, position: at, priority: 4, prompt: proximityPrompt({ radius: 2.3, display: keybind("interact", `Harvest ${crop.label.toLowerCase()} (+${word?.yield ?? 1})`), invoke }) });
    } else out.push({ id: plot.id, position: at, priority: -1, prompt: proximityPrompt({ radius: 2.3, display: label(`${crop.label}: ripe in ${hoursLeft(ctx, crop.id)} h`) }) });
  }
  const held = bag(ctx);
  const stall = stallSpot(editorLayers);
  out.push({
    id: "stall",
    position: { x: stall.x, z: stall.z },
    priority: held.count > 0 ? 2 : -3,
    prompt: proximityPrompt({ radius: 3.5, display: held.count > 0 ? keybind("interact", `Sell ${held.count} at the ${idea.stall.label.toLowerCase()} (+${held.value})`) : label(`${idea.stall.label}: bring crops or fish to sell`), invoke: command("ship") }),
  });
  const home = homeSpot(editorLayers);
  out.push({ id: "home", position: { x: home.x, z: home.z }, priority: -1, prompt: proximityPrompt({ radius: 2.6, display: keybind("interact", hourOf(ctx) >= 17 || hourOf(ctx) < 5 ? "Sleep until morning (saves)" : "Sleep until morning (skips the day, saves)"), invoke: command("sleep") }) });
  const phase = fishingState(ctx);
  for (const spot of fishingSpots(editorLayers)) {
    const text = phase === "idle" ? `Cast your line (rod ${stageOf(ctx, "rod")})` : phase === "waiting" ? "Waiting for a bite..." : "Reel in! E when the marker is in the green";
    out.push({ id: spot.id, position: { x: spot.x, z: spot.z }, priority: phase === "bite" ? 3 : 0, prompt: proximityPrompt({ radius: 3.2, display: keybind("interact", text), invoke: command("fish", { spot: spot.id }) }) });
  }
  for (const villager of idea.villagers) {
    for (const body of ctx.scene.entity.list()) {
      if (body.name !== villager.id) continue;
      out.push({ id: body.id, position: { x: body.position[0], z: body.position[2] }, priority: -1, prompt: proximityPrompt({ radius: 2.4, display: keybind("interact", `Talk to ${villager.name}`), invoke: command("talk", { villager: villager.id }) }) });
    }
  }
  for (const sign of signSpots(editorLayers)) {
    out.push({ id: sign.id, position: { x: sign.x, z: sign.z }, priority: 0, prompt: proximityPrompt({ radius: 1.8, display: keybind("interact", sign.label), invoke: command("travel", { sign: sign.id }) }) });
  }
  const market = marketSpot(editorLayers);
  out.push({ id: "market", position: { x: market.x, z: market.z }, priority: -2, prompt: proximityPrompt({ radius: 7, display: label(marketOpen(ctx) ? `${idea.market.label}: number keys buy` : `${idea.market.label}: closed until ${idea.market.opens}:00`) }) });
  return out;
}

/** Facts the HUD reads, so a screen never digs in the world itself. */
export function farmView(ctx: GameContext) {
  const world = farm.of(ctx);
  const clock = ctx.time.calendar();
  return {
    coins: Math.floor(world.num(fact(idea.currency.id))),
    day: world.num(fact("day")),
    hour: clock.hour,
    minute: clock.minute,
    bag: bag(ctx),
    seed: selectedCrop(ctx).id,
    owned: idea.crops.map((crop) => world.fact(fact(`has_${crop.id}`)) === true),
    planted: world.num(fact("planted")),
    ripe: world.num(fact("ripe")),
    plots: openPlots(ctx),
    harvested: world.num(fact("harvested")),
    caught: world.num(fact("caught")),
    shipped: world.num(fact("shipped")),
    earned: world.num(fact("earned")),
    festival: world.fact(fact("festival")) === true,
    atMarket: atMarket(ctx),
    marketOpen: marketOpen(ctx),
    offers: storeOffers(ctx),
    fishing: fishingView(ctx),
    mission: world.missionView(),
    next: world.next(),
  };
}

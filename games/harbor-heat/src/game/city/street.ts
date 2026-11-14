import { metaNumber, metaText } from "@jgengine/core/editor/markerMeta";
import type { PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { editorLayers } from "../../editorLayers";
import { spend } from "../cash";
import { cityEvent, cityOf } from "../cityRuntime";
import { streetPlayOf } from "../streetPlay";

/**
 * The street's answer to a reckless rider: people jumping clear of a fast bike, the Canal Wardens'
 * tickets that follow, cover the Wardens can't see into, and the two ways to make a ticket go away
 * (a respray at Sunset Motors, a call to Sgt. Dee). It reads the world model and keeps only the clock
 * of the last scare.
 */

/** No cover hides you while a warden is this close: they watched you pull in. */
const COVER_BLOWN = 28;
const RESPRAY_PER_STAR = 150;
const PAYOFF_PER_STAR = 400;

interface Street {
  /** Sim seconds before fast riding can scare the street again. */
  recklessAt: number;
}

const streetOf = perContext((): Street => ({ recklessAt: 0 }));

/** Cover the Wardens don't look into, as the scene authors it: a radius, and what the player must own first. */
interface Hideout {
  id: string;
  label: string;
  at: readonly [number, number];
  radius: number;
  needs: string | null;
}

const HIDEOUTS: readonly Hideout[] = editorLayers.markers
  .filter((marker) => marker.kind === "hideout")
  .map((marker) => ({
    id: marker.id,
    label: marker.label ?? marker.id,
    at: [marker.position.x, marker.position.z] as const,
    radius: metaNumber(marker, "radius", 8),
    needs: metaText(marker, "needs") || null,
  }));

/** Sunset Motors' bay is always open; the bungalow once bought; anything else (old front lots) stays shut. */
function hideoutOpen(hideout: Hideout, safehouseOwned: boolean): boolean {
  if (hideout.needs === null) return true;
  return hideout.needs === "safehouse" && safehouseOwned;
}

function wardenWithin(ctx: GameContext, at: readonly [number, number, number], metres: number): boolean {
  return ctx.scene.entity.list().some((entity) => entity.name.startsWith("cop_") && entity.name !== "car_cop" && Math.hypot(entity.position[0] - at[0], entity.position[2] - at[2]) <= metres);
}

/** The cover the player is in right now, or null. */
export function coverAt(ctx: GameContext, safehouseOwned: boolean): Hideout | null {
  const body = ctx.scene.entity.get(streetPlayOf(ctx).drivingVehicleId() ?? ctx.player.userId);
  if (body === null) return null;
  for (const hideout of HIDEOUTS) {
    if (Math.hypot(hideout.at[0] - body.position[0], hideout.at[1] - body.position[2]) > hideout.radius) continue;
    if (!hideoutOpen(hideout, safehouseOwned)) continue;
    if (wardenWithin(ctx, body.position, COVER_BLOWN)) return null;
    return hideout;
  }
  return null;
}

/** Tell the pursuit whether the player is in cover this tick; it cools the trail faster and ignores sightings. */
export function tickCover(ctx: GameContext, safehouseOwned: boolean): void {
  const streetPlay = streetPlayOf(ctx);
  const cover = streetPlay.wanted().stars > 0 ? coverAt(ctx, safehouseOwned) : null;
  const hidden = cover !== null;
  if (hidden === streetPlay.hidden()) return;
  streetPlay.setHidden(hidden);
  if (hidden) ctx.game.notices.push({ text: `Laying low at ${cover.label}. The Wardens can't see you here.`, tone: "info" });
}

const motors = () => HIDEOUTS.find((hideout) => hideout.id === "hideout_motors") ?? null;

export const resprayCost = (stars: number) => stars * RESPRAY_PER_STAR;
export const payoffCost = (stars: number) => stars * PAYOFF_PER_STAR;

export function registerStreet(ctx: GameContext): void {
  ctx.game.commands.define<Record<string, never>>("city.respray", {
    validate(state) {
      const stars = streetPlayOf(state).wanted().stars;
      const vehicle = streetPlayOf(state).drivingVehicleId();
      if (vehicle === null) return { reason: "no-car", message: "Bring the bike into the bay." };
      if (stars === 0) return { reason: "clean", message: "Nobody's looking for this one." };
      const at = state.scene.entity.get(vehicle)?.position;
      if (at !== undefined && wardenWithin(state, at, 45)) return { reason: "watched", message: "Lose the Wardens first. They watched you pull in." };
      if (state.game.economy.balance(state.player.userId, "cash") < resprayCost(stars)) return { reason: "cost", message: `A respray costs $${resprayCost(stars)}.` };
      return null;
    },
    apply(state) {
      const streetPlay = streetPlayOf(state);
      const cost = resprayCost(streetPlay.wanted().stars);
      if (!spend(state, cost, "respray")) return;
      streetPlay.forgiveHeat(state, Number.MAX_SAFE_INTEGER);
      state.game.notices.push({ text: `New paint, new plates. The Wardens lost you. -$${cost}`, tone: "success" });
      state.game.feedback.cue("objective", "Resprayed");
    },
  });

  ctx.game.commands.define<Record<string, never>>("city.payoff", {
    validate(state) {
      const world = cityOf(state);
      const stars = streetPlayOf(state).wanted().stars;
      if (world.fact("dee.known") !== true) return { reason: "unknown", message: "You don't know a warden who'd take it." };
      if (world.num("dee.trust") <= -20) return { reason: "burned", message: "Dee won't pick up." };
      if (stars === 0) return { reason: "clean", message: "There's nothing to lose." };
      if (state.game.economy.balance(state.player.userId, "cash") < payoffCost(stars)) return { reason: "cost", message: `Dee wants $${payoffCost(stars)} to lose a ticket.` };
      return null;
    },
    apply(state) {
      const streetPlay = streetPlayOf(state);
      const wanted = streetPlay.wanted();
      const cost = payoffCost(wanted.stars);
      if (!spend(state, cost, "payoff")) return;
      const floor = streetPlay.heatForStars(wanted.stars - 1);
      const left = streetPlay.forgiveHeat(state, Math.max(1, wanted.heat - floor + 1));
      cityOf(state).change({ "dee.trust": -3 });
      state.game.notices.push({ text: `Dee lost a ticket. ${left === 0 ? "You're clean." : `Down to ${left} star${left === 1 ? "" : "s"}.`} -$${cost}`, tone: "success" });
    },
  });
}

/** The respray prompt, shown to a rider in Sunset Motors' bay with the Wardens on them. */
export function streetPrompts(ctx: GameContext): PositionedPrompt[] {
  const bay = motors();
  if (bay === null || streetPlayOf(ctx).drivingVehicleId() === null || streetPlayOf(ctx).wanted().stars === 0) return [];
  return [{
    id: "street:respray",
    position: { x: bay.at[0], z: bay.at[1] },
    priority: 3,
    prompt: { radius: bay.radius, display: { kind: "keybind", actionId: "interact" }, invoke: { name: "city.respray", input: {} } },
  }];
}

export function streetPromptLabel(ctx: GameContext, id: string): string | null {
  if (id === "street:respray") return `Respray · $${resprayCost(streetPlayOf(ctx).wanted().stars)}`;
  return null;
}

/** Above this speed a bike near people on foot is reckless riding, metres per second (about 40 km/h). */
const RECKLESS_SPEED = 11;
/** People on foot this close to a fast bike jump clear, metres. */
const DODGE_REACH = 7;
const DODGE_STEP = 2.4;

const onFoot = (name: string) => name.startsWith("ped_") || name.startsWith("resident-");

/**
 * Fast riding past people on foot: they jump clear of the bike's path, and the street remembers it as
 * reckless riding (a little fear, a little heat if anyone reports it) at most every few seconds.
 */
export function tickReckless(ctx: GameContext): void {
  const streetPlay = streetPlayOf(ctx);
  const id = streetPlay.drivingVehicleId();
  if (id === null || streetPlay.raceActive()) return;
  const speed = streetPlay.telemetry().speedMs;
  if (speed < RECKLESS_SPEED) return;
  const car = ctx.scene.entity.get(id);
  if (car === null) return;
  const heading: readonly [number, number] = [Math.sin(car.rotationY ?? 0), Math.cos(car.rotationY ?? 0)];
  let dodged = 0;
  for (const entity of ctx.scene.entity.list()) {
    if (!onFoot(entity.name)) continue;
    const dx = entity.position[0] - car.position[0];
    const dz = entity.position[2] - car.position[2];
    if (Math.hypot(dx, dz) > DODGE_REACH) continue;
    const side = dx * heading[1] - dz * heading[0] >= 0 ? 1 : -1;
    const x = entity.position[0] + heading[1] * side * DODGE_STEP;
    const z = entity.position[2] - heading[0] * side * DODGE_STEP;
    ctx.scene.entity.setPose(entity.id, { position: [x, ctx.world.groundHeightAt(x, z), z], rotationY: Math.atan2(-dx, -dz) });
    dodged += 1;
  }
  const street = streetOf(ctx);
  const now = ctx.time.now();
  if (dodged === 0 || now < street.recklessAt) return;
  street.recklessAt = now + 4;
  cityEvent(ctx, { kind: "reckless", at: [car.position[0], car.position[1], car.position[2]] });
}


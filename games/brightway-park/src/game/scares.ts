import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { visitorKind } from "./entities/guests/catalog";
import { SKEPTIC_LINE } from "./objects/catalog";
import { park, parkObjects } from "./park";
import { agentOf } from "./agents";
import { session, type GuestState } from "./session";
import { staffCover } from "./staff";
import { think } from "./sim/thoughts";

/**
 * Scares and chains. A scare spends a visitor's nerve and wrings ectoplasm out of it. Scares that
 * land close together chain: each link adds to the multiplier, so a path laid out as a gauntlet
 * (portrait, cold spot, coffin, then the Ghost Train) earns far more than the same pieces scattered.
 * Scare a group too hard too early and their nerve is gone before they reach the best rides: they
 * flee screaming at the first corner, which spreads the rumor but leaves the big rides' yield behind.
 */

/** Seconds a chain survives without another scare. */
export const CHAIN_SECONDS = 18;
/** What each link adds to the multiplier, and the most links that count. */
export const CHAIN_STEP = 0.25;
export const CHAIN_MAX = 6;

/** The multiplier a visitor's next scare is worth, from the links already in their chain. */
export function chainMultiplier(links: number): number {
  return 1 + CHAIN_STEP * Math.max(0, Math.min(CHAIN_MAX, links));
}

/** The links a visitor's chain holds right now (a long breather has broken it). */
export function liveChain(guest: GuestState, now: number): number {
  if (guest.lastScareAt === undefined || now - guest.lastScareAt > CHAIN_SECONDS) return 0;
  return guest.combo ?? 0;
}

/** Whether a skeptic shrugs a prop of this fright off. */
export function shrugsOff(kind: string, fright: number): boolean {
  return visitorKind(kind).skeptic === true && fright < SKEPTIC_LINE;
}

/**
 * One scare landed on one visitor: it spends `fright` nerve, adds a link to their chain, gives them
 * some of the fright they came for, and lets a hunter film it. Returns the chain multiplier the
 * scare was worth, for the ectoplasm the caller collects.
 */
export function landScare(ctx: GameContext, guest: GuestState, fright: number, line: string | null, fun = true): number {
  const now = ctx.time.now();
  const links = liveChain(guest, now);
  const multiplier = chainMultiplier(links);
  guest.combo = links + 1;
  guest.lastScareAt = now;
  const w = park.of(ctx);
  if (guest.combo > w.num("park.best_chain")) w.set("park.best_chain", guest.combo);
  // The fright they came for: a good jolt is half the night out. (A ride fills it from its own ratings.)
  if (fun) agentOf(guest, ctx.rng).needs.refill("fun", fright * 2.5);
  const card = visitorKind(guest.kind);
  if (card.films !== undefined) {
    const at = ctx.scene.entity.get(guest.id)?.position;
    // A gargoyle watching makes the camera fail.
    if (at !== undefined && staffCover(ctx, at[0], at[2]).has("security")) think(guest, "filming", "The camera just died. That gargoyle moved, I swear", now);
    else {
      guest.footage = (guest.footage ?? 0) + fright * card.films;
      think(guest, "filming", guest.combo >= 3 ? "Are you getting this?! Keep rolling!" : "Got that on camera", now);
    }
  } else if (line !== null) think(guest, "scared", guest.combo >= 3 ? `${line} That's ${guest.combo} in a row!` : line, now);
  return multiplier;
}

/** What each prop shouts in a visitor's head when it jolts them. */
const LINES: Readonly<Record<string, string>> = {
  prop_portrait: "The portrait's eyes just moved!",
  prop_coldspot: "Why is it so cold right here?!",
  prop_coffin: "The coffin lid just flew open!",
  prop_fogger: "There's something in the fog!",
  prop_shelf: "The plates are flying off the shelf!",
  prop_flicker: "The lights went out and something touched me!",
  prop_vase: "That vase floated and smashed!",
  prop_candles: "The candles whispered my name!",
};

/**
 * The props on patrol: each ready prop jolts every living visitor walking within its reach (not
 * those already in a line or on a ride, and not skeptics for a cheap trick), then waits its
 * cooldown. Ectoplasm lands through the world's `pay_scare` ripple.
 */
export function tickScares(ctx: GameContext): void {
  if (session.guests.size === 0) return;
  const now = ctx.time.now();
  for (const prop of parkObjects(ctx)) {
    const scare = prop.def.scare;
    if (scare === undefined) continue;
    if (now < (session.propReady.get(prop.id) ?? 0)) continue;
    let jolted = false;
    for (const guest of session.guests.values()) {
      if (guest.phase !== "seeking" && guest.phase !== "busy") continue;
      const at = ctx.scene.entity.get(guest.id)?.position;
      if (at === undefined || Math.hypot(at[0] - prop.x, at[2] - prop.z) > scare.radius) continue;
      jolted = true;
      if (shrugsOff(guest.kind, scare.fright)) {
        think(guest, "cheap_trick", `A ${prop.def.label.toLowerCase()}? Cheap trick. Wires, obviously.`, now);
        continue;
      }
      const spent = Math.min(guest.courage, scare.fright);
      guest.courage -= spent;
      const multiplier = landScare(ctx, guest, scare.fright, LINES[prop.kind] ?? "What was that?!");
      const harvest = Math.round(spent * multiplier * 10) / 10;
      if (harvest > 0) park.emit(ctx, { kind: "pay_scare", scale: harvest });
    }
    if (jolted) {
      session.propReady.set(prop.id, now + scare.cooldown);
      ctx.game.audio.play("scare", [prop.x, 0, prop.z]);
    }
  }
}

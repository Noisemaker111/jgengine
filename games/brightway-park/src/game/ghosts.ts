import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { WorldModel } from "@jgengine/core/worldModel/worldModel";

import { DAY_LENGTH } from "./catalog";
import { GHOSTS, ghostFact, ghostWantsMet, type Census, type GhostDef } from "./ghostCatalog";
import { BUILDABLES, BUILD_IDS } from "./objects/catalog";
import { countOf, park, parkObjects, researched } from "./park";
import { groundAt } from "./build/terrain";
import { session } from "./session";
import { landScare, moonHarvest } from "./scares";

/**
 * Ghost residents. A ghost comes looking once the park's rumor reaches it; if every one of its wants
 * holds for `MOVE_IN_SECONDS` it moves in (`ghost.<id>` goes to 1), seeps its ectoplasm every night
 * (the world's `seep_*` flows), adds to the rumor, and whispers one séance for free. If the park
 * stops giving it what it wants for `RESTLESS_SECONDS` it drifts away again. An exorcist's
 * blessing (`threats.ts`) throws one out and keeps it out for a while. A ghost in residence is a
 * translucent body floating round the thing it loves most.
 */

/** Seconds every want must hold before a ghost moves in. */
export const MOVE_IN_SECONDS = 12;
/** Seconds a resident puts up with a park that has stopped giving it what it wants. */
export const RESTLESS_SECONDS = 40;
/** How long an exorcist's blessing keeps a banished ghost away, in nights. */
export const BANISH_NIGHTS = 2;

const CHECK_SECONDS = 1;

/** The park's structures and crowd, as a ghost's wants count them. */
export function parkCensus(w: WorldModel, living: number): Census {
  return {
    count: (kind) => countOf(w, kind),
    family: (group) => BUILD_IDS.reduce((sum, id) => sum + (BUILDABLES[id]!.ride?.group === group ? countOf(w, id) : 0), 0),
    tagged: (trait) => BUILD_IDS.reduce((sum, id) => sum + (BUILDABLES[id]!.scare?.[trait] === true ? countOf(w, id) : 0), 0),
    living,
  };
}

export const isResident = (w: WorldModel, id: string): boolean => w.num(ghostFact(id)) >= 1;

export function residentCount(w: WorldModel): number {
  return GHOSTS.filter((ghost) => isResident(w, ghost.id)).length;
}

/** Why a ghost is not (or not yet) at home, or null when it is. */
export interface GhostStatus {
  ghost: GhostDef;
  resident: boolean;
  /** "In residence", "Drifting closer", "Restless", "Banished", "Waiting for rumor"... */
  state: string;
  wants: { id: string; label: string; have: number; need: number; met: boolean }[];
  /** 0-1 progress toward moving in, or toward leaving when restless. */
  progress: number;
}

export function ghostStatuses(ctx: GameContext): GhostStatus[] {
  const w = park.of(ctx);
  const census = parkCensus(w, session.guests.size);
  const rumor = w.num("park.rating");
  const now = ctx.time.now();
  return GHOSTS.map((ghost) => {
    const { wants, met } = ghostWantsMet(ghost, census);
    const resident = isResident(w, ghost.id);
    const banishedUntil = w.num(`${ghostFact(ghost.id)}.banished_until`);
    const pending = session.ghostPending.get(ghost.id) ?? 0;
    const restless = session.ghostRestless.get(ghost.id) ?? 0;
    let state: string;
    let progress = 0;
    if (resident && restless > 0) { state = "Restless: give it what it wants"; progress = restless / RESTLESS_SECONDS; }
    else if (resident) { state = `In residence · ${ghost.yield} ecto a night`; progress = 1; }
    else if (now < banishedUntil) state = "Banished by an exorcist";
    else if (rumor < ghost.rumor) state = `Hasn't heard of the park · needs ${ghost.rumor} rumor`;
    else if (met) { state = "Drifting closer..."; progress = pending / MOVE_IN_SECONDS; }
    else state = "Looking the park over";
    return { ghost, resident, state, wants, progress: Math.max(0, Math.min(1, progress)) };
  });
}

/** A ghost moves in: its fact, the count, its free séance, and the news. */
function moveIn(ctx: GameContext, w: WorldModel, ghost: GhostDef): void {
  w.set(ghostFact(ghost.id), 1);
  w.set(`${ghostFact(ghost.id)}.since`, ctx.time.now());
  w.set("park.ghosts", residentCount(w));
  ctx.game.notices.push({ text: `${ghost.icon} The ${ghost.label} has moved in: +${ghost.yield} ecto a night`, tone: "success" });
  const unlock = BUILDABLES[ghost.unlocks]!;
  if (w.fact(researched(unlock.id)) !== true) {
    w.set(researched(unlock.id), true);
    ctx.game.notices.push({ text: `The ${ghost.label} whispers the plans for the ${unlock.label}`, tone: "success" });
  }
  ctx.game.audio.play("milestone");
}

/** A ghost leaves (restless, or thrown out): its fact and the count. */
export function moveOut(ctx: GameContext, w: WorldModel, ghost: GhostDef, why: string): void {
  w.set(ghostFact(ghost.id), 0);
  w.set("park.ghosts", residentCount(w));
  session.ghostRestless.delete(ghost.id);
  session.ghostPending.delete(ghost.id);
  ctx.game.notices.push({ text: `${ghost.icon} The ${ghost.label} ${why}`, tone: "warn" });
}

/** Throw a ghost out and keep it out for `BANISH_NIGHTS` nights. */
export function banish(ctx: GameContext, w: WorldModel, ghost: GhostDef): void {
  w.set(`${ghostFact(ghost.id)}.banished_until`, ctx.time.now() + BANISH_NIGHTS * DAY_LENGTH);
  moveOut(ctx, w, ghost, "was blessed out of the park by the exorcist");
}

let checkAcc = 0;

/** Seconds between a resident's haunts, its reach, and the fright it gives (a ghost is never a cheap trick). */
export const HAUNT = { every: 14, reach: 8, fright: 4 } as const;

/**
 * A resident haunts: every `HAUNT.every` seconds it flares and frightens every living visitor in
 * reach of it, skeptics included, wringing ectoplasm into the vault and adding a link to their chain.
 * The overlay reads the flare (`session.ghostFlares`) to burst its halo.
 */
function hauntTheLiving(ctx: GameContext): void {
  const now = ctx.time.now();
  for (const ghost of GHOSTS) {
    const body = ctx.scene.entity.get(ghostBodyId(ghost.id))?.position;
    if (body == null) continue;
    if (now < (session.ghostNextHaunt.get(ghost.id) ?? 0)) continue;
    let frightened = 0;
    for (const guest of session.guests.values()) {
      if (guest.phase !== "seeking" && guest.phase !== "busy" && guest.phase !== "queued") continue;
      const at = ctx.scene.entity.get(guest.id)?.position;
      if (at == null || Math.hypot(at[0] - body[0], at[2] - body[2]) > HAUNT.reach) continue;
      const spent = Math.min(guest.courage, HAUNT.fright);
      guest.courage -= spent;
      const multiplier = landScare(ctx, guest, HAUNT.fright, `The ${ghost.label} just floated through me!`);
      const harvest = Math.round(spent * multiplier * moonHarvest(park.of(ctx)) * 10) / 10;
      if (harvest > 0) park.emit(ctx, { kind: "pay_scare", scale: harvest });
      frightened += 1;
    }
    if (frightened === 0) continue;
    session.ghostNextHaunt.set(ghost.id, now + HAUNT.every);
    session.ghostFlares.set(ghost.id, now);
    ctx.game.audio.play("scare", [body[0], body[1], body[2]]);
  }
}

/** Once a second: who is drifting closer, who moves in, who is restless, who leaves. */
export function tickGhosts(ctx: GameContext, dt: number): void {
  floatGhosts(ctx);
  if (session.guests.size > 0) hauntTheLiving(ctx);
  checkAcc += dt;
  if (checkAcc < CHECK_SECONDS) return;
  const step = checkAcc;
  checkAcc = 0;
  const w = park.of(ctx);
  const census = parkCensus(w, session.guests.size);
  const rumor = w.num("park.rating");
  const now = ctx.time.now();
  for (const ghost of GHOSTS) {
    const { met } = ghostWantsMet(ghost, census);
    if (isResident(w, ghost.id)) {
      session.ghostPending.delete(ghost.id);
      // The audience comes and goes with the night: a banshee is restless only while the park is open and empty.
      if (met || (ghost.id === "banshee" && w.fact("park.open") !== true)) { session.ghostRestless.delete(ghost.id); continue; }
      const restless = (session.ghostRestless.get(ghost.id) ?? 0) + step;
      session.ghostRestless.set(ghost.id, restless);
      if (restless >= RESTLESS_SECONDS) moveOut(ctx, w, ghost, "grew restless and drifted away");
      continue;
    }
    if (!met || rumor < ghost.rumor || now < w.num(`${ghostFact(ghost.id)}.banished_until`)) { session.ghostPending.delete(ghost.id); continue; }
    const pending = (session.ghostPending.get(ghost.id) ?? 0) + step;
    session.ghostPending.set(ghost.id, pending);
    if (pending >= MOVE_IN_SECONDS) moveIn(ctx, w, ghost);
  }
  syncGhostBodies(ctx);
}

export const ghostBodyId = (id: string): string => `ghost:${id}`;

/** Where a resident haunts: the first structure its first want counts, else the middle of the park. */
function haunt(ctx: GameContext, ghost: GhostDef): [number, number] {
  const w = park.of(ctx);
  const census = parkCensus(w, 0);
  for (const want of ghost.wants) {
    for (const obj of parkObjects(ctx)) {
      const one: Census = { ...census, count: (kind) => (kind === obj.kind ? 1 : 0), family: (group) => (obj.def.ride?.group === group ? 1 : 0), tagged: (trait) => (obj.def.scare?.[trait] === true ? 1 : 0), living: 0 };
      if (want.have(one) > 0) return [obj.x, obj.z];
    }
  }
  return [0, 10];
}

/** Every resident has a body on screen; a ghost who left takes its body with it. */
export function syncGhostBodies(ctx: GameContext): void {
  const w = park.of(ctx);
  for (const ghost of GHOSTS) {
    const id = ghostBodyId(ghost.id);
    const resident = isResident(w, ghost.id);
    const there = ctx.scene.entity.get(id) != null;
    if (resident && !there) {
      const [x, z] = haunt(ctx, ghost);
      ctx.scene.entity.spawn(ghost.body, { id, position: [x + 3, groundAt(w, x, z) + 0.6, z + 3], role: "npc" });
      session.ghostHaunts.set(ghost.id, [x, z]);
    } else if (!resident && there) {
      if (ctx.scene.entity.selection.has(id)) ctx.scene.entity.selection.remove(id);
      ctx.scene.entity.despawn(id);
      session.ghostHaunts.delete(ghost.id);
    }
  }
}

/** Residents float in a slow ring round their haunt, bobbing. */
function floatGhosts(ctx: GameContext): void {
  const t = ctx.time.now();
  const w = park.of(ctx);
  for (const [index, ghost] of GHOSTS.entries()) {
    const at = session.ghostHaunts.get(ghost.id);
    if (at === undefined) continue;
    const id = ghostBodyId(ghost.id);
    if (ctx.scene.entity.get(id) == null) continue;
    const angle = t * 0.18 + index * 1.7;
    // The ring breathes in and out, so a ghost swoops close over the thing it loves, then drifts wide.
    const radius = 4 + (index % 3) + Math.sin(t * 0.37 + index) * 2.2;
    const x = at[0] + Math.cos(angle) * radius;
    const z = at[1] + Math.sin(angle) * radius;
    const y = groundAt(w, x, z) + 0.7 + Math.sin(t * 1.3 + index) * 0.25;
    ctx.scene.entity.setPose(id, { position: [x, y, z], rotationY: -angle });
  }
}

/** A new park or a load: forget who was drifting closer, and redraw the residents. */
export function resetGhosts(ctx: GameContext): void {
  for (const ghost of GHOSTS) {
    const id = ghostBodyId(ghost.id);
    if (ctx.scene.entity.get(id) != null) ctx.scene.entity.despawn(id);
  }
  session.ghostPending.clear();
  session.ghostRestless.clear();
  session.ghostHaunts.clear();
  session.ghostNextHaunt.clear();
  session.ghostFlares.clear();
  // An exorcist mid-walk leaves with the old park.
  if (ctx.scene.entity.get("exorcist") != null) ctx.scene.entity.despawn("exorcist");
  session.exorcist = null;
  checkAcc = 0;
}

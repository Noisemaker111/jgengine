import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { ecto } from "./ecto";
import { GHOSTS, ghostFact } from "./ghostCatalog";
import { banish, isResident } from "./ghosts";
import { park } from "./park";
import { session, type GuestState } from "./session";
import { groundAt } from "./build/terrain";

/** The exorcist's body: walks in from the gate to the ghost's haunt, blesses it, and walks out. */
export const EXORCIST_BODY = "visitor_exorcist";
const EXORCIST_ID = "exorcist";
const EXORCIST_SPEED = 3.2;
const GATE: [number, number, number] = [0, 0, 56];
/** Seconds the exorcist stands at the haunt with the bell and the book. */
const BLESS_SECONDS = 6;

/** Send the exorcist's body walking to where it banishes (x, z). */
function sendExorcist(ctx: GameContext, at: readonly [number, number]): void {
  if (ctx.scene.entity.get(EXORCIST_ID) == null) ctx.scene.entity.spawn(EXORCIST_BODY, { id: EXORCIST_ID, position: GATE, role: "npc" });
  session.exorcist = { to: [at[0], 0, at[1] + 2], phase: "in", until: 0 };
}

/** The exorcist walks in, blesses, walks out and is gone. */
export function tickExorcist(ctx: GameContext, dt: number): void {
  const walk = session.exorcist;
  if (walk === null) return;
  const goal = walk.phase === "out" ? GATE : walk.to;
  const next = ctx.scene.entity.moveToward(EXORCIST_ID, goal, { speed: EXORCIST_SPEED, dt, stopDistance: 0 });
  if (next === null) { session.exorcist = null; return; }
  ctx.scene.entity.setPose(EXORCIST_ID, { position: [next[0], groundAt(park.of(ctx), next[0], next[2]), next[2]] });
  const there = Math.hypot(next[0] - goal[0], next[2] - goal[2]) < 1;
  if (walk.phase === "in" && there) { walk.phase = "bless"; walk.until = ctx.time.now() + BLESS_SECONDS; }
  else if (walk.phase === "bless" && ctx.time.now() >= walk.until) walk.phase = "out";
  else if (walk.phase === "out" && there) {
    ctx.scene.entity.despawn(EXORCIST_ID);
    session.exorcist = null;
  }
}

/**
 * The haunt's enemies. Ghost hunters and paranormal TV crews film every scare they witness. A crew
 * that flees screaming drops the camera and the footage is lost; one that walks out calmly (bored,
 * at dawn, or simply brave) puts it on the record (`park.evidence`). At 100 evidence an exorcist
 * comes at noon, while the living are away: the newest ghost in residence is blessed out of the
 * park, the rumor takes a knock and the fee comes out of the vault. Evidence fades a little every
 * noon on its own, and a Gargoyle Sentry watching makes the cameras fail.
 */

/** Evidence that brings the exorcist. */
export const EXORCIST_EVIDENCE = 100;
/** Evidence that fades every noon. */
export const EVIDENCE_FADE = 15;
/** How much of a crew's footage survives the edit and goes on the record. */
export const FOOTAGE_ON_RECORD = 0.3;
/** What the exorcist costs the vault: with a ghost to throw out, and when there is none. */
export const EXORCISM_FEE = { banish: 250, bless: 450 } as const;

/** A filming visitor leaving: calm, the footage goes on the record; fleeing, it is lost. */
export function leaveWithFootage(ctx: GameContext, guest: GuestState, fled: boolean): void {
  const footage = guest.footage ?? 0;
  guest.footage = 0;
  if (footage <= 0 || fled) return;
  park.emit(ctx, { kind: "footage", scale: Math.round(footage * FOOTAGE_ON_RECORD * 10) / 10 });
  const w = park.of(ctx);
  if (w.num("park.evidence") >= EXORCIST_EVIDENCE * 0.7) {
    ctx.game.notices.push({ text: `A crew left with footage: evidence ${Math.round(w.num("park.evidence"))} of ${EXORCIST_EVIDENCE}. Scare them out before they leave!`, tone: "warn" });
  }
}

/**
 * Noon: if the record is full, the exorcist comes. Otherwise the evidence fades a little. Returns
 * whether an exorcism happened.
 */
export function noonExorcism(ctx: GameContext): boolean {
  const w = park.of(ctx);
  const evidence = w.num("park.evidence");
  if (evidence < EXORCIST_EVIDENCE) {
    if (evidence > 0) w.change({ "park.evidence": -Math.min(evidence, EVIDENCE_FADE) });
    return false;
  }
  const residents = GHOSTS.filter((ghost) => isResident(w, ghost.id))
    .sort((a, b) => w.num(`${ghostFact(b.id)}.since`) - w.num(`${ghostFact(a.id)}.since`));
  const newest = residents[0];
  const fee = newest === undefined ? EXORCISM_FEE.bless : EXORCISM_FEE.banish;
  w.emit({ kind: "exorcism", scale: fee });
  w.change({ "park.evidence": -evidence, "park.exorcisms": 1, "park.buzz": newest === undefined ? -30 : -20 });
  if (newest !== undefined) {
    sendExorcist(ctx, session.ghostHaunts.get(newest.id) ?? [0, 10]);
    banish(ctx, w, newest);
  } else sendExorcist(ctx, [0, 10]);
  ctx.game.notices.push({
    text: newest === undefined
      ? `An exorcist blessed the whole park at noon: ${ecto(fee)} of ectoplasm boiled away`
      : `An exorcist came at noon with the footage: the ${newest.label} is gone, and ${ecto(fee)} with it`,
    tone: "warn",
  });
  ctx.game.audio.play("bankrupt");
  return true;
}

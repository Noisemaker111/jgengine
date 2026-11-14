import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { ecto } from "./ecto";
import { GHOSTS, ghostFact } from "./ghostCatalog";
import { banish, isResident } from "./ghosts";
import { park } from "./park";
import type { GuestState } from "./session";

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
export const EVIDENCE_FADE = 12;
/** What the exorcist costs the vault: with a ghost to throw out, and when there is none. */
export const EXORCISM_FEE = { banish: 250, bless: 450 } as const;

/** A filming visitor leaving: calm, the footage goes on the record; fleeing, it is lost. */
export function leaveWithFootage(ctx: GameContext, guest: GuestState, fled: boolean): void {
  const footage = guest.footage ?? 0;
  guest.footage = 0;
  if (footage <= 0 || fled) return;
  park.emit(ctx, { kind: "footage", scale: Math.round(footage * 10) / 10 });
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
  if (newest !== undefined) banish(ctx, w, newest);
  ctx.game.notices.push({
    text: newest === undefined
      ? `An exorcist blessed the whole park at noon: ${ecto(fee)} of ectoplasm boiled away`
      : `An exorcist came at noon with the footage: the ${newest.label} is gone, and ${ecto(fee)} with it`,
    tone: "warn",
  });
  ctx.game.audio.play("bankrupt");
  return true;
}

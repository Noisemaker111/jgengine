import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { dossierView, nearestUnreadNote } from "../dossier";
import type { ProbeFrame } from "./frame";

/** What proofs and flows read about dossier: its part of the capture probe. */
export function dossierProbe(ctx: GameContext, { here, sight }: ProbeFrame) {
  const dossier = dossierView(ctx);
  return {
    speciesSeen: dossier.species.seen,
    speciesTotal: dossier.species.total,
    itemsSeen: dossier.items.seen,
    itemsTotal: dossier.items.total,
    notesSeen: dossier.notes.seen,
    notesTotal: dossier.notes.total,
    tamesSeen: dossier.tames.seen,
    tamesTotal: dossier.tames.total,
    // The nearest explorer note not yet read.
    ...sight("note", nearestUnreadNote(ctx, here, 4000)),
  };
}

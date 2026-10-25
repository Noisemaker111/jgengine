import type { WorldModel } from "@jgengine/core/worldModel/worldModel";

import { BUILDABLES } from "../objects/catalog";
import { setLevel } from "./terrain";
import { session } from "../session";

/**
 * The builder's undo: the last few things the player did to the lot, newest last. Undoing a build
 * takes it away and pays its whole price back; undoing a demolish puts it back where it stood and
 * takes back the refund; undoing a land change puts the ground back and returns what it cost.
 */
export type BuildStep =
  | { type: "place"; ids: string[]; cost: number }
  | { type: "remove"; kind: string; cell: [number, number]; rot: number; refund: number }
  | { type: "land"; cells: { col: number; row: number; level: number }[]; cost: number };

const LIMIT = 30;
// The run's own undo list lives on the session, so a new park starts with none.
const steps = (): BuildStep[] => session.undo;

export function recordStep(step: BuildStep): void {
  steps().push(step);
  if (steps().length > LIMIT) steps().shift();
}

export function clearUndo(): void {
  steps().length = 0;
}

export function canUndo(): boolean {
  return steps().length > 0;
}

export function lastStep(): BuildStep | null {
  return steps().at(-1) ?? null;
}

/**
 * Undo the newest step against the world. `place` puts a structure back without charging it (the
 * world's `{ free: true }` placement) and returns its new id; `remove` takes one away. Returns a line
 * for the notice, or null when there was nothing to undo or it could no longer be undone.
 */
export function undoStep(
  w: WorldModel,
  place: (kind: string, cell: [number, number], rot: number) => string | null,
  remove: (id: string) => boolean,
): string | null {
  const step = steps().pop();
  if (step === undefined) return null;
  if (step.type === "place") {
    const before = w.num("park.cash");
    const gone = step.ids.filter((id) => w.instance(id) !== null && remove(id));
    if (gone.length === 0) return null;
    // The world's demolish paid part back; the undo makes it whole.
    w.change({ "park.cash": step.cost - (w.num("park.cash") - before) });
    return `Undone: build · $${step.cost.toLocaleString()} back`;
  }
  if (step.type === "remove") {
    if (w.num("park.cash") < step.refund) return null;
    const id = place(step.kind, step.cell, step.rot);
    if (id === null) return null;
    w.change({ "park.cash": -step.refund });
    return `Undone: demolish · ${BUILDABLES[step.kind]?.label ?? step.kind} is back`;
  }
  for (const cell of step.cells) setLevel(w, cell.col, cell.row, cell.level);
  w.change({ "park.cash": step.cost });
  return `Undone: land · $${step.cost} back`;
}


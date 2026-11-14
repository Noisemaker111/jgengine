import type { ProofSetup } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { DEPART } from "../../src/world";
import { viewStore, whenReady, whenWritten } from "../../src/game/controls";
import { rollItem, type ItemKind } from "../../src/game/loot";
import { fitInto, roomOf } from "../../src/game/state";
import type { Point } from "../../src/world";

/** A deep plain copy of a value read through setup's window. */
export function plain<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
export type Probe = ReturnType<NonNullable<NonNullable<typeof game.capture>["probe"]>>;

/** Stand at the crack in the burrow wall, facing it. */
export async function atCrack(s: ProofSetup<Probe>): Promise<void> {
  // The burrow's record is read asynchronously; nothing in the burrow answers until it is.
  await whenReady(s.ctx);
  s.teleport({ x: DEPART.at[0], z: DEPART.at[2], y: 0, yaw: Math.PI });
}
/** Out in the house: a real departure through the crack. */
export async function outInTheHouse(s: ProofSetup<Probe>): Promise<void> {
  await atCrack(s);
  s.press("KeyE");
  await whenWritten(s.ctx);
  s.waitFor((r) => r.inRun === 1, { timeoutMs: 5000 });
}
/** Things already in the pack, as if found earlier this run. */
export function carrying(s: ProofSetup<Probe>, kinds: readonly ItemKind[]): void {
  // Plain copies: what setup reads through its window must not outlive setup inside the game's state.
  viewStore.update(s.ctx, (seen) => {
    const v = plain(seen);
    if (v.run === null) return v;
    let pack = v.run.pack;
    kinds.forEach((kind, i) => { const slot = fitInto(pack, rollItem(kind, 1, `proof:${kind}:${i}`, `${v.run!.id}:${kind}~proof-${i}`), v.run!.packW, v.run!.packH); if (slot !== null) pack = [...pack, slot]; });
    return { ...v, run: { ...v.run, pack } };
  });
}
/** Where the current room's first find lies, and the way home. */
export function firstFind(s: ProofSetup<Probe>): Point {
  const run = viewStore.read(s.ctx).run!;
  const loot = roomOf(run).loot.find((l) => l.kind !== "toybox" && !run.taken.includes(l.key))!;
  return loot.spot.at;
}
export function crack(s: ProofSetup<Probe>): Point {
  return roomOf(viewStore.read(s.ctx).run!).exits.find((e) => e.kind === "crack")!.at;
}

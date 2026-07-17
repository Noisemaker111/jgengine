import type { CombatantKind } from "./catalog";
import type { Faction } from "./tuning";

/** A commanded intent for one unit. Serializable plain data — no closures, no entity refs. */
export type UnitCommand =
  | { kind: "idle" }
  | { kind: "move"; x: number; z: number }
  | { kind: "attackMove"; x: number; z: number }
  | { kind: "attack"; targetId: string };

export interface UnitRuntime {
  id: string;
  catalogId: string;
  faction: Faction;
  kind: CombatantKind;
  command: UnitCommand;
  /** Guards return here and drop chase when a target leads them past `leash` from it. */
  guardPoint?: { x: number; z: number };
  leash: number;
  /** Seconds remaining before the next swing lands. */
  attackCooldown: number;
}

export interface SessionState {
  units: Map<string, UnitRuntime>;
  /** Set by the Attack-Move verb; consumed by the next right-click order. */
  attackMoveArmed: boolean;
  over: boolean;
  victory: boolean;
  trainSeq: number;
}

function fresh(): SessionState {
  return { units: new Map(), attackMoveArmed: false, over: false, victory: false, trainSeq: 0 };
}

/** Module-level singleton (single-player skirmish). `selectFilter` and the AI both read it, so it
 * cannot live behind `perContext(ctx)` — the shell's pointer filter has no context handle. */
export let session: SessionState = fresh();

export function resetSession(): void {
  session = fresh();
}

/** True when the shell should let the pointer select this entity (own living units + keep). */
export function isPlayerSelectable(id: string): boolean {
  const unit = session.units.get(id);
  return unit !== undefined && unit.faction === "player";
}

export function livingUnits(faction: Faction, kind?: CombatantKind): UnitRuntime[] {
  const out: UnitRuntime[] = [];
  for (const unit of session.units.values()) {
    if (unit.faction !== faction) continue;
    if (kind !== undefined && unit.kind !== kind) continue;
    out.push(unit);
  }
  return out;
}

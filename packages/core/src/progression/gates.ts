import type { UnlockCatalog } from "../game/unlocks";
import type { Standing, StandingRequirement } from "./standing";

/** What a gate is evaluated against: standing by track and money by currency. */
export interface GateFacts {
  standing(trackId: string): number;
  balance(currency: string): number;
}

/** Every condition a gate can require; all named conditions must hold. */
export interface GateRequirement {
  standing?: StandingRequirement;
  /** Smallest balance of `currency` that passes. */
  balance?: { currency: string; min: number };
}

/**
 * A milestone: content that opens exactly when its requirements hold and names the unlock it
 * grants. `unlock` must resolve in the catalog the set is built with, or the set refuses to load.
 */
export interface GateDef {
  id: string;
  unlock: string;
  label?: string;
  category?: string;
  requires?: GateRequirement;
}

/** Which named condition a closed gate still needs. */
export type GateMiss = "standing" | "balance";

/** One gate against live facts. */
export interface GateStatus {
  gate: GateDef;
  open: boolean;
  missing: readonly GateMiss[];
}

/** Evaluated gate content: the table, its status against facts, and the grants a caller applies. */
export interface GateSet {
  gates(): readonly GateDef[];
  gate(gateId: string): GateDef | null;
  status(facts: GateFacts): readonly GateStatus[];
  isOpen(gateId: string, facts: GateFacts): boolean;
  open(facts: GateFacts): readonly GateDef[];
  /** Gates met now whose `unlock` is not in `granted` — the unlocks to grant this pass. */
  claim(facts: GateFacts, granted: readonly string[]): readonly GateDef[];
}

/** Content and the resolvers a {@link GateSet} is built from. */
export interface GateSetConfig {
  gates: readonly GateDef[];
  /** The ids an unlock may resolve to; normally the game's content catalog. */
  catalog: Pick<UnlockCatalog, "has">;
  /** The standing a requirement reads; also validates every requirement's track at load. */
  standing?: Pick<Standing, "hasTrack">;
}

/** Read a {@link Standing} and a balance record as {@link GateFacts}. */
export function gateFacts(
  standing: Pick<Standing, "standing">,
  actorId: string,
  balances: Readonly<Record<string, number>> = {},
): GateFacts {
  return {
    standing: (trackId) => standing.standing(actorId, trackId),
    balance: (currency) => balances[currency] ?? 0,
  };
}

function check(condition: boolean, message: string): void {
  if (!condition) throw new RangeError(message);
}

/** Check an authored gate table against the content it grants; throws `RangeError` naming the gate. */
export function assertGates(config: GateSetConfig): void {
  const ids = new Set<string>();
  for (const gate of config.gates) {
    const id = gate.id.trim();
    check(id !== "", "Gate id must not be empty");
    check(!ids.has(id), `Gate "${id}" is declared twice`);
    ids.add(id);
    check(gate.unlock.trim() !== "", `Gate "${id}" names an empty unlock`);
    check(
      config.catalog.has(gate.unlock),
      `Gate "${id}" unlocks unknown id "${gate.unlock}" - the reward resolves to nothing`,
    );
    const standing = gate.requires?.standing;
    if (standing !== undefined) {
      check(standing.trackId.trim() !== "", `Gate "${id}" names an empty standing track`);
      check(
        config.standing === undefined || config.standing.hasTrack(standing.trackId),
        `Gate "${id}" reads unknown standing track "${standing.trackId}"`,
      );
      if (standing.min !== undefined) check(Number.isFinite(standing.min), `Gate "${id}" standing min must be finite`);
      if (standing.max !== undefined) check(Number.isFinite(standing.max), `Gate "${id}" standing max must be finite`);
      check(
        standing.min === undefined || standing.max === undefined || standing.min <= standing.max,
        `Gate "${id}" needs standing min <= max`,
      );
    }
    const balance = gate.requires?.balance;
    if (balance !== undefined) {
      check(balance.currency.trim() !== "", `Gate "${id}" names an empty currency`);
      check(Number.isFinite(balance.min) && balance.min >= 0, `Gate "${id}" balance min must be finite and >= 0`);
    }
  }
}

function missingFor(gate: GateDef, facts: GateFacts): GateMiss[] {
  const missing: GateMiss[] = [];
  const standing = gate.requires?.standing;
  if (standing !== undefined) {
    const value = facts.standing(standing.trackId);
    if ((standing.min !== undefined && value < standing.min) || (standing.max !== undefined && value > standing.max)) {
      missing.push("standing");
    }
  }
  const balance = gate.requires?.balance;
  if (balance !== undefined && facts.balance(balance.currency) < balance.min) missing.push("balance");
  return missing;
}

/**
 * Authored unlock gates: each one names the unlock it grants and the standing or balance it reads.
 * Evaluated against caller-supplied facts, so one table serves a single-player save, a server actor
 * or a probe. Load refuses a gate whose unlock id resolves to nothing (the D3.8 class), so a dead
 * milestone fails at startup instead of in play. A gate with no requirements is open from the start.
 *
 * @capability unlock-gates milestones gated by standing or money, validated against the content they grant
 */
export function createGateSet(config: GateSetConfig): GateSet {
  assertGates(config);
  const definitions = config.gates.slice();

  function statusOf(gate: GateDef, facts: GateFacts): GateStatus {
    const missing = missingFor(gate, facts);
    return { gate, open: missing.length === 0, missing };
  }

  return {
    gates: () => definitions.slice(),
    gate: (gateId) => definitions.find((gate) => gate.id === gateId) ?? null,
    status: (facts) => definitions.map((gate) => statusOf(gate, facts)),
    isOpen(gateId, facts) {
      const gate = definitions.find((entry) => entry.id === gateId);
      return gate === undefined ? false : missingFor(gate, facts).length === 0;
    },
    open: (facts) => definitions.filter((gate) => missingFor(gate, facts).length === 0),
    claim(facts, granted) {
      const out: GateDef[] = [];
      for (const gate of definitions) {
        if (granted.includes(gate.unlock)) continue;
        if (missingFor(gate, facts).length === 0) out.push(gate);
      }
      return out;
    },
  };
}

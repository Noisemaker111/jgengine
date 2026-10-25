/**
 * The save-state gate: every value a persisted enum's own list allows must survive a save.
 *
 * ## The rule this gate enforces
 *
 * A decoder's accepted set comes from the type, never from a second hand-written list. Export the
 * list beside the type (`export const GUEST_PHASES = [...] as const satisfies readonly GuestPhase[]`,
 * with the type written as `(typeof GUEST_PHASES)[number]` so there is one source), have the decoder
 * test membership in that list, and have this gate read the same list. Then a value the type allows
 * cannot be missing from the decoder, and the two cannot drift the way Brightway Park's did: a park
 * saved while a guest was queued or riding was refused on load because the decoder carried its own
 * three-value copy of a five-value type.
 *
 * A game registers one {@link SaveStateGate}: a valid base save this build just wrote, plus one
 * {@link SaveStateAxis} per persisted enum. The gate walks every value, writes the save, decodes it,
 * and fails naming the game, the field and the value when the decode refuses it or changes it.
 */

/** One persisted enum, or one persisted number, with the values its type allows. */
export interface SaveStateAxis {
  /** The persisted field, as a save reader names it: `guests[].state.phase`. */
  field: string;
  /**
   * Every value the field's own type allows - imported from the game's list or type companion.
   * Never retyped here: a copy is the drift this gate exists to catch.
   */
  values: readonly (string | number)[];
  /** Encode a save holding `value` in `field`, starting from the game's valid base save. */
  encode: (value: string | number, base: string) => string;
  /** The game's decoder: the save it read, or `null` when it refused the bytes. */
  decode: (raw: string) => unknown;
  /** What the decoder produced for `field`; a substituted value fails too. A refusal returns `null`. */
  read: (decoded: unknown) => unknown;
}

/** Everything the gate needs for one game: a save it just wrote, and the enums that save persists. */
export interface SaveStateGate {
  game: string;
  /** A save this build just wrote in a legal state. Every case is this save with one field changed. */
  base: () => string;
  axes: SaveStateAxis[];
}

export interface SaveStateFailure {
  game: string;
  field: string;
  value: string | number;
  /** What went wrong, in the decoder's own terms. */
  why: string;
}

/** The sentence every failure carries: the correction, not just the symptom. */
export const RULE =
  "A decoder's accepted set comes from the type, never from a second hand-written list; " +
  "export the list beside the type and test membership in it.";

/** The save, or null when the decoder refused it. */
function rejectedOrValue(gate: SaveStateGate, axis: SaveStateAxis, value: string | number, base: string): SaveStateFailure | null {
  const raw = axis.encode(value, base);
  let decoded: unknown;
  try {
    decoded = axis.decode(raw);
  } catch (error) {
    return {
      game: gate.game,
      field: axis.field,
      value,
      why: `the decoder threw "${(error as Error).message}"`,
    };
  }
  if (decoded === null || decoded === undefined) {
    return {
      game: gate.game,
      field: axis.field,
      value,
      why: "the decoder refused a save the game itself can write (it read back as unreadable)",
    };
  }
  const read = axis.read(decoded);
  if (JSON.stringify(read) !== JSON.stringify(value)) {
    return {
      game: gate.game,
      field: axis.field,
      value,
      why: `the decoder changed it to ${JSON.stringify(read)} instead of loading it unchanged`,
    };
  }
  return null;
}

/** Every legal value of every registered enum, encoded and decoded. */
export function checkSaveStates(gate: SaveStateGate): SaveStateFailure[] {
  const base = gate.base();
  const failures: SaveStateFailure[] = [];
  for (const axis of gate.axes) {
    if (axis.values.length === 0) {
      failures.push({
        game: gate.game,
        field: axis.field,
        value: "(none)",
        why: "the axis registered no values, so nothing was proven; read them from the game's own list",
      });
      continue;
    }
    for (const value of axis.values) {
      const failure = rejectedOrValue(gate, axis, value, base);
      if (failure !== null) failures.push(failure);
    }
  }
  return failures;
}

/** One line per failure, ready for a test message or a gate's output. */
export function describeSaveStateFailures(failures: readonly SaveStateFailure[], limit = 40): string {
  const lines = failures.slice(0, limit).map(
    (failure) =>
      `${failure.game} ${failure.field} = ${JSON.stringify(failure.value)}: ${failure.why}\n  ${RULE}`,
  );
  if (failures.length > limit) lines.push(`... and ${failures.length - limit} more`);
  return lines.join("\n");
}

/**
 * Coverage a game cannot offer this gate yet, recorded instead of silently skipped.
 * `game` names the game, `reason` says why its saves are not covered this way, `instead` names
 * what would cover them.
 */
export interface SaveStateGap {
  game: string;
  reason: string;
  instead: string;
}

/** What the whole set proves: how many games, fields and values, and what is still uncovered. */
export interface SaveStateReport {
  games: { game: string; fields: number; values: number }[];
  failures: SaveStateFailure[];
  gaps: SaveStateGap[];
}

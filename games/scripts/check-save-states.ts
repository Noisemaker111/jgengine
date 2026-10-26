/**
 * Every game's save states, encoded and decoded: one command, one report.
 *
 *   bun run check games-save-states            # every registered game
 *   bun run check games-save-states --verbose  # list each game's fields and values
 *
 * ## The rule
 *
 * A decoder's accepted set comes from the type, never from a second hand-written list. Each game's
 * `<game>/src/**\/saveStates.ts` names a base save this build just wrote and one axis per persisted
 * enum, and the axis' values are imported from the game's own list. The gate walks every value,
 * writes the save, decodes it, and fails naming the game, the field and the value. That is the shape
 * of the defect that cost a Brightway Park player their park: the decoder accepted three guest
 * phases of a five-value type, so a save taken while a guest was queued or riding was archived.
 *
 * A game whose saves this gate cannot reach is listed with why, and what would cover it, in
 * {@link GAPS} - never skipped silently.
 *
 * Exit: 0 every registered value loads, 1 a value was refused or changed.
 */
import type { SaveStateFailure, SaveStateGate, SaveStateGap } from "../shared/saveStates";
import { checkSaveStates, describeSaveStateFailures, RULE } from "../shared/saveStates";
import { parkSaveStates } from "../brightway-park/src/game/saveStates";
import { orbitSaveStates } from "../odd-orbit/src/game/session/saveStates";

/** The games the gate proves today, each with the save states its own module registers. */
export const REGISTERED: readonly SaveStateGate[] = [parkSaveStates, orbitSaveStates];

/**
 * Games whose save path this gate does not reach yet. Each names the reason and the coverage that
 * would replace it, so the gap is visible in the report rather than absent from it.
 */
export const GAPS: readonly SaveStateGap[] = [
  {
    game: "deepward",
    reason:
      "the record is a shared game-save document (createGameSave + saveStore) plus a v1-v4 legacy reader, so its bytes are produced by the engine's document writer, not by a decoder this gate can call with a hand-built string.",
    instead:
      "a document round-trip test over a memory SaveBackend: capture the marrow section, set one field, write, load, and compare - the shape deepward/src/game/save.test.ts already sets up.",
  },
  {
    game: "scrap-signal",
    reason:
      "sections are applied by system.restore inside the engine document, and the downed reserve's phase comes from the engine's ReserveSnapshot; the restore also needs a mounted GameContext.",
    instead:
      "a document round-trip test over a memory backend with each ReserveSnapshot phase written and read back, which also pins the legacy `{phase, downedUntilMs}` migration.",
  },
  {
    game: "harbor-heat",
    reason:
      "the same engine document shape; its only persisted enum-ish fields (courier phase, mission flags) are validated as loosely as `typeof === \"string\"`, so nothing is refused at the byte level and a value check proves little without a restore.",
    instead:
      "a document round-trip test that reads the courier section back through courierStore, and tightening isCourierSave to the CourierState phase union first.",
  },
  {
    game: "beacon-bastion",
    reason:
      "validDefenseSave is a pure function the gate could call, but the base save needs a mounted world (creeps on routes, towers on plots, a work queue), so the axis builders must run inside a booted run.",
    instead:
      "a test that boots one defense, captures DefenseSave, sets each persisted enum (boss stance, queue job state) and re-validates - then registers the same axes here.",
  },
  {
    game: "drift-foundry",
    reason:
      "readCareer takes a storage object and is pure, but its persisted fields are numbers, ladder keys (already read from PART_SLOTS) and a version literal - no value enum a save could legally hold and a decoder could refuse.",
    instead:
      "an axis over ladder keys when a part slot or rank budget moves; register it here the day a string enum joins CareerSave.",
  },
  {
    game: "ember-command",
    reason:
      "the campaign track rides the engine's whole-world save (ctx.game.save) and restores over stores; it has no decoder of its own to call with bytes.",
    instead:
      "an engine world-save round-trip (checkpoint then load) asserting the campaign phase survives, covered by the run/session loop work rather than a byte-level gate.",
  },
];

export interface Report {
  games: { game: string; fields: number; values: number }[];
  failures: SaveStateFailure[];
  gaps: readonly SaveStateGap[];
}

export function report(gates: readonly SaveStateGate[] = REGISTERED, gaps: readonly SaveStateGap[] = GAPS): Report {
  const games: Report["games"] = [];
  const failures: SaveStateFailure[] = [];
  for (const gate of gates) {
    games.push({
      game: gate.game,
      fields: gate.axes.length,
      values: gate.axes.reduce((total, axis) => total + axis.values.length, 0),
    });
    failures.push(...checkSaveStates(gate));
  }
  return { games, failures, gaps };
}

export function render(result: Report, verbose = false): string {
  const lines: string[] = [];
  for (const game of result.games) {
    lines.push(`  covered  ${game.game.padEnd(15)} ${game.fields} field(s), ${game.values} value(s)`);
  }
  if (verbose) {
    for (const gate of REGISTERED) {
      for (const axis of gate.axes) lines.push(`    ${gate.game} ${axis.field} <- ${axis.values.map((v) => JSON.stringify(v)).join(", ")}`);
    }
  }
  lines.push(`  ${result.games.length} game(s) proven, ${result.games.reduce((n, game) => n + game.values, 0)} value(s)`);
  for (const gap of result.gaps) {
    lines.push(`  not covered  ${gap.game.padEnd(15)} ${gap.reason}`);
    lines.push(`               instead: ${gap.instead}`);
  }
  if (result.failures.length > 0) {
    lines.push("");
    lines.push(describeSaveStateFailures(result.failures));
    lines.push(RULE);
  }
  return lines.join("\n");
}

if (import.meta.main) {
  const result = report();
  console.log(render(result, process.argv.includes("--verbose")));
  process.exit(result.failures.length === 0 ? 0 : 1);
}

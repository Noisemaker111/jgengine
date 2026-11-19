import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { ProofFlow } from "@jgengine/core/play/flow";
import { describeFlowReport } from "@jgengine/core/play/flowSteps";
import { runFlowHeadless } from "@jgengine/core/play/headlessFlow.draw";

/**
 * Every game, the same check: a new game with no save, played through real input to the end of its
 * first loop (`proofs/flows/from-zero.flow.ts`), headless in game time. The games guide's claim that
 * every game has one is this test, not a sentence. A flow that can only run in a browser (its game
 * needs a live backend) shows as skipped, so the count of games proven headless stays visible.
 */
const gamesDir = join(import.meta.dir, "..");
const games = readdirSync(gamesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(gamesDir, entry.name, "src", "game.config.ts")))
  .map((entry) => entry.name)
  .sort();

const flows = new Map<string, ProofFlow | null>();
for (const name of games) {
  const file = join(gamesDir, name, "proofs", "flows", "from-zero.flow.ts");
  flows.set(name, existsSync(file) ? ((await import(file)) as { default: ProofFlow }).default : null);
}

describe("every game plays from zero to the end of its first loop", () => {
  test("every game has a from-zero flow", () => {
    expect(games.length).toBe(10);
    expect(games.filter((name) => flows.get(name) === null)).toEqual([]);
  });

  for (const name of games) {
    const flow = flows.get(name);
    if (flow === null || flow === undefined) continue;
    if (flow.browser) {
      test.skip(`${name} (browser-only: needs its backend running)`, () => {});
      continue;
    }
    test(name, async () => {
      // A boot state may only stand for the title screen: nothing staged before the player starts.
      const staged = flow.state === undefined ? [] : (flow.game.capture?.states?.[flow.state] ?? ["unknown state"]);
      expect(staged, `${name}'s from-zero flow boots a staged state`).toEqual([]);
      const report = await runFlowHeadless(flow);
      expect(report.ok, describeFlowReport("from-zero", report).join("\n")).toBe(true);
    }, 300_000);
  }
});

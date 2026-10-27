import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { EXAMPLE_BRIEF } from "./briefExample";
import { checkFlow, checkGames, inspectGame, readLoopProof, runCli, type Io } from "./check-game-design";
import type { DepthRule } from "./knownFailing";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** Every section the gate wants, in the shape the real games write them. */
const SECTIONS = [
  "- **Core loop.** Take a parcel, drive it, get paid.",
  "- **Progression — two systems.**",
  "- **Failure states.** A missed deadline returns the parcel.",
  "- **Minute 5 → hour 5.** Five minutes in, one delivery done.",
  "- **References it is chasing.**",
  "- **Gap to target.** No second act.",
];

function readme(proofLine: string, sections: readonly string[] = SECTIONS): string {
  return `# Fixture Game\n\nA game.\n\n## Design checklist\n\n${sections.join("\n")}\n\n${proofLine}\n`;
}

const FLOW = `import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  async run(f) {
    await f.command("game.start");
    await f.expect((p) => p.started === 1, "the run started");
  },
});
`;

const BRIEF = EXAMPLE_BRIEF;

/** A temp games root: `files` maps a path under the root to its contents. A game with a README gets a plan with {@link BRIEF} unless the files give it one. */
function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "game-design-"));
  roots.push(root);
  const games = new Set(Object.keys(files).filter((path) => path.endsWith("/README.md")).map((path) => path.split("/")[0] ?? ""));
  for (const game of games) {
    if (files[`${game}/PLAN.md`] !== undefined) continue;
    mkdirSync(join(root, game), { recursive: true });
    writeFileSync(join(root, game, "PLAN.md"), `# ${game} plan\n\n${BRIEF}`);
  }
  for (const [path, contents] of Object.entries(files)) {
    const target = join(root, path);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, contents);
  }
  return root;
}

/**
 * The same fixture, but every listed game is a package the gate's own discovery finds
 * (`@games/<name>` with a config module), the way a real game directory is.
 */
function gamesFixture(games: Record<string, Record<string, string>>): string {
  const files: Record<string, string> = {};
  for (const [game, entries] of Object.entries(games)) {
    files[`${game}/package.json`] = JSON.stringify({ name: `@games/${game}` });
    files[`${game}/src/game.config.ts`] = "export {};\n";
    for (const [path, contents] of Object.entries(entries)) files[`${game}/${path}`] = contents;
  }
  return fixture(files);
}

describe("loop proof line", () => {
  test("a bare name, a note, and TODO names all parse", () => {
    expect(readLoopProof("Loop proof: to-skirmish\n")).toEqual({ ok: true, entries: [{ name: "to-skirmish", todo: false }] });
    expect(readLoopProof("Loop proof: to-chase (run with --state chase)\n")).toEqual({
      ok: true,
      entries: [{ name: "to-chase", todo: false }],
    });
    expect(readLoopProof("Loop proof: to-first-ride, TODO to-second-act\n")).toEqual({
      ok: true,
      entries: [
        { name: "to-first-ride", todo: false },
        { name: "to-second-act", todo: true },
      ],
    });
  });

  test("a missing, empty or unnamed line is a problem the README carries", () => {
    expect(readLoopProof("# Game\n")).toEqual({
      ok: false,
      problem: 'has no "Loop proof:" line; name the flow that proves the core loop',
    });
    expect(readLoopProof("Loop proof:   \n").ok).toBe(false);
    expect(readLoopProof("Loop proof: To Skirmish\n").ok).toBe(false);
  });
});

/** An in-memory flow folder: name -> file text. */
function memoryIo(flows: Record<string, string>): Io {
  const name = (path: string) => path.replace(/^.*\//, "").replace(/\.flow\.ts$/, "");
  return {
    read: (path) => flows[name(path)] ?? "",
    exists: (path) => flows[name(path)] !== undefined,
    listFlows: () => Object.keys(flows),
  };
}

const check = (text: string) => checkFlow("g", "proof", "g/proofs/flows", memoryIo({ proof: text }));

describe("a flow file", () => {
  test("counts each arrival check: expect, waitFor, page checks and a hold until", () => {
    expect(check(FLOW)).toEqual({ problems: [], asserts: 1 });
    const many = FLOW.replace(
      'await f.expect(',
      [
        'await f.hold("KeyW", { until: (p) => p.x > 3 });',
        "await f.waitFor((p) => p.wave > 1);",
        'await f.waitForPage("x");',
        'await f.see("Won");',
        'await f.expectPage("y", "y");',
        "await f.expect(",
      ].join("\n    "),
    );
    expect(check(many).asserts).toBe(6);
  });

  test("a file that does not export a defined flow is refused by name", () => {
    expect(check("export const steps = [];\n").problems).toEqual(['g Loop proof "proof": g/proofs/flows/proof.flow.ts must export default defineFlow(game, { run })']);
  });
});

describe("game design gate", () => {
  test("a game with the six sections and a real flow passes", () => {
    const root = fixture({
      "good/README.md": readme("Loop proof: to-start"),
      "good/proofs/flows/to-start.flow.ts": FLOW,
    });
    const result = checkGames(root, ["good"]);
    expect(result.failures).toBe(0);
    expect(result.lines).toEqual([
      "game-design: OK - good: 6 sections, flow to-start",
      "game-design: OK - 1 games carry the six sections and name a flow",
    ]);
  });

  test("a missing section fails and names the game and the section", () => {
    const root = fixture({
      "thin/README.md": readme(
        "Loop proof: to-start",
        SECTIONS.filter((line) => !line.includes("Failure states")),
      ),
      "thin/proofs/flows/to-start.flow.ts": FLOW,
    });
    const result = checkGames(root, ["thin"]);
    expect(result.failures).toBe(1);
    expect(result.lines[0]).toBe('game-design: FAIL - thin README is missing the "Failure states" section of the design checklist');
    expect(result.lines.at(-1)).toBe("game-design: FAIL - 1 problem in 1 games");
  });

  test("a PLAN.md with its Gaps section answers the gap to target; a plan without one does not", () => {
    const withoutGap = SECTIONS.filter((line) => !line.includes("Gap to target"));
    const planned = fixture({
      "planned/README.md": readme("Loop proof: to-start", withoutGap),
      "planned/PLAN.md": `# Planned\n\n${BRIEF}\n## Features\n\n- packs\n\n## Gaps\n\n_None._\n`,
      "planned/proofs/flows/to-start.flow.ts": FLOW,
    });
    expect(checkGames(planned, ["planned"]).failures).toBe(0);

    const unplanned = fixture({
      "unplanned/README.md": readme("Loop proof: to-start", withoutGap),
      "unplanned/PLAN.md": `# Unplanned\n\n${BRIEF}\n## Features\n\n- packs\n`,
      "unplanned/proofs/flows/to-start.flow.ts": FLOW,
    });
    const result = checkGames(unplanned, ["unplanned"]);
    expect(result.failures).toBe(1);
    expect(result.lines[0]).toContain('"Gap to target"');
  });

  test("naming a flow that is not on disk fails, and lists the flows that do exist", () => {
    const root = fixture({
      "hopeful/README.md": readme("Loop proof: to-finish"),
      "hopeful/proofs/flows/to-start.flow.ts": FLOW,
    });
    const result = checkGames(root, ["hopeful"]);
    expect(result.failures).toBe(1);
    expect(result.lines[0]).toContain('Loop proof names "to-finish"');
    expect(result.lines[0]).toContain("hopeful/proofs/flows/to-finish.flow.ts does not exist");
    expect(result.lines[0]).toContain("available: to-start");
  });

  test("a game with no flows at all is told to write one", () => {
    const root = fixture({ "bare/README.md": readme("Loop proof: to-start") });
    const result = checkGames(root, ["bare"]);
    expect(result.failures).toBe(1);
    expect(result.lines[0]).toContain("the game has no flows");
  });

  test("a flow that only presses keys is not a proof", () => {
    const root = fixture({
      "motion/README.md": readme("Loop proof: to-start"),
      "motion/proofs/flows/to-start.flow.ts": FLOW.replace('await f.expect((p) => p.started === 1, "the run started");', 'await f.hold("KeyW", { ms: 2000 });'),
    });
    const result = checkGames(root, ["motion"]);
    expect(result.failures).toBe(1);
    expect(result.lines[0]).toContain("expects nothing");
  });

  test("a TODO proof is reported, not silently passed, and --strict fails it", () => {
    const root = fixture({ "later/README.md": readme("Loop proof: TODO to-courier") });
    const lenient = checkGames(root, ["later"]);
    expect(lenient.failures).toBe(0);
    expect(lenient.todos).toBe(1);
    expect(lenient.lines).toEqual([
      'game-design: TODO - later Loop proof names "to-courier" as TODO: no later/proofs/flows/to-courier.flow.ts yet',
      "game-design: OK - later: 6 sections, no flow yet",
      "game-design: OK - 1 games carry the six sections and name a flow, 1 TODO proof still to write",
    ]);

    const strict = checkGames(root, ["later"], undefined, true);
    expect(strict.failures).toBe(1);
    expect(strict.lines[0]).toStartWith("game-design: FAIL - later Loop proof names");
  });

  test("a README without the loop proof line fails before any flow is looked for", () => {
    const root = fixture({ "quiet/README.md": readme("Nothing about flows.") });
    const result = inspectGame(root, "quiet");
    expect(result.problems).toEqual(['quiet README has no "Loop proof:" line; name the flow that proves the core loop']);
  });

  test("a game with no design brief fails; one on the known-failing list is reported, not failed", () => {
    const root = fixture({
      "demo/README.md": readme("Loop proof: to-start"),
      "demo/PLAN.md": "# Demo plan\n\n## Milestones\n\n- [ ] 1. one more system\n",
      "demo/proofs/flows/to-start.flow.ts": FLOW,
    });
    const failing = checkGames(root, ["demo"]);
    expect(failing.failures).toBeGreaterThan(0);
    expect(failing.lines[0]).toBe('game-design: FAIL - demo brief: has no "## Design brief" section in PLAN.md');

    const known = new Map([["demo", new Map<DepthRule, string>([["brief", "written before the brief existed"]])]]);
    const listed = checkGames(root, ["demo"], undefined, false, known);
    expect(listed.failures).toBe(0);
    expect(listed.lines[0]).toStartWith("game-design: KNOWN - demo brief (written before the brief existed)");
  });

  test("a listed game whose brief is now complete fails until its entry is removed", () => {
    const root = fixture({ "fixed/README.md": readme("Loop proof: to-start"), "fixed/proofs/flows/to-start.flow.ts": FLOW });
    const known = new Map([["fixed", new Map<DepthRule, string>([["brief", "no brief"]])]]);
    const result = checkGames(root, ["fixed"], undefined, false, known);
    expect(result.failures).toBe(1);
    expect(result.lines[0]).toContain('fixed now passes "brief"; remove its entry');
  });

  test("the CLI reads the checkout it is pointed at and exits on the verdict", () => {
    const good = gamesFixture({
      good: { "README.md": readme("Loop proof: to-start"), "proofs/flows/to-start.flow.ts": FLOW },
    });
    const lines: string[] = [];
    expect(runCli(["--root", good], good, (line) => lines.push(line))).toBe(0);
    expect(lines).toEqual([
      "game-design: OK - good: 6 sections, flow to-start",
      "game-design: OK - 1 games carry the six sections and name a flow",
    ]);

    const bad = gamesFixture({
      hopeful: { "README.md": readme("Loop proof: to-finish"), "proofs/flows/to-start.flow.ts": FLOW },
    });
    const failures: string[] = [];
    expect(runCli(["--root", bad], bad, (line) => failures.push(line))).toBe(1);
    expect(failures.at(-1)).toBe("game-design: FAIL - 1 problem in 1 games");
  });
});

import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { driveStepKinds, parseStepFile } from "../../packages/jgengine/src/templates/captureArgs";

import { checkFlow, checkGames, inspectGame, readLoopProof, runCli, type Io, type ParseSteps } from "./check-game-design";

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

const FLOW = `{ "steps": [
  { "click": "Start" },
  { "assert": "__jgProbe().started", "note": "arrival: the run started" }
] }`;

/** A temp games root: `files` maps a path under the root to its contents. */
function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "game-design-"));
  roots.push(root);
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
  const name = (path: string) => path.replace(/^.*\//, "").replace(/\.json$/, "");
  return {
    read: (path) => flows[name(path)] ?? "",
    exists: (path) => flows[name(path)] !== undefined,
    listFlows: () => Object.keys(flows),
  };
}

const check = (steps: unknown[], extra: Record<string, string> = {}, parse?: ParseSteps) =>
  checkFlow("g", "proof", "g/proofs/flows", memoryIo({ proof: JSON.stringify({ steps }), ...extra }), parse);

/** The engine's own verdict on a one-file step list: null when drive accepts it, else its message. */
function engineVerdict(steps: unknown[]): string | null {
  try {
    parseStepFile({ steps }, "g/proofs/flows/proof.json");
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

describe("flow parsing reads the engine's drive parser", () => {
  test("every step kind the engine lists is a kind this gate accepts", () => {
    const samples: Record<string, unknown> = {
      click: "Start", doubleClick: "Unit", clickAt: [10, 20], rightClickAt: [10, 20], moveMouse: [1, 2], look: [-90, 0],
      aimAt: "crosshair()", fill: { label: "Name", value: "x" }, key: "KeyW", wait: 10, waitFor: "ready", reload: true,
      shot: "hud", rpc: { method: "run_command", name: "game.start" }, probe: "p", assert: "true",
    };
    for (const kind of driveStepKinds().filter((kind) => kind !== "flow")) {
      expect(samples[kind]).toBeDefined();
      expect(check([{ [kind]: samples[kind] }, { assert: "true" }]).problems).toEqual([]);
    }
  });

  test("refuses a step exactly when drive refuses it, with drive's message", () => {
    const corpus: unknown[][] = [
      [{ rpc: { method: "run_command", name: "x.y" } }],
      [{ rpc: "run_command x.y" }],
      [{ rpc: { name: "x" } }],
      [{ wiggle: "x" }],
      [{ click: "a", key: "KeyW" }],
      [{ assert: "" }],
      [{ click: "a", wobble: 1 }],
      [{ key: "KeyW", ms: 2500 }, { clickAt: [800, 450] }],
      [{ clickAt: "800,450" }],
      [{ key: "KeyW", ms: -1 }],
      [{ assert: "units.length", is: 5 }],
      [{ click: "a", is: 5 }],
      [{ waitFor: "ready", timeoutMs: 45000 }],
      [{ click: "Start", timeoutMs: 5000 }],
      [{ click: "Start", ms: 500 }],
      [{ click: "Start", after: { is: "x", until: 1 } }],
      [],
    ];
    for (const steps of corpus) {
      const verdict = engineVerdict(steps);
      const problems = check(steps).problems;
      if (verdict === null) expect(problems).toEqual([]);
      else expect(problems).toEqual([`g Loop proof "proof": ${verdict.startsWith("g/") ? verdict : `g/proofs/flows/proof.json ${verdict}`}`]);
    }
  });

  test("follows the engine when its parser changes: the verdict is whatever drive's parser says", () => {
    const steps = [{ teleport: [0, 0] }, { assert: "true" }];
    expect(check(steps).problems[0]).toContain('unknown step kind "teleport"');
    const newerEngine: ParseSteps = (input, source, options) => {
      const list = (input as { steps: Record<string, unknown>[] }).steps.filter((step) => !("teleport" in step));
      return parseStepFile({ steps: list }, source, options);
    };
    expect(check(steps, {}, newerEngine)).toEqual({ problems: [], asserts: 1 });
    const stricterEngine: ParseSteps = () => {
      throw new Error("steps[1]: assert now needs a note");
    };
    expect(check(steps.slice(1), {}, stricterEngine).problems).toEqual(['g Loop proof "proof": g/proofs/flows/proof.json steps[1]: assert now needs a note']);
  });

  test("counts asserts through includes and names a missing include with the flows that exist", () => {
    const menu = JSON.stringify({ steps: [{ reload: true }, { assert: "menu.ready" }] });
    expect(check([{ flow: "to-menu" }, { click: "Start" }, { assert: "started" }], { "to-menu": menu })).toEqual({ problems: [], asserts: 2 });
    const missing = check([{ flow: "to-base" }]);
    expect(missing.problems[0]).toContain('no flow named "to-base": g/proofs/flows/to-base.json does not exist (available: proof)');
  });

  test("broken JSON says so and names the file", () => {
    const io = memoryIo({ proof: "{ nope" });
    expect(checkFlow("g", "proof", "g/proofs/flows", io).problems[0]).toContain("g/proofs/flows/proof.json is not valid JSON");
  });
});

describe("game design gate", () => {
  test("a game with the six sections and a real flow passes", () => {
    const root = fixture({
      "good/README.md": readme("Loop proof: to-start"),
      "good/proofs/flows/to-start.json": FLOW,
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
      "thin/proofs/flows/to-start.json": FLOW,
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
      "planned/PLAN.md": "# Planned\n\n## Features\n\n- packs\n\n## Gaps\n\n_None._\n",
      "planned/proofs/flows/to-start.json": FLOW,
    });
    expect(checkGames(planned, ["planned"]).failures).toBe(0);

    const unplanned = fixture({
      "unplanned/README.md": readme("Loop proof: to-start", withoutGap),
      "unplanned/PLAN.md": "# Unplanned\n\n## Features\n\n- packs\n",
      "unplanned/proofs/flows/to-start.json": FLOW,
    });
    const result = checkGames(unplanned, ["unplanned"]);
    expect(result.failures).toBe(1);
    expect(result.lines[0]).toContain('"Gap to target"');
  });

  test("naming a flow that is not on disk fails, and lists the flows that do exist", () => {
    const root = fixture({
      "hopeful/README.md": readme("Loop proof: to-finish"),
      "hopeful/proofs/flows/to-start.json": FLOW,
    });
    const result = checkGames(root, ["hopeful"]);
    expect(result.failures).toBe(1);
    expect(result.lines[0]).toContain('Loop proof names "to-finish"');
    expect(result.lines[0]).toContain("hopeful/proofs/flows/to-finish.json does not exist");
    expect(result.lines[0]).toContain("available: to-start");
  });

  test("a game with no flows at all is told to write one", () => {
    const root = fixture({ "bare/README.md": readme("Loop proof: to-start") });
    const result = checkGames(root, ["bare"]);
    expect(result.failures).toBe(1);
    expect(result.lines[0]).toContain("the game has no flows");
  });

  test("a flow that parses but asserts nothing is not a proof", () => {
    const root = fixture({
      "motion/README.md": readme("Loop proof: to-start"),
      "motion/proofs/flows/to-start.json": `{ "steps": [ { "key": "KeyW", "ms": 2000 }, { "wait": 500 } ] }`,
    });
    const result = checkGames(root, ["motion"]);
    expect(result.failures).toBe(1);
    expect(result.lines[0]).toContain("asserts nothing");
  });

  test("a broken or cycling include fails the flow that leans on it", () => {
    const root = fixture({
      "linked/README.md": readme("Loop proof: to-start"),
      "linked/proofs/flows/to-start.json": `{ "steps": [ { "flow": "missing-menu" }, { "assert": "1 === 1" } ] }`,
      "loop/README.md": readme("Loop proof: a"),
      "loop/proofs/flows/a.json": `{ "steps": [ { "flow": "b" }, { "assert": "1 === 1" } ] }`,
      "loop/proofs/flows/b.json": `{ "steps": [ { "flow": "a" }, { "assert": "1 === 1" } ] }`,
    });
    const linked = checkGames(root, ["linked"]);
    expect(linked.lines[0]).toContain('no flow named "missing-menu"');
    expect(linked.lines[0]).toContain("does not exist");

    const loop = checkGames(root, ["loop"]);
    expect(loop.failures).toBe(1);
    expect(loop.lines[0]).toContain("flow cycle by name: b -> a -> b");
  });

  test("a TODO proof is reported, not silently passed, and --strict fails it", () => {
    const root = fixture({ "later/README.md": readme("Loop proof: TODO to-courier") });
    const lenient = checkGames(root, ["later"]);
    expect(lenient.failures).toBe(0);
    expect(lenient.todos).toBe(1);
    expect(lenient.lines).toEqual([
      'game-design: TODO - later Loop proof names "to-courier" as TODO: no later/proofs/flows/to-courier.json yet',
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

  test("the CLI reads the checkout it is pointed at and exits on the verdict", () => {
    const good = gamesFixture({
      good: { "README.md": readme("Loop proof: to-start"), "proofs/flows/to-start.json": FLOW },
    });
    const lines: string[] = [];
    expect(runCli(["--root", good], good, (line) => lines.push(line))).toBe(0);
    expect(lines).toEqual([
      "game-design: OK - good: 6 sections, flow to-start",
      "game-design: OK - 1 games carry the six sections and name a flow",
    ]);

    const bad = gamesFixture({
      hopeful: { "README.md": readme("Loop proof: to-finish"), "proofs/flows/to-start.json": FLOW },
    });
    const failures: string[] = [];
    expect(runCli(["--root", bad], bad, (line) => failures.push(line))).toBe(1);
    expect(failures.at(-1)).toBe("game-design: FAIL - 1 problem in 1 games");
  });
});

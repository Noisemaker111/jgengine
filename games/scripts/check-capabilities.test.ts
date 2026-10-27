import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  checkDeclarations,
  deriveLedger,
  gameAdoption,
  ledgerDrift,
  probeGivesUp,
  probeMatches,
  readGames,
  renderSummary,
  windowProbeVerdict,
  type Declaration,
  type GameDeclaration,
  type Ledger,
} from "./capabilities";
import { runCheck, type Sink } from "./check-capabilities";

const ledger: Ledger = {
  generatedBy: "test",
  gameFacingRule: "probed capabilities only",
  capabilities: [
    {
      id: "mission-runtime",
      packages: ["@jgengine/core"],
      module: "@jgengine/core/mission/mission",
      gameFacing: true,
      probe: { kind: "devtools" },
      intent: "run missions",
    },
    {
      id: "audio-probe",
      packages: ["@jgengine/shell"],
      module: "@jgengine/core/audio/audioProbe.view",
      gameFacing: true,
      probe: { kind: "window", global: "__jgengineAudio" },
      intent: "read the mix",
    },
    {
      id: "run-loop",
      packages: ["@jgengine/core"],
      module: "@jgengine/core/run/runLoop",
      gameFacing: false,
      probe: null,
      intent: "bank or lose what a run carries",
    },
  ],
};

/** One game: what its source imports (`adopts`) and what it wrote (`declaration`). */
const game = (name: string, adopts: string[], declaration: Declaration | null = null): GameDeclaration => ({
  game: name,
  adopts,
  declaration,
});

const probed: Declaration = { probes: { "@jgengine/core/mission/mission": ["campaign"] } };
/** `issue: null` writes the entry with no issue number. */
const owesAudio = (issue: number | null = 101, reason?: string): Declaration => ({
  ...probed,
  debt: {
    "audio-probe": {
      ...(reason === undefined ? {} : { reason }),
      ...(issue === null ? {} : { issue }),
    } as { issue: number },
  },
});

describe("adoption is read, not written", () => {
  test("a game that writes nothing passes: there is nothing to decline", () => {
    const report = checkDeclarations(ledger, [game("ember", ["run-loop"])]);
    expect(report.problems).toEqual([]);
    expect(report.adopted).toBe(1);
    expect(report.debt).toBe(0);
  });

  test("an adopted capability with its probe named is verified", () => {
    const report = checkDeclarations(ledger, [game("ember", ["mission-runtime"], probed)]);
    expect(report.problems).toEqual([]);
    expect(report.verified).toBe(1);
    expect(report.declared).toBe(0);
    expect(report.declarationLevel).toEqual([]);
  });

  test("a probe-capable adoption with no probe named is listed; a probe-less one only counts", () => {
    const report = checkDeclarations(ledger, [game("ember", ["mission-runtime", "run-loop"])]);
    expect(report.problems).toEqual([]);
    expect(report.adopted).toBe(2);
    expect(report.declared).toBe(2);
    expect(report.declarationLevel).toEqual([
      { game: "ember", capability: "mission-runtime", module: "@jgengine/core/mission/mission" },
    ]);
    expect(report.tallies[0]).toEqual({ game: "ember", adopted: 2, verified: 0, declared: 2, debt: 0 });
  });

  test("a boot probe for a module the game does not import fails", () => {
    const report = checkDeclarations(ledger, [game("ember", ["audio-probe"], probed)]);
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]!.message).toContain("imports none of that module's capabilities");
  });

  test("a boot probe for an unknown module fails", () => {
    const report = checkDeclarations(ledger, [game("ember", [], { probes: { "@jgengine/core/nope": ["x"] } })]);
    expect(report.problems[0]!.message).toContain('unknown module "@jgengine/core/nope"');
  });
});

describe("debt entries", () => {
  test("debt with an issue number passes and counts", () => {
    const report = checkDeclarations(ledger, [game("ember", ["mission-runtime"], owesAudio())]);
    expect(report.problems).toEqual([]);
    expect(report.debt).toBe(1);
    expect(report.debtEntries).toEqual([{ game: "ember", capability: "audio-probe", issue: 101 }]);
  });

  test("the reason is for the reader: short, shared or absent, it never fails", () => {
    const games = [
      game("ember", ["mission-runtime"], owesAudio(101, "n/a")),
      game("harbor", ["mission-runtime"], owesAudio(102, "n/a")),
      game("saltwick", ["mission-runtime"], owesAudio(103)),
    ];
    const report = checkDeclarations(ledger, games);
    expect(report.problems).toEqual([]);
    expect(report.debt).toBe(3);
  });

  test("debt on a capability the source imports is paid and fails until removed", () => {
    const report = checkDeclarations(ledger, [game("ember", ["mission-runtime", "audio-probe"], owesAudio())]);
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]!.message).toContain("the debt is paid");
  });

  test("debt on an unknown id fails", () => {
    const report = checkDeclarations(ledger, [game("ember", [], { debt: { "no-such-system": { issue: 101 } } })]);
    expect(report.problems[0]!.message).toContain("not a capability in capabilities.json");
  });

  test("debt on a capability that ships no probe fails", () => {
    const report = checkDeclarations(ledger, [game("ember", [], { debt: { "run-loop": { issue: 101 } } })]);
    expect(report.problems[0]!.message).toContain("ships no live probe");
  });

  test("debt without an issue number fails", () => {
    const report = checkDeclarations(ledger, [game("ember", ["mission-runtime"], owesAudio(null))]);
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]!.message).toContain("no issue number");
  });
});

describe("reading adoption from a game's source", () => {
  const trees: string[] = [];
  afterEach(() => {
    for (const root of trees.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  /** A checkout with one installed capability and one game; `source` is the game's one module. */
  function checkout(source: string, jgengine?: object): string {
    const repo = mkdtempSync(join(tmpdir(), "jg-capability-read-"));
    trees.push(repo);
    const root = join(repo, "games");
    const pkg = join(repo, "packages", "core");
    mkdirSync(join(pkg, "src", "run"), { recursive: true });
    writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "@jgengine/core", version: "1.0.0" }));
    writeFileSync(
      join(pkg, "src", "run", "runLoop.ts"),
      "/** @capability run-loop Bank or lose what a run carries */\nexport function createRunLoop(): void {}\n",
    );
    const dir = join(root, "demo");
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "@games/demo" }));
    writeFileSync(join(dir, "src", "game.config.ts"), "export const config = {};\n");
    writeFileSync(join(dir, "src", "loop.ts"), source);
    if (jgengine !== undefined) writeFileSync(join(dir, "jgengine.json"), JSON.stringify(jgengine));
    return root;
  }

  test("an import of the capability's module is adoption", () => {
    const root = checkout('import { createRunLoop } from "@jgengine/core/run/runLoop";\ncreateRunLoop();\n');
    expect(gameAdoption(root, "demo", deriveLedger(root))).toEqual(["run-loop"]);
  });

  test("proof: a game that does not import it does not adopt it", () => {
    const root = checkout("export const nothing = 1;\n");
    expect(gameAdoption(root, "demo", deriveLedger(root))).toEqual([]);
  });

  test("readGames pairs each game's written answers with its read adoption", () => {
    const root = checkout('import { createRunLoop } from "@jgengine/core/run/runLoop";\n', {
      name: "Demo",
      id: "demo",
      engine: ["core"],
      capabilities: { probes: { "@jgengine/core/run/runLoop": ["run"] } },
    });
    expect(readGames(root, deriveLedger(root))).toEqual([
      { game: "demo", adopts: ["run-loop"], declaration: { probes: { "@jgengine/core/run/runLoop": ["run"] } } },
    ]);
  });

  test("the audio config counts as adopting the audio probe, shorthand included", () => {
    const withAudio: Ledger = {
      ...ledger,
      capabilities: ledger.capabilities.filter((entry) => entry.id === "audio-probe"),
    };
    for (const source of [
      "export default defineGame({ name: 'x', audio: { master: 1 } });\n",
      "export default defineGame({ name: 'x', audio: sounds });\n",
      "export default defineGame({ name: 'x', world, audio, physics });\n",
    ]) {
      expect(gameAdoption(checkout(source), "demo", withAudio)).toEqual(["audio-probe"]);
    }
    expect(gameAdoption(checkout("export default defineGame({ name: 'x', audio: false });\n"), "demo", withAudio)).toEqual([]);
  });
});

describe("summary table", () => {
  test("prints one row per game with verified, declared and debt counts", () => {
    const report = checkDeclarations(ledger, [
      game("ember", ["mission-runtime"], owesAudio()),
      game("harbor", ["run-loop", "audio-probe"]),
    ]);
    const table = renderSummary(report, ledger);
    expect(table).toContain("3 capabilities, 2 game-facing");
    expect(table).toMatch(/ember\s+1\s+0\s+1/);
    expect(table).toMatch(/harbor\s+0\s+2\s+0/);
    expect(table).toMatch(/TOTAL\s+1\s+2\s+1/);
    expect(table).toContain("1 entry across 1 game(s)");
  });
});

describe("probe and ledger helpers", () => {
  test("a newly shipped capability makes the checked ledger stale", () => {
    const installed: Ledger = {
      ...ledger,
      capabilities: [
        ...ledger.capabilities,
        {
          id: "traffic",
          packages: ["@jgengine/core"],
          module: "@jgengine/core/nav/traffic",
          gameFacing: true,
          probe: { kind: "devtools" },
          intent: "drive traffic",
        },
      ],
    };
    const drift = ledgerDrift(ledger, installed);
    expect(drift).toEqual(['added "traffic" (@jgengine/core/nav/traffic)']);
    expect(ledgerDrift(ledger, ledger)).toEqual([]);
  });

  test("wildcards match live devtools probe keys; dots and dashes are literal", () => {
    expect(probeMatches("park.staff.*", ["park.staff.greeter", "park.staff.cleaner"])).toBe(true);
    expect(probeMatches("park.staff.*", ["park.guest.1"])).toBe(false);
    expect(probeMatches("ember-command campaign", ["ember-command campaign"])).toBe(true);
    expect(probeMatches("harbor.traffic", ["harborXtraffic"])).toBe(false);
  });

  test("proof: a probed claim still fails when the live counters are absent", () => {
    expect(windowProbeVerdict("__jgengineRun", undefined)).toContain("__jgengineRun is absent");
    expect(windowProbeVerdict("__jgengineRun", null)).toContain("__jgengineRun is absent");
    expect(windowProbeVerdict("__jgengineRun", {})).toContain("no live counters");
    expect(windowProbeVerdict("__jgengineRun", { error: "loop not installed" })).toContain("threw loop not installed");
    expect(windowProbeVerdict("__jgengineAudio", { master: Number.NaN })).toContain("no live counters");
    expect(windowProbeVerdict("__jgengineRun", { run: 2, carried: 80, banked: 200, lost: 0, best: 200 })).toBeNull();
    expect(windowProbeVerdict("__jgengineAudio", { rms: 0, peak: 0, master: 0.8 })).toBeNull();
  });

  test("the boot probe waits on game frames after mount, not on the clock", () => {
    const limits = { settleFrames: 300, mountMs: 300_000 };
    expect(probeGivesUp({ startedAt: 0, now: 240_000, framesSinceMount: null }, limits)).toBe(false);
    expect(probeGivesUp({ startedAt: 0, now: 90_000, framesSinceMount: 40 }, limits)).toBe(false);
    expect(probeGivesUp({ startedAt: 0, now: 20_000, framesSinceMount: 300 }, limits)).toBe(true);
    expect(probeGivesUp({ startedAt: 0, now: 300_000, framesSinceMount: null }, limits)).toBe(true);
    expect(probeGivesUp({ startedAt: 0, now: 5_000, framesSinceMount: null, crashedBeforeMount: true }, limits)).toBe(true);
    expect(probeGivesUp({ startedAt: 0, now: 5_000, framesSinceMount: 10, crashedBeforeMount: true }, limits)).toBe(false);
  });
});

// --- the check as a command: exit codes and what the output names --------------------------------

const roots: string[] = [];
afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function fixture(committed: Ledger = ledger): string {
  const root = mkdtempSync(join(tmpdir(), "jg-capability-check-"));
  roots.push(root);
  writeFileSync(join(root, "capabilities.json"), `${JSON.stringify(committed, null, 2)}\n`);
  return root;
}

function capture(): { sink: Sink; lines: string[]; errors: string[] } {
  const lines: string[] = [];
  const errors: string[] = [];
  return {
    sink: { log: (message) => lines.push(message), error: (message) => errors.push(message) },
    lines,
    errors,
  };
}

const indebted = (): GameDeclaration[] => [game("ember", ["mission-runtime"], owesAudio()), game("harbour", [])];

describe("the check command", () => {
  test("clean answers pass with the counts on one line, no network and no budget file", () => {
    const root = fixture();
    const { sink, lines, errors } = capture();
    expect(runCheck({ root, argv: ["--no-ledger"], sink, games: indebted() })).toBe(0);
    expect(errors).toEqual([]);
    expect(lines.at(-1)).toBe("capability check: OK - 2 games, 2 game-facing capabilities, 1 adopted (verified), 0 adopted (declared), 1 debt");
  });

  test("a wrong answer fails with the game and the entry", () => {
    const root = fixture();
    const { sink, errors } = capture();
    const games = [game("ember", ["mission-runtime", "audio-probe"], owesAudio())];
    expect(runCheck({ root, argv: ["--no-ledger"], sink, games })).toBe(1);
    expect(errors.join("\n")).toContain('ember records debt on "audio-probe"');
    expect(errors.join("\n")).toContain("the debt is paid");
  });

  test("a stale ledger fails and names the generating command", () => {
    const extended: Ledger = {
      ...ledger,
      capabilities: [
        ...ledger.capabilities,
        {
          id: "traffic",
          packages: ["@jgengine/core"],
          module: "@jgengine/core/nav/traffic",
          gameFacing: true,
          probe: { kind: "devtools" },
          intent: "drive traffic",
        },
      ],
    };
    const root = fixture();
    const before = capture();
    expect(runCheck({ root, argv: [], sink: before.sink, installed: extended, games: indebted() })).toBe(1);
    const output = before.errors.join("\n");
    expect(output).toContain('added "traffic"');
    expect(output).toContain("bun run gen games-ledger");

    // After the ledger catches up, no game owes an answer for it: the new capability passes.
    const synced = fixture(extended);
    const after = capture();
    expect(runCheck({ root: synced, argv: [], sink: after.sink, installed: extended, games: indebted() })).toBe(0);
  });

  test("a missing ledger fails before anything else", () => {
    const root = mkdtempSync(join(tmpdir(), "jg-capability-noledger-"));
    roots.push(root);
    const { sink, errors } = capture();
    expect(runCheck({ root, argv: ["--no-ledger"], sink, games: [] })).toBe(1);
    expect(errors[0]).toContain("capabilities.json is missing");
  });
});

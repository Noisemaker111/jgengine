import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DEBT_REASON_MIN,
  checkDeclarations,
  deriveLedger,
  gameAdoption,
  ledgerDrift,
  namesDomain,
  probeGivesUp,
  probeMatches,
  readGames,
  renderSummary,
  windowProbeVerdict,
  type Declaration,
  type GameDeclaration,
  type IssueState,
  type Ledger,
} from "./capabilities";
import { runCheck, type Sink } from "./check-capabilities";
import { BUDGET_REL, buildBudget, parseBudget, renderTrend, type DebtBudget } from "./debt-budget";

const ledger: Ledger = {
  generatedBy: "test",
  gameFacingRule: "probed capabilities only",
  capabilities: [
    {
      id: "mission-runtime",
      packages: ["@jgengine/core"],
      module: "@jgengine/core/mission/mission",
      domain: "mission runtime",
      gameFacing: true,
      probe: { kind: "devtools" },
      intent: "run missions",
    },
    {
      id: "audio-probe",
      packages: ["@jgengine/shell"],
      module: "@jgengine/core/audio/audioProbe.view",
      domain: "audio mix",
      gameFacing: true,
      probe: { kind: "window", global: "__jgengineAudio" },
      intent: "read the mix",
    },
    {
      id: "run-loop",
      packages: ["@jgengine/core"],
      module: "@jgengine/core/run/runLoop",
      domain: "run",
      gameFacing: false,
      probe: null,
      intent: "bank or lose what a run carries",
    },
  ],
};

const OPEN = new Map<number, IssueState>([
  [101, { state: "open" }],
  [102, { state: "closed" }],
]);

const debtReason = "The shared audio mix is not adopted here yet; buses are wired by hand.";

/** One game: what its source imports (`adopts`) and what it wrote (`declaration`). */
const game = (name: string, adopts: string[], declaration: Declaration | null = null): GameDeclaration => ({
  game: name,
  adopts,
  declaration,
});

const probed: Declaration = { probes: { "@jgengine/core/mission/mission": ["campaign"] } };
/** `issue: null` writes the entry with no owner. */
const owesAudio = (reason = debtReason, issue: number | null = 101): Declaration => ({
  ...probed,
  debt: { "audio-probe": issue === null ? ({ reason } as { reason: string; issue: number }) : { reason, issue } },
});

describe("adoption is read, not written", () => {
  test("a game that writes nothing passes: there is nothing to decline", () => {
    const report = checkDeclarations(ledger, [game("ember", ["run-loop"])], OPEN);
    expect(report.problems).toEqual([]);
    expect(report.adopted).toBe(1);
    expect(report.debt).toBe(0);
  });

  test("an adopted capability with its probe named is verified", () => {
    const report = checkDeclarations(ledger, [game("ember", ["mission-runtime"], probed)], OPEN);
    expect(report.problems).toEqual([]);
    expect(report.verified).toBe(1);
    expect(report.declared).toBe(0);
    expect(report.declarationLevel).toEqual([]);
  });

  test("a probe-capable adoption with no probe named is listed; a probe-less one only counts", () => {
    const report = checkDeclarations(ledger, [game("ember", ["mission-runtime", "run-loop"])], OPEN);
    expect(report.problems).toEqual([]);
    expect(report.adopted).toBe(2);
    expect(report.declared).toBe(2);
    expect(report.declarationLevel).toEqual([
      { game: "ember", capability: "mission-runtime", module: "@jgengine/core/mission/mission" },
    ]);
    expect(report.tallies[0]).toEqual({ game: "ember", adopted: 2, verified: 0, declared: 2, debt: 0 });
  });

  test("a boot probe for a module the game does not import fails", () => {
    const report = checkDeclarations(ledger, [game("ember", ["audio-probe"], probed)], OPEN);
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]!.message).toContain("imports none of that module's capabilities");
  });

  test("a boot probe for an unknown module fails", () => {
    const report = checkDeclarations(ledger, [game("ember", [], { probes: { "@jgengine/core/nope": ["x"] } })], OPEN);
    expect(report.problems[0]!.message).toContain('unknown module "@jgengine/core/nope"');
  });
});

describe("debt entries", () => {
  test("debt against an open issue passes and counts", () => {
    const report = checkDeclarations(ledger, [game("ember", ["mission-runtime"], owesAudio())], OPEN);
    expect(report.problems).toEqual([]);
    expect(report.debt).toBe(1);
    expect(report.debtEntries).toEqual([{ game: "ember", capability: "audio-probe", issue: 101 }]);
  });

  test("debt on a capability the source imports is paid and fails until removed", () => {
    const report = checkDeclarations(ledger, [game("ember", ["mission-runtime", "audio-probe"], owesAudio())], OPEN);
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]!.message).toContain("the debt is paid");
  });

  test("debt on an unknown id fails", () => {
    const report = checkDeclarations(
      ledger,
      [game("ember", [], { debt: { "no-such-system": { reason: debtReason, issue: 101 } } })],
      OPEN,
    );
    expect(report.problems[0]!.message).toContain("not a capability in capabilities.json");
  });

  test("debt on a capability that ships no probe fails", () => {
    const report = checkDeclarations(
      ledger,
      [game("ember", [], { debt: { "run-loop": { reason: "The run is banked by hand at the gate.", issue: 101 } } })],
      OPEN,
    );
    expect(report.problems[0]!.message).toContain("ships no live probe");
  });

  test(`a reason under ${DEBT_REASON_MIN} characters fails and names the capability`, () => {
    const report = checkDeclarations(ledger, [game("ember", ["mission-runtime"], owesAudio("no audio mix"))], OPEN);
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]!.message).toContain("audio-probe");
    expect(report.problems[0]!.message).toContain("12-character reason");
  });

  test("a reason that does not name the domain fails", () => {
    const report = checkDeclarations(
      ledger,
      [game("ember", ["mission-runtime"], owesAudio("This game does its own thing with those, for now."))],
      OPEN,
    );
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]!.message).toContain("audio mix");
  });

  test("two games with the same reason are a template, not two answers", () => {
    const report = checkDeclarations(
      ledger,
      [game("ember", ["mission-runtime"], owesAudio()), game("harbor", ["mission-runtime"], owesAudio())],
      OPEN,
    );
    expect(report.problems).toHaveLength(2);
    expect(report.problems[0]!.message).toContain("same debt reason");
  });

  test("debt without an owner issue fails", () => {
    const report = checkDeclarations(ledger, [game("ember", ["mission-runtime"], owesAudio(debtReason, null))], OPEN);
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]!.message).toContain("no owner");
  });

  test("debt whose issue is closed fails", () => {
    const report = checkDeclarations(ledger, [game("ember", ["mission-runtime"], owesAudio(debtReason, 102))], OPEN);
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]!.message).toContain("is closed");
  });

  test("debt whose issue does not exist fails", () => {
    const report = checkDeclarations(
      ledger,
      [game("ember", ["mission-runtime"], owesAudio(debtReason, 999))],
      new Map([[999, { state: "missing" as const }]]),
    );
    expect(report.problems[0]!.message).toContain("does not have");
  });

  test("namesDomain accepts plural forms", () => {
    expect(namesDomain("Two mission runtimes would duplicate this.", "mission runtime")).toBe(true);
    expect(namesDomain("No such thing here.", "mission runtime")).toBe(false);
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
    const report = checkDeclarations(
      ledger,
      [game("ember", ["mission-runtime"], owesAudio()), game("harbor", ["run-loop", "audio-probe"])],
      OPEN,
    );
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
          domain: "traffic",
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

// --- the debt ratchet: budget file, --write and the summary trend line --------

const budget = (total: number, games: Record<string, number>, history: DebtBudget["history"] = []): DebtBudget => ({
  updated: "2026-10-23",
  total,
  games,
  history,
});

const roots: string[] = [];
afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function fixture(options: { committedBudget?: DebtBudget | null; ledger?: Ledger } = {}): string {
  const root = mkdtempSync(join(tmpdir(), "lane-debt-ratchet-"));
  roots.push(root);
  writeFileSync(join(root, "capabilities.json"), `${JSON.stringify(options.ledger ?? ledger, null, 2)}\n`);
  mkdirSync(join(root, "scripts"), { recursive: true });
  if (options.committedBudget !== null) {
    writeFileSync(join(root, BUDGET_REL), `${JSON.stringify(options.committedBudget ?? budget(0, {}), null, 2)}\n`);
  }
  return root;
}

const indebted = (): GameDeclaration[] => [game("ember", ["mission-runtime"], owesAudio()), game("harbour", [])];
const cleared = (): GameDeclaration[] => [game("ember", ["mission-runtime", "audio-probe"], probed), game("harbour", [])];

function capture(): { sink: Sink; lines: string[]; errors: string[] } {
  const lines: string[] = [];
  const errors: string[] = [];
  return {
    sink: { log: (message) => lines.push(message), error: (message) => errors.push(message) },
    lines,
    errors,
  };
}

describe("debt ratchet", () => {
  test("proof 1: debt above the budget fails with the game, entry and issue to clear first", () => {
    const root = fixture();
    const { sink, errors } = capture();
    expect(runCheck({ root, argv: ["--no-ledger"], sink, readIssues: () => OPEN, games: indebted() })).toBe(1);
    const output = errors.join("\n");
    expect(output).toContain("debt is above its budget");
    expect(output).toContain("ember: 1 debt entry, budget 0 - 1 over; clear #101 (audio-probe) first");
  });

  test("proof 2: a budget above the tally is stale and fails", () => {
    const root = fixture({ committedBudget: budget(2, { ember: 2 }) });
    const { sink, errors } = capture();
    expect(runCheck({ root, argv: ["--no-ledger"], sink, readIssues: () => OPEN, games: indebted() })).toBe(1);
    const output = errors.join("\n");
    expect(output).toContain("debt budget is above the tally");
    expect(output).toContain("ember: budget 2, tally 1");
    expect(output).toContain("total: budget 2, tally 1");
    expect(output).toContain("run bun run check games-capabilities --write");
  });

  test("proof 3: adopting pays the debt; with the budget lowered it passes and the trend keeps the old number", () => {
    const root = fixture({ committedBudget: budget(1, { ember: 1 }) });
    const stale = capture();
    expect(runCheck({ root, argv: ["--no-ledger"], sink: stale.sink, readIssues: () => OPEN, games: cleared() })).toBe(1);
    expect(stale.errors.join("\n")).toContain("ember: budget 1, tally 0");

    const write = capture();
    const code = runCheck({
      root,
      argv: ["--no-ledger", "--write"],
      sink: write.sink,
      readIssues: () => OPEN,
      today: "2026-10-24",
      games: cleared(),
    });
    expect(code).toBe(0);
    expect(write.lines.join("\n")).toContain("debt budget: 1 -> 0");
    expect(JSON.parse(readFileSync(join(root, BUDGET_REL), "utf8"))).toEqual({
      updated: "2026-10-24",
      total: 0,
      games: { ember: 0, harbour: 0 },
      history: [{ total: 1, on: "2026-10-23" }],
    });

    const pass = capture();
    expect(
      runCheck({ root, argv: ["--no-ledger", "--summary"], sink: pass.sink, readIssues: () => OPEN, games: cleared() }),
    ).toBe(0);
    expect(pass.lines).toContain("debt: 0 (budget 0, was 1 on 2026-10-23)");
  });

  test("--write refuses to raise the budget when debt arrived", () => {
    const root = fixture();
    const { sink, errors } = capture();
    expect(runCheck({ root, argv: ["--no-ledger", "--write"], sink, readIssues: () => OPEN, games: indebted() })).toBe(1);
    expect(errors.join("\n")).toContain("--write will not raise");
    expect(JSON.parse(readFileSync(join(root, BUDGET_REL), "utf8"))).toEqual(budget(0, {}));
  });

  test("proof 4: a stale ledger fails and names the generating command", () => {
    const extended: Ledger = {
      ...ledger,
      capabilities: [
        ...ledger.capabilities,
        {
          id: "traffic",
          packages: ["@jgengine/core"],
          module: "@jgengine/core/nav/traffic",
          domain: "traffic",
          gameFacing: true,
          probe: { kind: "devtools" },
          intent: "drive traffic",
        },
      ],
    };
    const root = fixture({ committedBudget: budget(1, { ember: 1 }) });
    const before = capture();
    expect(
      runCheck({ root, argv: [], sink: before.sink, readIssues: () => OPEN, installed: extended, games: indebted() }),
    ).toBe(1);
    const output = before.errors.join("\n");
    expect(output).toContain('added "traffic"');
    expect(output).toContain("bun run gen games-ledger");

    // After the ledger catches up, no game owes an answer for it: the new capability passes.
    const synced = fixture({ committedBudget: budget(1, { ember: 1 }), ledger: extended });
    const after = capture();
    expect(runCheck({ root: synced, argv: ["--no-ledger"], sink: after.sink, readIssues: () => OPEN, games: indebted() })).toBe(0);
  });

  test("a missing budget file fails until --write seeds it", () => {
    const root = fixture({ committedBudget: null });
    const missing = capture();
    expect(runCheck({ root, argv: ["--no-ledger"], sink: missing.sink, readIssues: () => OPEN, games: cleared() })).toBe(1);
    expect(missing.errors.join("\n")).toContain(`${BUDGET_REL} is missing`);

    const write = capture();
    expect(
      runCheck({
        root,
        argv: ["--no-ledger", "--write"],
        sink: write.sink,
        readIssues: () => OPEN,
        today: "2026-10-23",
        games: cleared(),
      }),
    ).toBe(0);
    expect(JSON.parse(readFileSync(join(root, BUDGET_REL), "utf8"))).toMatchObject({ total: 0, games: { ember: 0 } });
  });
});

describe("budget file", () => {
  test("a total that does not equal its per-game budgets is refused", () => {
    expect(() => parseBudget(JSON.stringify(budget(3, { ember: 1 })))).toThrow("add up to 1");
  });

  test("a negative or fractional ceiling is refused", () => {
    expect(() => parseBudget(JSON.stringify(budget(-1, { ember: -1 })))).toThrow("whole number");
    expect(() => parseBudget(JSON.stringify(budget(1.5, { ember: 1.5 })))).toThrow("whole number");
  });

  test("the trend line is one line and keeps the previous total and date", () => {
    expect(renderTrend(43, budget(43, { ember: 43 }, [{ total: 50, on: "2026-10-16" }]))).toBe(
      "debt: 43 (budget 43, was 50 on 2026-10-16)",
    );
    expect(renderTrend(43, budget(43, { ember: 43 }))).toBe("debt: 43 (budget 43, no earlier budget)");
  });

  test("buildBudget records the old total in history only when it changes", () => {
    const tallies = [{ game: "ember", debt: 2 }, { game: "harbour", debt: 0 }];
    expect(buildBudget(budget(3, { ember: 3, harbour: 0 }), tallies, "2026-10-24")).toEqual({
      updated: "2026-10-24",
      total: 2,
      games: { ember: 2, harbour: 0 },
      history: [{ total: 3, on: "2026-10-23" }],
    });
    expect(buildBudget(budget(2, { ember: 2, harbour: 0 }), tallies, "2026-10-24").history).toEqual([]);
  });
});

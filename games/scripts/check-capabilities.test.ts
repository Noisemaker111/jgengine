import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DECLINE_MIN,
  checkDeclarations,
  deriveLedger,
  ledgerDrift,
  namesDomain,
  probeGivesUp,
  probeMatches,
  renderSummary,
  seedDeclaration,
  windowProbeVerdict,
  type Declaration,
  type IssueState,
  type Ledger,
} from "./capabilities";
import { gamesToDecide, runCheck, type Sink } from "./check-capabilities";
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
      module: "@jgengine/shell/audio/audioProbe",
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

const declaration = (overrides: Partial<Declaration> = {}): Declaration => ({
  adopts: ["mission-runtime"],
  probes: { "@jgengine/core/mission/mission": ["campaign"] },
  declines: {
    "audio-probe": {
      kind: "not-applicable",
      reason: "No audio mix is published: this game ships synth-free silence.",
    },
  },
  ...overrides,
});

describe("missing declaration", () => {
  test("a game-facing capability nobody declared fails and names game, capability and module", () => {
    const report = checkDeclarations(ledger, [
      { game: "ember", declaration: declaration({ adopts: [], probes: {}, declines: {} }) },
    ]);
    expect(report.problems).toHaveLength(2);
    expect(report.problems[0]!.message).toContain("ember");
    expect(report.problems[0]!.message).toContain("mission-runtime");
    expect(report.problems[0]!.message).toContain("@jgengine/core/mission/mission");
    expect(report.problems[0]!.message).toContain("adopt it");
    expect(report.problems[0]!.message).toContain("decline");
  });

  test("a complete declaration passes", () => {
    const report = checkDeclarations(ledger, [{ game: "ember", declaration: declaration() }], OPEN);
    expect(report.problems).toEqual([]);
    expect(report.adopted).toBe(1);
    expect(report.verified).toBe(1);
    expect(report.declared).toBe(0);
    expect(report.notApplicable).toBe(1);
    expect(report.debt).toBe(0);
  });

  test("a missing declaration file fails with the generating command", () => {
    const report = checkDeclarations(ledger, [{ game: "ember", declaration: null }]);
    expect(report.problems[0]!.message).toContain("ember/capabilities.json is missing");
    expect(report.problems[0]!.message).toContain("games:capabilities declare");
  });
});

describe("decline kinds", () => {
  test("the old boilerplate sentence is rejected even at 20+ characters", () => {
    const report = checkDeclarations(ledger, [
      {
        game: "ember",
        declaration: declaration({
          declines: {
            "audio-probe": {
              kind: "not-applicable",
              reason: "Not adopted: this game does not run the engine audio-probe system.",
            },
          },
        }),
      },
    ], OPEN);
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]!.message).toContain("ember declines");
    expect(report.problems[0]!.message).toContain("Not adopted");
  });

  test("a reason that does not name the domain fails", () => {
    const report = checkDeclarations(ledger, [
      {
        game: "ember",
        declaration: declaration({
          declines: { "audio-probe": { kind: "not-applicable", reason: "This game does not need one of those." } },
        }),
      },
    ], OPEN);
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]!.message).toContain("audio mix");
  });

  test("a bare string decline is rejected as ambiguous", () => {
    const report = checkDeclarations(ledger, [
      {
        game: "ember",
        declaration: declaration({
          declines: { "audio-probe": "No audio mix is published here." as unknown as Declaration["declines"][string] },
        }),
      },
    ], OPEN);
    expect(report.problems[0]!.message).toContain('{"kind"');
  });

  test(`a reason under ${DECLINE_MIN} characters fails and names the capability`, () => {
    const report = checkDeclarations(ledger, [
      {
        game: "ember",
        declaration: declaration({
          declines: { "audio-probe": { kind: "not-applicable", reason: "no audio" } },
        }),
      },
    ], OPEN);
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]!.message).toContain("ember declines");
    expect(report.problems[0]!.message).toContain("audio-probe");
    expect(report.problems[0]!.message).toContain("8-character reason");
    expect(report.problems[0]!.message).toContain(`${DECLINE_MIN}+ characters`);
  });

  test("two games with the same reason are a template, not two answers", () => {
    const reason = "No audio mix: this game has no sounds at all.";
    const report = checkDeclarations(ledger, [
      { game: "ember", declaration: declaration({ declines: { "audio-probe": { kind: "not-applicable", reason } } }) },
      { game: "harbor", declaration: declaration({ declines: { "audio-probe": { kind: "not-applicable", reason } } }) },
    ], OPEN);
    expect(report.problems).toHaveLength(2);
    expect(report.problems[0]!.message).toContain("same decline reason");
  });

  test("a not-applicable entry carrying an issue fails", () => {
    const report = checkDeclarations(ledger, [
      {
        game: "ember",
        declaration: declaration({
          declines: {
            "audio-probe": { kind: "not-applicable", reason: "No audio mix is published here.", issue: 101 },
          },
        }),
      },
    ], OPEN);
    expect(report.problems[0]!.message).toContain("not-applicable but names issue");
  });

  test("namesDomain accepts plural forms", () => {
    expect(namesDomain("Two mission runtimes would duplicate this.", "mission runtime")).toBe(true);
    expect(namesDomain("No such thing here.", "mission runtime")).toBe(false);
  });
});

describe("adoption without a probe", () => {
  test("proof: a capability with no probe can be adopted, and counts as declared", () => {
    const report = checkDeclarations(ledger, [
      {
        game: "ember",
        declaration: declaration({
          adopts: ["mission-runtime", "run-loop"],
          probes: { "@jgengine/core/mission/mission": ["campaign"] },
        }),
      },
    ], OPEN);
    expect(report.problems).toEqual([]);
    expect(report.adopted).toBe(2);
    expect(report.verified).toBe(1);
    expect(report.declared).toBe(1);
    expect(report.tallies[0]).toEqual({
      game: "ember",
      adopted: 2,
      verified: 1,
      declared: 1,
      notApplicable: 1,
      debt: 0,
    });
    expect(report.declarationLevel).toEqual([
      { game: "ember", capability: "run-loop", module: "@jgengine/core/run/runLoop" },
    ]);
  });

  test("a probed capability adopted with its probe named is verified, not declared", () => {
    const report = checkDeclarations(ledger, [{ game: "ember", declaration: declaration() }], OPEN);
    expect(report.verified).toBe(1);
    expect(report.declared).toBe(0);
    expect(report.declarationLevel).toEqual([]);
  });

  test("proof: a probed claim still fails when the live counters are absent", () => {
    // The declaration names the global, but the page answers nothing: `bun run games:capabilities probe` fails it.
    expect(windowProbeVerdict("__jgengineRun", undefined)).toContain("__jgengineRun is absent");
    expect(windowProbeVerdict("__jgengineRun", null)).toContain("__jgengineRun is absent");
    expect(windowProbeVerdict("__jgengineRun", {})).toContain("no live counters");
    expect(windowProbeVerdict("__jgengineRun", { error: "loop not installed" })).toContain("threw loop not installed");
    expect(windowProbeVerdict("__jgengineAudio", { master: Number.NaN })).toContain("no live counters");
    // A live readout passes, with the counters the probe prints.
    expect(windowProbeVerdict("__jgengineRun", { run: 2, carried: 80, banked: 200, lost: 0, best: 200 })).toBeNull();
    expect(windowProbeVerdict("__jgengineAudio", { rms: 0, peak: 0, master: 0.8 })).toBeNull();
  });

  test("the boot probe waits on game frames after mount, not on the clock", () => {
    const limits = { settleFrames: 300, mountMs: 300_000 };
    // Under load the game mounts four minutes in: not given up, however long that took.
    expect(probeGivesUp({ startedAt: 0, now: 240_000, framesSinceMount: null }, limits)).toBe(false);
    // Mounted and slow: 90 s of wall time but only 40 frames drawn, so a late readout is still awaited.
    expect(probeGivesUp({ startedAt: 0, now: 90_000, framesSinceMount: 40 }, limits)).toBe(false);
    // 300 frames after mount with the readout still missing: absent, on any machine.
    expect(probeGivesUp({ startedAt: 0, now: 20_000, framesSinceMount: 300 }, limits)).toBe(true);
    // A page that never mounts ends at the mount limit.
    expect(probeGivesUp({ startedAt: 0, now: 300_000, framesSinceMount: null }, limits)).toBe(true);
    // A page that threw before mounting will not mount: it stops at once instead of waiting out the limit.
    expect(probeGivesUp({ startedAt: 0, now: 5_000, framesSinceMount: null, crashedBeforeMount: true }, limits)).toBe(true);
    // An error after mount does not cut the frame wait short.
    expect(probeGivesUp({ startedAt: 0, now: 5_000, framesSinceMount: 10, crashedBeforeMount: true }, limits)).toBe(false);
  });

  test("an id the ledger does not carry is still refused as an adoption", () => {
    const report = checkDeclarations(ledger, [
      { game: "ember", declaration: declaration({ adopts: ["mission-runtime", "no-such-system"] }) },
    ], OPEN);
    expect(report.problems.some((problem) => problem.message.includes("not a capability in capabilities.json"))).toBe(true);
  });
});

describe("recording an adoption", () => {
  const trees: string[] = [];
  afterEach(() => {
    for (const root of trees.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  /** A checkout with one installed probe-less capability and one game that imports it. */
  function checkout(): string {
    const repo = mkdtempSync(join(tmpdir(), "jg-capability-seed-"));
    trees.push(repo);
    const root = join(repo, "games");
    const pkg = join(root, "..", "packages", "core");
    mkdirSync(join(pkg, "src", "run"), { recursive: true });
    writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "@jgengine/core", version: "1.0.0" }));
    writeFileSync(
      join(pkg, "src", "run", "runLoop.ts"),
      "/** @capability run-loop Bank or lose what a run carries */\nexport function createRunLoop(): void {}\n",
    );
    const game = join(root, "demo");
    mkdirSync(join(game, "src"), { recursive: true });
    writeFileSync(join(game, "package.json"), JSON.stringify({ name: "@games/demo" }));
    writeFileSync(join(game, "src", "game.config.ts"), "export const config = {};\n");
    writeFileSync(join(game, "src", "loop.ts"), 'import { createRunLoop } from "@jgengine/core/run/runLoop";\ncreateRunLoop();\n');
    return root;
  }

  test("a capability with no probe is seeded as adopted when the game imports it", () => {
    const root = checkout();
    const seeded = seedDeclaration(root, "demo", deriveLedger(root));
    expect(seeded.adopts).toEqual(["run-loop"]);
    expect(seeded.declines).toEqual({});
  });

  test("the seeded declaration then passes the gate as adopted (declared), not refused", () => {
    const root = checkout();
    const installed = deriveLedger(root);
    const seeded = seedDeclaration(root, "demo", installed);
    const report = checkDeclarations(installed, [{ game: "demo", declaration: seeded }]);
    expect(report.problems).toEqual([]);
    expect(report.declared).toBe(1);
    expect(report.verified).toBe(0);
  });

  test("a game-facing capability the game does not import is still a TODO decline", () => {
    const root = checkout();
    const withProbe = deriveLedger(root);
    withProbe.capabilities.push({
      id: "audio-probe",
      packages: ["@jgengine/shell"],
      module: "@jgengine/shell/audio/audioProbe",
      domain: "audio mix",
      gameFacing: true,
      probe: { kind: "window", global: "__jgengineAudio" },
      intent: "read the mix",
    });
    const seeded = seedDeclaration(root, "demo", withProbe);
    expect(seeded.adopts).toEqual(["run-loop"]);
    expect(Object.keys(seeded.declines)).toEqual(["audio-probe"]);
  });
});

describe("debt ownership", () => {
  const debtReason = "We have not adopted the shared audio mix; buses are wired by hand.";

  test("debt without an owner issue fails", () => {
    const report = checkDeclarations(ledger, [
      { game: "ember", declaration: declaration({ declines: { "audio-probe": { kind: "debt", reason: debtReason } } }) },
    ], OPEN);
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]!.message).toContain("no owner");
  });

  test("debt whose issue is closed fails", () => {
    const report = checkDeclarations(ledger, [
      {
        game: "ember",
        declaration: declaration({ declines: { "audio-probe": { kind: "debt", reason: debtReason, issue: 102 } } }),
      },
    ], OPEN);
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]!.message).toContain("is closed");
  });

  test("debt whose issue does not exist fails", () => {
    const report = checkDeclarations(ledger, [
      {
        game: "ember",
        declaration: declaration({ declines: { "audio-probe": { kind: "debt", reason: debtReason, issue: 999 } } }),
      },
    ], new Map([[999, { state: "missing" as const }]]));
    expect(report.problems[0]!.message).toContain("does not have");
  });

  test("debt against an open issue passes and counts as debt", () => {
    const report = checkDeclarations(ledger, [
      {
        game: "ember",
        declaration: declaration({ declines: { "audio-probe": { kind: "debt", reason: debtReason, issue: 101 } } }),
      },
    ], OPEN);
    expect(report.problems).toEqual([]);
    expect(report.debt).toBe(1);
    expect(report.notApplicable).toBe(0);
    expect(report.debtEntries).toEqual([{ game: "ember", capability: "audio-probe", issue: 101 }]);
  });

  test("a correct pair passes: one domain absent, one gap owned by an open issue", () => {
    const report = checkDeclarations(ledger, [
      {
        game: "ember",
        declaration: declaration({
          declines: {
            "audio-probe": { kind: "debt", reason: debtReason, issue: 101 },
            "mission-runtime": {
              kind: "not-applicable",
              reason: "No mission runtime: this game has one endless skirmish and no objectives.",
            },
          },
          adopts: [],
          probes: {},
        }),
      },
    ], OPEN);
    expect(report.problems).toEqual([]);
    expect(report.tallies).toEqual([{ game: "ember", adopted: 0, verified: 0, declared: 0, notApplicable: 1, debt: 1 }]);
  });
});

describe("summary table", () => {
  test("prints one row per game with adopted, not-applicable and debt counts", () => {
    const report = checkDeclarations(ledger, [
      {
        game: "ember",
        declaration: declaration({
          declines: {
            "audio-probe": { kind: "debt", reason: "The shared audio mix is not adopted here yet.", issue: 101 },
          },
        }),
      },
      {
        game: "harbor",
        declaration: declaration({
          adopts: [],
          probes: {},
          declines: {
            "mission-runtime": { kind: "not-applicable", reason: "No mission runtime: courier routes have no objectives." },
            "audio-probe": { kind: "not-applicable", reason: "No audio mix is published in this game either." },
          },
        }),
      },
    ], OPEN);
    const table = renderSummary(report, ledger);
    expect(table).toContain("capability adoption - 2 game-facing capabilities");
    expect(table).toContain("adopt (verified)");
    expect(table).toContain("adopt (declared)");
    expect(table).toContain("ember");
    expect(table).toContain("harbor");
    expect(table).toContain("TOTAL");
    expect(table).toMatch(/ember\s+1\s+0\s+0\s+1/);
    expect(table).toMatch(/harbor\s+0\s+0\s+2\s+0/);
    expect(table).toMatch(/TOTAL\s+1\s+0\s+2\s+1/);
    expect(table).toContain("1 entry across 1 game(s)");
  });

  test("a declared-only adoption sits in its own column, apart from a verified one", () => {
    const report = checkDeclarations(ledger, [
      {
        game: "ember",
        declaration: declaration({
          adopts: ["mission-runtime", "run-loop"],
          probes: { "@jgengine/core/mission/mission": ["campaign"] },
        }),
      },
    ], OPEN);
    const table = renderSummary(report, ledger);
    expect(table).toMatch(/ember\s+1\s+1\s+1\s+0/);
  });
});

describe("stale ledger", () => {
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
    expect(drift).toHaveLength(1);
    expect(drift[0]).toContain('added "traffic"');
    expect(drift[0]).toContain("@jgengine/core/nav/traffic");
    expect(drift[0]).toContain("no game declares it yet");
  });

  test("a matching ledger is fresh", () => {
    expect(ledgerDrift(ledger, ledger)).toEqual([]);
  });

});

describe("probe expectations", () => {
  test("wildcards match live devtools probe keys", () => {
    expect(probeMatches("park.staff.*", ["park.staff.greeter", "park.staff.cleaner"])).toBe(true);
    expect(probeMatches("park.staff.*", ["park.guest.1"])).toBe(false);
    expect(probeMatches("ember-command campaign", ["ember-command campaign"])).toBe(true);
  });

  test("dots and dashes are literal", () => {
    expect(probeMatches("harbor.traffic", ["harborXtraffic"])).toBe(false);
  });

  test("an adopted capability with no probe is reported as declaration-level", () => {
    const report = checkDeclarations(ledger, [
      { game: "ember", declaration: declaration({ probes: {} }) },
    ], OPEN);
    expect(report.problems).toEqual([]);
    expect(report.declarationLevel).toEqual([
      { game: "ember", capability: "mission-runtime", module: "@jgengine/core/mission/mission" },
    ]);
  });

  test("a probe for a module the game does not adopt fails", () => {
    const report = checkDeclarations(ledger, [
      {
        game: "ember",
        declaration: declaration({
          adopts: ["audio-probe"],
          probes: { "@jgengine/core/mission/mission": ["campaign"] },
        }),
      },
    ], OPEN);
    expect(report.problems.some((problem) => problem.message.includes("adopts none of its capabilities"))).toBe(true);
  });
});

// --- the debt ratchet: budget file, --write and the summary trend line --------

const debtReason = "The shared audio mix is not adopted here yet; buses are wired by hand.";

const debtDeclaration = (): Declaration =>
  declaration({ declines: { "audio-probe": { kind: "debt", reason: debtReason, issue: 101 } } });

const clearedDeclaration = (): Declaration =>
  declaration({
    declines: { "audio-probe": { kind: "not-applicable", reason: "No audio mix is published: this game is silent." } },
  });

const harbourDeclaration = (): Declaration => ({
  adopts: [],
  probes: {},
  declines: {
    "mission-runtime": { kind: "not-applicable", reason: "No mission runtime: courier routes carry no objectives." },
    "audio-probe": { kind: "not-applicable", reason: "No audio mix: this game never plays a sound." },
  },
});

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

function fixture(options: {
  games: Record<string, Declaration>;
  committedBudget?: DebtBudget | null;
  ledger?: Ledger;
}): string {
  const root = mkdtempSync(join(tmpdir(), "lane-debt-ratchet-"));
  roots.push(root);
  writeFileSync(join(root, "capabilities.json"), `${JSON.stringify(options.ledger ?? ledger, null, 2)}\n`);
  mkdirSync(join(root, "scripts"), { recursive: true });
  if (options.committedBudget !== null) {
    writeFileSync(
      join(root, BUDGET_REL),
      `${JSON.stringify(options.committedBudget ?? budget(0, {}), null, 2)}\n`,
    );
  }
  for (const [game, declaration] of Object.entries(options.games)) {
    mkdirSync(join(root, game, "src"), { recursive: true });
    writeFileSync(join(root, game, "package.json"), `${JSON.stringify({ name: `@games/${game}` })}\n`);
    writeFileSync(join(root, game, "src", "game.config.ts"), "export {};\n");
    writeFileSync(join(root, game, "capabilities.json"), `${JSON.stringify(declaration, null, 2)}\n`);
  }
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

describe("debt ratchet", () => {
  test("proof 1: debt above the budget fails with the game, entry and issue to clear first", () => {
    const root = fixture({ games: { ember: debtDeclaration(), harbour: harbourDeclaration() } });
    const { sink, errors } = capture();
    const code = runCheck({ root, argv: ["--no-ledger"], sink, readIssues: () => OPEN });
    expect(code).toBe(1);
    const output = errors.join("\n");
    expect(output).toContain("debt is above its budget");
    expect(output).toContain("ember: 1 debt entry, budget 0 - 1 over; clear #101 (audio-probe) first");
  });

  test("proof 2: a budget above the tally is stale and fails", () => {
    const root = fixture({
      games: { ember: debtDeclaration(), harbour: harbourDeclaration() },
      committedBudget: budget(2, { ember: 2 }),
    });
    const { sink, errors } = capture();
    const code = runCheck({ root, argv: ["--no-ledger"], sink, readIssues: () => OPEN });
    expect(code).toBe(1);
    const output = errors.join("\n");
    expect(output).toContain("debt budget is above the tally");
    expect(output).toContain("ember: budget 2, tally 1");
    expect(output).toContain("total: budget 2, tally 1");
    expect(output).toContain("run bun run check games-capabilities --write");
  });

  test("proof 3: a cleared entry with the budget lowered passes, and the trend keeps the old number", () => {
    const root = fixture({
      games: { ember: clearedDeclaration(), harbour: harbourDeclaration() },
      committedBudget: budget(1, { ember: 1 }),
    });
    const stale = capture();
    expect(runCheck({ root, argv: ["--no-ledger"], sink: stale.sink, readIssues: () => OPEN })).toBe(1);
    expect(stale.errors.join("\n")).toContain("ember: budget 1, tally 0");

    const write = capture();
    const code = runCheck({
      root,
      argv: ["--no-ledger", "--write"],
      sink: write.sink,
      readIssues: () => OPEN,
      today: "2026-10-24",
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
    expect(runCheck({ root, argv: ["--no-ledger", "--summary"], sink: pass.sink, readIssues: () => OPEN })).toBe(0);
    expect(pass.lines).toContain("debt: 0 (budget 0, was 1 on 2026-10-23)");
  });

  test("--write refuses to raise the budget when debt arrived", () => {
    const root = fixture({ games: { ember: debtDeclaration(), harbour: harbourDeclaration() } });
    const { sink, errors } = capture();
    const code = runCheck({ root, argv: ["--no-ledger", "--write"], sink, readIssues: () => OPEN });
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("--write will not raise");
    expect(JSON.parse(readFileSync(join(root, BUDGET_REL), "utf8"))).toEqual(budget(0, {}));
  });

  test("proof 4: a new capability with no game decision fails, before and after the ledger sync", () => {
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
    const stale = fixture({
      games: { ember: debtDeclaration(), harbour: harbourDeclaration() },
      committedBudget: budget(1, { ember: 1 }),
    });
    const before = capture();
    expect(runCheck({ root: stale, argv: [], sink: before.sink, readIssues: () => OPEN, installed: extended })).toBe(1);
    const driftOutput = before.errors.join("\n");
    expect(driftOutput).toContain('added "traffic"');
    expect(driftOutput).toContain("Games that must decide before this can pass:");
    expect(driftOutput).toContain('"traffic" (@jgengine/core/nav/traffic): ember, harbour');

    // After `bun run gen games-ledger` the ledger knows the capability and every game
    // still owes the answer, which is the failure that must not be silent debt.
    const synced = fixture({
      games: { ember: debtDeclaration(), harbour: harbourDeclaration() },
      committedBudget: budget(1, { ember: 1 }),
      ledger: extended,
    });
    const after = capture();
    expect(runCheck({ root: synced, argv: ["--no-ledger"], sink: after.sink, readIssues: () => OPEN })).toBe(1);
    expect(after.errors.join("\n")).toContain('does not declare game-facing capability "traffic"');
  });

  test("gamesToDecide skips a game that already declined the new capability", () => {
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
    const decided: Declaration = {
      ...declaration(),
      declines: {
        ...declaration().declines,
        traffic: { kind: "not-applicable", reason: "No traffic: this game has no roads or vehicles." },
      },
    };
    expect(gamesToDecide(ledger, extended, [
      { game: "ember", declaration: decided },
      { game: "harbour", declaration: declaration() },
    ])).toEqual([{ capability: "traffic", module: "@jgengine/core/nav/traffic", games: ["harbour"] }]);
  });

  test("a missing budget file fails until --write seeds it", () => {
    const root = fixture({ games: { ember: clearedDeclaration(), harbour: harbourDeclaration() }, committedBudget: null });
    const missing = capture();
    expect(runCheck({ root, argv: ["--no-ledger"], sink: missing.sink, readIssues: () => OPEN })).toBe(1);
    expect(missing.errors.join("\n")).toContain(`${BUDGET_REL} is missing`);

    const write = capture();
    expect(
      runCheck({ root, argv: ["--no-ledger", "--write"], sink: write.sink, readIssues: () => OPEN, today: "2026-10-23" }),
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


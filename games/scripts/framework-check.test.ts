import { describe, expect, test } from "bun:test";

import { ENGINE_SEAMS, MIN_SYSTEM_LINES, codeLines, engineSeams, gameFiles, inspect, seamAdvice, stripComments } from "./framework-check";

/**
 * The rule this lane replaced: a basename substring plus any arrow function. It is kept here as the
 * before-state of the regression, so the fixture below proves the false positive was real.
 */
const OLD = {
  path: /(^|\/)(systems?|sim|simulation|gameplay|mechanics)\//i,
  name: /(mission|objective|quest|contract|economy|progression|inventory|loot|ability|abilities|talent|perk|damage|status|vehicle|traffic|wanted|heat|director|spawner|scheduler|pathfind|navigat|reputation|unlock)/i,
  logic: /export\s+(async\s+)?(function|class)\s|export\s+const\s+\w+\s*=\s*(async\s*)?\(|=>\s*\{/,
};

function oldRuleWouldFlag(path: string, source: string): boolean {
  return OLD.logic.test(source) && (OLD.path.test(path) || OLD.name.test(path.split("/").pop() ?? ""));
}

const read = (files: Record<string, string>) => async (path: string) => files[path] ?? "";

/** Real code lines until the fixture clears the system floor, so the floor is not what is under test. */
const pad = (source: string): string => {
  const lines: string[] = [source];
  for (let index = codeLines(source); index < MIN_SYSTEM_LINES; index += 1) lines.push(`export const pad${index} = ${index};`);
  return lines.join("\n");
};

describe("a flow file is never an engine module", () => {
  /** The shape a lane wrote: a mission-order flow whose body has arrow functions and the word mission. */
  const FLOW = `{
  "steps": [
    {
      "assert": "(() => { const run = window.__jgengineRun.read(); return run.kind === 'mission' && run.phase === 'closed'; })()",
      "before": { "is": "window.__jgengineRun !== undefined", "timeoutMs": 30000 },
      "note": "arrival: the mission's order was cleared on the shared session loop"
    }
  ]
}
`;

  test("to-cleared-mission.json passes now and would have failed before", () => {
    const path = "games/ember-command/proofs/flows/to-cleared-mission.json";
    expect(oldRuleWouldFlag(path, FLOW)).toBe(true);
    expect(engineSeams(path, FLOW)).toEqual([]);
  });

  test("no non-code file is engine-shaped, whatever it is called", () => {
    for (const path of [
      "games/ember-command/proofs/flows/to-cleared-mission.json",
      "ember-command/src/systems/mission-director.json",
      "ember-command/docs/state-machine.md",
      "ember-command/src/game/damage-table.csv",
      "ember-command/public/spawn-director.glb",
    ]) {
      expect(engineSeams(path, FLOW)).toEqual([]);
    }
  });

  test("a game's own prose about systems is not a system", () => {
    const source = `/**
 * The mission state machine, the loot reducer, the spawn director and the damage table all live in
 * @jgengine/*; this module only adopts them.
 */
export const note = "state machine, reducer, scheduler, pathfinder";
`;
    expect(engineSeams("odd-orbit/src/game/notes.ts", source)).toEqual([]);
  });
});

describe("a game that owns an engine system still fails", () => {
  const STATE_MACHINE = `export type MissionPhase = "offered" | "accepted" | "closed";

let phase: MissionPhase = "offered";

export function accept(): void {
  if (phase !== "offered") return;
  phase = "accepted";
}

export function close(): void {
  if (phase !== "accepted") return;
  phase = "closed";
}

export function read(): MissionPhase {
  return phase;
}

export function reset(): void {
  phase = "offered";
}
`;

  test("a state machine inside a game names the seam it should move to", () => {
    const seams = engineSeams("ember-command/src/game/missionPhase.ts", pad(STATE_MACHINE));
    expect(seams.map((seam) => seam.name)).toEqual(["state machine"]);
    expect(seamAdvice(seams[0]!)).toContain("Noisemaker111/jgengine");
    expect(seamAdvice(seams[0]!)).toContain("missions / run and session loop");
    expect(seamAdvice(seams[0]!)).toContain("#2312");
  });

  test("a first-line `// framework-ok: <reason>` exempts the file; the marker without a reason does not", () => {
    const path = "ember-command/src/game/missionPhase.ts";
    expect(engineSeams(path, `// framework-ok: authored campaign flow, no second adopter\n${pad(STATE_MACHINE)}`)).toEqual([]);
    expect(engineSeams(path, `// framework-ok:\n${pad(STATE_MACHINE)}`).map((seam) => seam.name)).toEqual(["state machine"]);
    expect(engineSeams(path, `${pad(STATE_MACHINE)}\n// framework-ok: too late, not the first line\n`).map((seam) => seam.name)).toEqual([
      "state machine",
    ]);
  });

  test("the other engine systems are named too", () => {
    const pad = (source: string): string => {
      const lines: string[] = [source];
      for (let index = codeLines(source); index < MIN_SYSTEM_LINES; index += 1) lines.push(`export const pad${index} = ${index};`);
      return lines.join("\n");
    };
    const cases: Array<[string, string, string]> = [
      ["reducer", "ember-command/src/game/store.ts", "export function gameReducer(state: State, action: Action) {\n  switch (action.type) {\n    case 'a': return state;\n    default: return state;\n  }\n}\n"],
      ["pathfinder", "odd-orbit/src/game/nav.ts", "export function findPath(from: Cell, to: Cell): Cell[] {\n  const openSet = [from];\n  while (openSet.length > 0) openSet.pop();\n  return [];\n}\n"],
      ["spawn director", "harbor-heat/src/game/waves.ts", "export class SpawnDirector {\n  private spawnBudget = 10;\n  next(): number { return this.spawnBudget--; }\n}\n"],
      ["progression curve", "harbor-heat/src/game/xp.ts", "export function xpForLevel(level: number): number {\n  return Math.round(100 * level ** 1.5);\n}\n"],
      ["resource pool", "scrap-signal/src/game/pool.ts", "export class BulletPool {\n  private freeList: Bullet[] = [];\n  take(): Bullet { return this.freeList.pop()!; }\n}\n"],
      ["damage or status table", "deepward/src/game/hit.ts", "export const ENEMY_DAMAGE_TABLE: DamageTableDef = { rows: [] };\n"],
    ];
    for (const [seam, path, source] of cases) {
      expect({ path, seams: engineSeams(path, pad(source)).map((found) => found.name) }).toEqual({ path, seams: [seam] });
    }
  });

  test("a queue drained by due time is a scheduler; a bill carrying a due date is data", () => {
    const pad = (source: string): string => {
      const lines: string[] = [source];
      for (let index = codeLines(source); index < MIN_SYSTEM_LINES; index += 1) lines.push(`export const pad${index} = ${index};`);
      return lines.join("\n");
    };
    const queue = "const timers: { dueAt: number; run(): void }[] = [];\nexport function tick(now: number): void {\n  while (timers[0] && timers[0].dueAt <= now) timers.shift()!.run();\n}\n";
    expect(engineSeams("odd-orbit/src/game/timers.ts", pad(queue)).map((seam) => seam.name)).toEqual(["scheduler"]);
    const bill = "export interface Bill { amount: number; dueAt: number }\nexport const isOverdue = (bill: Bill, now: number): boolean => now > bill.dueAt;\nexport const byDue = (bills: Bill[]): Bill[] => [...bills].sort((a, b) => a.dueAt - b.dueAt);\n";
    expect(engineSeams("llmville/packages/game/src/economy/billing.ts", pad(bill))).toEqual([]);
  });

  test("a union of UI statuses set through React state is not a state machine", () => {
    const pad = (source: string): string => {
      const lines: string[] = [source];
      for (let index = codeLines(source); index < MIN_SYSTEM_LINES; index += 1) lines.push(`export const pad${index} = ${index};`);
      return lines.join("\n");
    };
    const ui = 'type CopyState = "idle" | "copied" | "failed";\ntype SendState = "idle" | "sending" | "sent";\nexport function Panel() {\n  const [copyState, setCopyState] = useState<CopyState>("idle");\n  return copyState === "copied" ? null : null;\n}\n';
    expect(engineSeams("llmville/src/runtime/components/ErrorScreen.tsx", pad(ui))).toEqual([]);
  });

  test("the same system in a test file is a test, not a second engine", () => {
    expect(engineSeams("ember-command/src/game/missionPhase.test.ts", STATE_MACHINE)).toEqual([]);
  });
});

describe("adoption is not an offence", () => {
  test("an inline type import of a shared damage table is adoption, not a definition", () => {
    const lines = [
      `import { resolveTableDamage, type DamageTableDef } from "@jgengine/core/combat/damage/damageTable";`,
      `export const RAIDER_DAMAGE: DamageTableDef = { types: [{ id: "pierce", vs: { bone: 0.6 } }] };`,
      `export function hit(base: number): number {`,
      `  return resolveTableDamage(RAIDER_DAMAGE, { type: "pierce", resistance: "bone", armor: 0, base }).damage ?? 0;`,
      `}`,
    ];
    for (let index = 0; index < MIN_SYSTEM_LINES; index += 1) lines.push(`export const pad${index} = ${index};`);
    expect(engineSeams("beacon-bastion/src/game/combat/damage.ts", lines.join("\n"))).toEqual([]);
    // The same type declared in the game is still a definition.
    lines[0] = `export type DamageTableDef = { types: unknown[] };`;
    expect(engineSeams("beacon-bastion/src/game/combat/damage.ts", lines.join("\n")).map((seam) => seam.name)).toEqual(["damage or status table"]);
  });

  test("a module that imports a shared system and calls it passes", () => {
    const adoption = `import { useRunSession } from "@jgengine/react";
import { spawnWave } from "@jgengine/shell";

export function startMission(session: ReturnType<typeof useRunSession>): void {
  session.open({ kind: "mission", id: "the-long-watch" });
  spawnWave({ wave: 1, budget: 6 });
}

export function closeMission(session: ReturnType<typeof useRunSession>): void {
  session.close();
}
`;
    expect(engineSeams("games/ember-command/src/game/campaignSession.ts", adoption)).toEqual([]);
  });

  test("a short game helper that names a system stays below the system floor", () => {
    const short = `export function applyDamage(target: Target, amount: number): void {\n  target.health -= amount;\n}\n`;
    expect(codeLines(short)).toBeLessThan(MIN_SYSTEM_LINES);
    expect(engineSeams("deepward/src/game/hit.ts", short)).toEqual([]);
  });
});

/**
 * The damage seam is the table, not a game's tuning wrapper. Ember Command's `resolveDamage`
 * (`max(1, base + weapon - armor)`) and Beacon Bastion's splash `applyDamage` are game rules over
 * shared primitives; a gate that reddened them taught lanes to rename, so only a table definition,
 * a damage/status model type or the shared resolution functions count now.
 */
describe("damage: the table is the system, the tuning wrapper is not", () => {
  const EMBER = `export function resolveDamage(base: number, attacker: Faction, defender: Faction): number {
  return Math.max(1, base + weaponBonus(attacker) - armorReduction(defender));
}
`;
  const BEACON = `function applyDamage(ctx: GameContext, stats: TowerCombatStats, towerId: string, targetId: string): void {
  ctx.scene.entity.effect({ from: towerId, to: targetId, effect: "damage", via: { amount: stats.damage } });
  const target = ctx.scene.entity.get(targetId);
  if (target === null) return;
  for (const id of ctx.scene.entity.inRadius(target.position, stats.splashRadius)) {
    if (!session.creeps.has(id)) continue;
    ctx.scene.entity.effect({ from: towerId, to: id, effect: "damage", via: { amount: stats.damage * 0.5 } });
  }
}
`;

  test("a game's damage tuning formula passes: two of eight games had one", () => {
    expect(engineSeams("ember-command/src/game/upgrades.ts", pad(EMBER))).toEqual([]);
    expect(engineSeams("beacon-bastion/src/game/combat/towerAI.ts", pad(BEACON))).toEqual([]);
    expect(engineSeams("scrap-signal/src/game/status.ts", pad(`export function tickStatus(target: Target, dt: number): void {\n  target.statusMs -= dt;\n}\n`))).toEqual([]);
  });

  test("an authored table typed by the shared model passes: three games do exactly this", () => {
    const HARBOR = `import type { DamageTableDef } from "@jgengine/core/combat/damage/damageTable";
import { createDamageRuntime } from "@jgengine/core/combat/damage/damageRuntime";

export const DAMAGE_TABLE: DamageTableDef = {
  types: [{ id: "ballistic", vs: { flesh: 1, chassis: 1 } }],
  defaultMultiplier: 1,
};

export const damage = createDamageRuntime({ table: DAMAGE_TABLE });
`;
    expect(engineSeams("harbor-heat/src/game/combat/hitModel.ts", pad(HARBOR))).toEqual([]);
  });

  test("a real damage or status table still fails, naming the seam and #2312", () => {
    for (const source of [
      `export const ENEMY_DAMAGE_TABLE = { rifle: 12, shotgun: 30 };\n`,
      `export interface DamageTableDef {\n  rows: readonly DamageTableRow[];\n}\n`,
      `export function resolveTableDamage(table: DamageTableDef, input: Hit): number {\n  return input.amount;\n}\n`,
      `const STATUS_TABLE = { burn: { seconds: 3 } };\n`,
    ]) {
      const seams = engineSeams("deepward/src/game/combat.ts", pad(source));
      expect(seams.map((seam) => seam.name)).toEqual(["damage or status table"]);
      expect(seamAdvice(seams[0]!)).toContain("#2312");
      expect(seamAdvice(seams[0]!)).toContain("damage and status");
    }
  });
});

/**
 * The two real state machines, recorded rather than implied. Drift Foundry's `RunPhase` duplicates
 * `loop.read()` inside a module that runs the shared loop: that is adoption debt (#2352), not a
 * second engine, so the gate passes it. Scrap Signal's reserve machine has no shared owner yet, so
 * it fails and points at #2351.
 */
describe("state machine: composition passes, a fresh machine fails", () => {
  const DRIFT = `import { createSessionLoop } from "@jgengine/core/run/sessionLoop";

export type RunPhase = "start" | "running" | "won" | "crushed";

let phase: RunPhase = "start";

export function begin(): void {
  if (phase !== "start") return;
  phase = "running";
}

export function bank(): void {
  if (phase !== "running") return;
  phase = "won";
}

export function crush(): void {
  phase = "crushed";
}

export function read(): RunPhase {
  return phase;
}
`;

  const SCRAP = `export type ReservePhase = "up" | "downed" | "dead";

const reserveOf = perContext(() => ({ phase: "up" as ReservePhase, downedUntilMs: 0 }));

export function reserveSave(ctx: GameContext): ReserveState {
  return { ...reserveOf(ctx) };
}

export function restoreReserve(ctx: GameContext, state: ReserveState): void {
  const reserve = reserveOf(ctx);
  reserve.phase = state.phase === "downed" || state.phase === "dead" ? state.phase : "up";
  reserve.downedUntilMs = Number.isFinite(state.downedUntilMs) ? state.downedUntilMs : 0;
}

export function enterDowned(ctx: GameContext, nowMs: number): void {
  const reserve = reserveOf(ctx);
  reserve.phase = "downed";
  reserve.downedUntilMs = nowMs + RESERVE_WINDOW_MS;
}

export function markRespawned(ctx: GameContext): void {
  reserveOf(ctx).phase = "up";
}
`;

  test("RunPhase over the shared run loop passes; the duplicate is adoption debt (#2352)", () => {
    expect(engineSeams("drift-foundry/src/game/run/session.ts", pad(DRIFT))).toEqual([]);
  });

  test("a reserve phase machine with no shared owner fails and points at #2351", () => {
    const seams = engineSeams("scrap-signal/src/game/handroll/reserve.ts", pad(SCRAP));
    expect(seams.map((seam) => seam.name)).toEqual(["state machine"]);
    expect(seamAdvice(seams[0]!)).toContain("#2312");
    expect(seamAdvice(seams[0]!)).toContain("run and session loop");
  });
});

describe("judging a branch's added files", () => {
  test("only the engine-shaped file is reported, with the seam named", async () => {
    const files = {
      "games/ember-command/proofs/flows/to-cleared-mission.json": `{ "steps": [ { "assert": "(() => true)()" } ] }`,
      "games/ember-command/src/game/campaignSession.ts": `import { useRunSession } from "@jgengine/react";\nexport const use = useRunSession;\n`,
      "games/ember-command/src/game/missionPhase.ts": pad(`export type Phase = "a" | "b";\nlet phase: Phase = "a";\nexport function next(): void {\n  phase = "b";\n}\nexport function back(): void {\n  phase = "a";\n}\nexport function read(): Phase {\n  return phase;\n}\n`),
      "games/shared/src/anything.ts": `export class SpawnDirector { private spawnBudget = 1; }\n`,
    };
    const offences = await inspect(Object.keys(files), read(files));
    expect(offences.map((offence) => offence.file)).toEqual(["games/ember-command/src/game/missionPhase.ts"]);
    expect(offences[0]!.seams.map((seam) => seam.name)).toEqual(["state machine"]);
  });

  test("game directories are the only ones judged", () => {
    expect(gameFiles(["games/shared/src/a.ts", "games/scripts/b.ts", "packages/core/src/c.ts", "games/ember-command/src/d.ts", "games/README.md"])).toEqual([
      "games/ember-command/src/d.ts",
    ]);
  });
});

describe("the shape of the judge", () => {
  test("comments are dropped before matching, code lines ignore blanks", () => {
    expect(stripComments("const a = 1; // state machine\n/* reducer */\nconst b = 2;")).not.toContain("state machine");
    expect(codeLines("const a = 1;\n\n// note\n")).toBe(1);
  });

  test("every seam names the engine area it belongs to", () => {
    expect(ENGINE_SEAMS.length).toBe(8);
    for (const seam of ENGINE_SEAMS) {
      expect(seam.owner.length).toBeGreaterThan(3);
      expect(seam.defines.length).toBeGreaterThan(0);
    }
  });
});

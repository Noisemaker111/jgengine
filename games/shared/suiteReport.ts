import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import { parseSuiteReport, readGameSuiteConfig, scoreGameSuite, type GameSuiteScore, type SuiteReport } from "@jgengine/core/suite/gameSuite";

/** Where a game's suite test writes its report, relative to the game; `jgengine suite` and `bun run gen` read it. */
export const SUITE_REPORT_FILE = "proofs/suite-report.json";
export const SUITE_RUN_OUT_ENV = "JGENGINE_SUITE_RUN_OUT";
export const SUITE_PROOFS_DIR = "proofs/sim";

export function readSuiteReport(gameDir: string): SuiteReport | null {
  const path = join(gameDir, SUITE_REPORT_FILE);
  if (!existsSync(path)) return null;
  return parseSuiteReport(JSON.parse(readFileSync(path, "utf8")));
}

export function readGameProject(gameDir: string): { id: string; project: unknown } {
  const project: unknown = JSON.parse(readFileSync(join(gameDir, "jgengine.json"), "utf8"));
  const id = typeof project === "object" && project !== null && "id" in project && typeof project.id === "string" ? project.id : basename(gameDir);
  return { id, project };
}

/**
 * Score a game from its committed report against the live catalog: `null` when its `jgengine.json`
 * declares no suite. Entries the report never ran score missing.
 */
export function scoreCommittedSuite(gameDir: string): GameSuiteScore | null {
  return scoreSuiteReport(gameDir, readSuiteReport(gameDir));
}

export function scoreSuiteReport(gameDir: string, report: SuiteReport | null): GameSuiteScore | null {
  const { id, project } = readGameProject(gameDir);
  const config = readGameSuiteConfig(project);
  if (config === null) return null;
  return scoreGameSuite(id, config, report);
}

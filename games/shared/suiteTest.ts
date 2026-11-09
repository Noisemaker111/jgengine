import { expect, test } from "bun:test";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import type { SuiteContent } from "@jgengine/core/suite/contentAudit";
import { readGameSuiteConfig, renderSuiteText, scoreGameSuite, suiteRegressions } from "@jgengine/core/suite/gameSuite";
import { runGameSuite, type LoadedSuiteProof } from "@jgengine/core/suite/runSuiteProof.draw";
import { isSuiteProof } from "@jgengine/core/suite/suiteProof";

import { readGameProject, readSuiteReport, SUITE_PROOFS_DIR, SUITE_REPORT_FILE, SUITE_RUN_OUT_ENV } from "./suiteReport";

async function loadProofs(gameDir: string): Promise<LoadedSuiteProof[]> {
  const dir = join(gameDir, SUITE_PROOFS_DIR);
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((name) => name.endsWith(".proof.ts")).sort();
  const proofs: LoadedSuiteProof[] = [];
  for (const name of files) {
    const module: unknown = await import(pathToFileURL(join(dir, name)).href);
    const proof = typeof module === "object" && module !== null && "default" in module ? module.default : undefined;
    if (!isSuiteProof(proof)) throw new Error(`${SUITE_PROOFS_DIR}/${name} must export default defineProof(game, { proves, setup?, play })`);
    proofs.push({ file: `${SUITE_PROOFS_DIR}/${name}`, proof });
  }
  return proofs;
}

/**
 * A game's suite test: runs every proof in `proofs/sim/` and the content check headless, writes
 * `proofs/suite-report.json` (outside CI), and fails when the game's suite declarations are wrong or an
 * entry the committed report had proven is no longer proven. A missing or failing entry that was never
 * proven is the game's honest score, not a test failure.
 */
export function suiteTest(gameDir: string, content: SuiteContent | null = null): void {
  test("game suite: proofs and content check", async () => {
    const { id, project } = readGameProject(gameDir);
    const config = readGameSuiteConfig(project);
    if (config === null) throw new Error(`${gameDir}/jgengine.json declares no "suite" (genres, cut, notSimulatable)`);
    const report = await runGameSuite(id, await loadProofs(gameDir), content);
    const previous = readSuiteReport(gameDir);
    const score = scoreGameSuite(id, config, report);
    console.log(renderSuiteText(score).filter((line) => !line.startsWith("  proven")).join("\n"));
    const regressed = previous === null ? [] : suiteRegressions(scoreGameSuite(id, config, previous), score);
    const written = `${JSON.stringify(report, null, 2)}\n`;
    // `jgengine suite` scores this run, regressed or not, from the file it names.
    const runOut = process.env[SUITE_RUN_OUT_ENV];
    if (runOut !== undefined && runOut !== "") writeFileSync(runOut, written);
    // A regressed run keeps the committed report, so the next run still sees what was proven.
    const writes = process.env["CI"] === undefined;
    if (writes && regressed.length === 0) writeFileSync(join(gameDir, SUITE_REPORT_FILE), written);
    expect(score.problems).toEqual([]);
    expect(regressed).toEqual([]);
  }, 1_200_000);
}

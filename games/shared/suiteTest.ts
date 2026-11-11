import { expect, test } from "bun:test";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";

import { auditSuiteContent, type SuiteContent } from "@jgengine/core/suite/contentAudit";
import { readGameSuiteConfig, renderSuiteText, scoreGameSuite, suiteRegressions, type SuiteProofResult, type SuiteReport } from "@jgengine/core/suite/gameSuite";

import { readGameProject, readSuiteReport, SUITE_PROOFS_DIR, SUITE_REPORT_FILE, SUITE_RUN_OUT_ENV } from "./suiteReport";
import type { SuiteProofAnswer, SuiteProofJob } from "./suiteProofWorker";

/** Overrides how many proofs play at once (`suiteWorkers`). */
export const SUITE_WORKERS_ENV = "JG_SUITE_WORKERS";

/** The most workers one job takes on a shared machine unless JG_SUITE_WORKERS asks for more. */
export const MAX_SUITE_WORKERS = 4;

/**
 * Proofs played at once: half the machine's threads, at least one and at most four (the shared
 * machine's limit on workers for one job), or `JG_SUITE_WORKERS`. Each proof
 * is its own headless game, independent of the others, so they need not wait on each other: fernwild's
 * 62 proofs played one after another took 400-760 s, the longest step of every landing that reached
 * the engine. Half the threads leaves the rest to the gate's other steps running beside it.
 */
export function suiteWorkers(proofs: number, env: Record<string, string | undefined> = process.env, threads = availableParallelism()): number {
  const asked = Number(env[SUITE_WORKERS_ENV]);
  const wanted = Number.isInteger(asked) && asked > 0 ? asked : Math.max(1, Math.min(MAX_SUITE_WORKERS, Math.floor(threads / 2)));
  return Math.max(1, Math.min(proofs, wanted));
}

/** Every proof file of a game, sorted: the report's order, whatever order the workers finish in. */
function proofFiles(gameDir: string): string[] {
  const dir = join(gameDir, SUITE_PROOFS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith(".proof.ts")).sort();
}

/** Play every proof across `workers` threads, each proof once, and return the report in file order. */
export async function runSuiteInWorkers(game: string, gameDir: string, content: SuiteContent | null, workers = suiteWorkers(proofFiles(gameDir).length)): Promise<SuiteReport> {
  const jobs: SuiteProofJob[] = proofFiles(gameDir).map((name) => ({ game, path: join(gameDir, SUITE_PROOFS_DIR, name), file: `${SUITE_PROOFS_DIR}/${name}` }));
  const results = new Map<string, SuiteProofResult>();
  let next = 0;
  const lane = async (): Promise<void> => {
    // A file path, not `new URL(..., import.meta.url)`: the site build reads this file, and Vite would
    // try to bundle a URL-form worker for the browser (and refuse the preload's top-level await).
    const worker = new Worker(join(import.meta.dir, "suiteProofWorker.ts"), { type: "module" });
    try {
      for (let job = jobs[next++]; job !== undefined; job = jobs[next++]) {
        const answer = await new Promise<SuiteProofAnswer>((resolve, reject) => {
          worker.onmessage = (event: MessageEvent<SuiteProofAnswer>) => resolve(event.data);
          worker.onerror = (event) => reject(new Error(`suite worker crashed on ${job!.file}: ${event.message}`));
          worker.postMessage(job);
        });
        if ("error" in answer) throw new Error(answer.error);
        results.set(answer.file, answer.result);
      }
    } finally {
      worker.terminate();
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(workers, jobs.length)) }, lane));
  return { game, proofs: jobs.map((job) => results.get(job.file)!), data: content === null ? [] : auditSuiteContent(content) };
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
    const report = await runSuiteInWorkers(id, gameDir, content);
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

// One worker of a game's suite test (`suiteTest.ts`): plays the proof files it is handed, one at a
// time, each against its own fresh headless game, and posts each result back. A worker has its own
// module graph, so no proof's game state reaches another's.
import { pathToFileURL } from "node:url";

import type { SuiteProofResult } from "@jgengine/core/suite/gameSuite";
import { runGameSuite } from "@jgengine/core/suite/runSuiteProof.draw";
import { isSuiteProof } from "@jgengine/core/suite/suiteProof";

/** What the suite test sends: the game, and one proof file (absolute path and its report name). */
export interface SuiteProofJob {
  game: string;
  path: string;
  file: string;
}

/** What a worker answers: the proof's result, or the error that stopped it loading or running. */
export type SuiteProofAnswer = { file: string; result: SuiteProofResult } | { file: string; error: string };

declare const self: Worker;

// A worker does not run bunfig.toml's test preload, so it loads it itself before any proof: the proof
// then runs in the same module world as the test process, where three is evaluated before anything
// requires it (scripts/three-preload.ts). Started at once, awaited per job, so no message waits on a
// handler that is not set yet.
const preloaded = import("../../scripts/three-preload");

self.onmessage = async (event: MessageEvent<SuiteProofJob>) => {
  const { game, path, file } = event.data;
  try {
    await preloaded;
    const module: unknown = await import(pathToFileURL(path).href);
    const proof = typeof module === "object" && module !== null && "default" in module ? module.default : undefined;
    if (!isSuiteProof(proof)) throw new Error(`${file} must export default defineProof(game, { proves, setup?, play })`);
    const report = await runGameSuite(game, [{ file, proof }], null);
    self.postMessage({ file, result: report.proofs[0]! } satisfies SuiteProofAnswer);
  } catch (error) {
    self.postMessage({ file, error: error instanceof Error ? (error.stack ?? error.message) : String(error) } satisfies SuiteProofAnswer);
  }
};

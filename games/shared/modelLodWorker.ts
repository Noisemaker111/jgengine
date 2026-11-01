/// <reference lib="webworker" />
/**
 * One model's simplified levels per message, off the pipeline's main thread: the meshoptimizer
 * simplifier is single-threaded, so `buildGameAssets.ts` runs a pool of these.
 */
import { buildModelLods, type LodBuildPlan } from "../../packages/assets/src/modelLodBuild";

declare const self: Worker;

self.onmessage = async (event: MessageEvent<{ file: string; plan: LodBuildPlan }>) => {
  const { file, plan } = event.data;
  try {
    self.postMessage({ result: await buildModelLods(file, plan) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};

/// <reference lib="webworker" />
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

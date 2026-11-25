// @skill jgengine-world
/**
 * Worker entry that grows landforms off the main thread: it takes a {@link LandformJob}, grows it
 * with the same models the main thread runs and posts the terrain back, its arrays transferred.
 * Spawned by {@link createWorkerLandformGrower}.
 */
import { serveWorkerJobs } from "../../run/workerPool";
import { isLandformJob } from "./landformGenerator";
import { growLandform } from "./landformTerrain";

serveWorkerJobs(isLandformJob, (job) => {
  const terrain = growLandform(job.recipe, job.seed);
  const transfer: ArrayBuffer[] = [];
  for (const array of [terrain.heights, terrain.weights, terrain.waterDepth, terrain.dunes]) if (array.buffer instanceof ArrayBuffer) transfer.push(array.buffer);
  return { result: terrain, transfer };
});

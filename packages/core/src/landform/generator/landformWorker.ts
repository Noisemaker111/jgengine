// @skill jgengine-world
/**
 * Worker entry that grows landforms off the main thread: it takes a {@link LandformJob}, grows it
 * with the same models the main thread runs and posts the terrain back, its arrays transferred.
 * Spawned by {@link createWorkerLandformGrower}.
 */
import { isLandformJob, type LandformReply } from "./landformGenerator";
import { growLandform } from "./landformTerrain";

addEventListener("message", (event: MessageEvent<unknown>) => {
  const job = event.data;
  if (!isLandformJob(job)) return;
  let reply: LandformReply;
  const transfer: ArrayBuffer[] = [];
  try {
    const terrain = growLandform(job.recipe, job.seed);
    for (const array of [terrain.heights, terrain.weights, terrain.waterDepth, terrain.dunes]) if (array.buffer instanceof ArrayBuffer) transfer.push(array.buffer);
    reply = { id: job.id, terrain };
  } catch (error) {
    reply = { id: job.id, error: error instanceof Error ? error.message : String(error) };
  }
  postMessage(reply, { transfer });
});

// @skill jgengine-world
/**
 * Worker entry that grows plants off the main thread: it takes a {@link PlantGrowRequest}, grows it
 * with the same simulation the main thread runs, and posts the structure back as codec bytes.
 * Spawned by {@link createWorkerPlantGrower}.
 */
import { encodePlantStructure } from "../cache/plantCodec";
import { createPlantGrowth } from "../growth/plantGrowth";
import { hashPlantStructure } from "../structure/plantStructure";
import { isPlantGrowJob, type PlantGrowReply } from "./plantGrowPool";

addEventListener("message", (event: MessageEvent<unknown>) => {
  const job = event.data;
  if (!isPlantGrowJob(job)) return;
  let reply: PlantGrowReply;
  try {
    const { species, env, seed, age, day } = job.request;
    const growth = createPlantGrowth(species, env, seed);
    growth.step(age);
    const structure = growth.structure(day);
    reply = { id: job.id, bytes: encodePlantStructure(structure, hashPlantStructure(structure)) };
  } catch (error) {
    reply = { id: job.id, error: error instanceof Error ? error.message : String(error) };
  }
  postMessage(reply, { transfer: "bytes" in reply ? [reply.bytes.buffer] : [] });
});

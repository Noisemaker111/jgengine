// @skill jgengine-world
/**
 * Worker entry that grows plants off the main thread: it takes a {@link PlantGrowRequest}, grows it
 * with the same simulation the main thread runs, builds the ordered mesh, and posts both back as
 * codec bytes.
 * Spawned by {@link createWorkerPlantGrower}.
 */
import { encodePlantMesh, encodePlantStructure } from "../cache/plantCodec";
import { createPlantGrowth } from "../growth/plantGrowth";
import { bakePlantLeafAtlas } from "../mesh/plantLeafAtlas";
import { buildPlantMesh } from "../mesh/plantMesh";
import { hashPlantStructure } from "../structure/plantStructure";
import { isPlantGrowJob, type PlantGrowReply } from "./plantGrowPool";

addEventListener("message", (event: MessageEvent<unknown>) => {
  const job = event.data;
  if (!isPlantGrowJob(job)) return;
  let reply: PlantGrowReply;
  try {
    const { species, env, seed, age, day, deadYears } = job.request;
    const growth = createPlantGrowth(species, env, seed);
    growth.step(age);
    if (deadYears > 0) {
      growth.kill();
      growth.step(deadYears);
    }
    const structure = growth.structure(day);
    const hash = hashPlantStructure(structure);
    const mesh = job.mesh === null ? null : buildPlantMesh({ structure, style: job.mesh.style, detail: job.mesh.detail, structureHash: hash });
    const atlas = job.atlas ? bakePlantLeafAtlas(structure.leafShape) : null;
    reply = { id: job.id, bytes: encodePlantStructure(structure, hash), meshBytes: mesh === null ? null : encodePlantMesh(mesh), atlas };
  } catch (error) {
    reply = { id: job.id, error: error instanceof Error ? error.message : String(error) };
  }
  const transfer: ArrayBuffer[] = [];
  if ("bytes" in reply) {
    for (const view of [reply.bytes, reply.meshBytes, reply.atlas?.data]) if (view?.buffer instanceof ArrayBuffer) transfer.push(view.buffer);
  }
  postMessage(reply, { transfer });
});

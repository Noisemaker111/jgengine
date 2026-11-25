// @skill jgengine-world
/**
 * Worker entry that grows plants off the main thread: it takes a {@link PlantGrowJob}, grows it
 * with the same simulation the main thread runs, builds the ordered mesh, and posts both back as
 * codec bytes.
 * Spawned by {@link createWorkerPlantGrower}.
 */
import { serveWorkerJobs } from "../../run/workerPool";
import { encodePlantMesh, encodePlantStructure } from "../cache/plantCodec";
import { createPlantGrowth } from "../growth/plantGrowth";
import { bakePlantLeafAtlas } from "../mesh/plantLeafAtlas";
import { buildPlantMesh } from "../mesh/plantMesh";
import { hashPlantStructure } from "../structure/plantStructure";
import { isPlantGrowJob, type PlantGrowReply } from "./plantGrowPool";

serveWorkerJobs(isPlantGrowJob, (job) => {
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
  const result: PlantGrowReply = { bytes: encodePlantStructure(structure, hash), meshBytes: mesh === null ? null : encodePlantMesh(mesh), atlas };
  const transfer: ArrayBuffer[] = [];
  for (const view of [result.bytes, result.meshBytes, result.atlas?.data]) if (view?.buffer instanceof ArrayBuffer) transfer.push(view.buffer);
  return { result, transfer };
});

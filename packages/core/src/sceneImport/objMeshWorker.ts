/**
 * Worker entry that fetches and parses one OBJ file off the main thread and hands back its typed
 * arrays by transfer, so a gigabyte of OBJ text never crosses or blocks the frame thread.
 * Spawned by {@link loadImportedScene}.
 */
import { serveWorkerJobs } from "../run/workerPool";
import { fetchObjFile, isObjFileJob } from "./objFile";
import { objBuffers } from "./objMesh";

serveWorkerJobs(isObjFileJob, async (job) => {
  const result = await fetchObjFile(job.url);
  return { result, transfer: objBuffers(result.objects) };
});

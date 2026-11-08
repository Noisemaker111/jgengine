/**
 * Worker entry that bakes procedural decal textures off the main thread: it takes a
 * {@link DecalBakeJob}, bakes it with the same code the main thread would, and posts the bytes back.
 * Spawned by `bakeDecal` in decalBakePool.ts.
 */
import { isDecalBakeJob, type DecalBakeReply } from "./decalBakePool";
import { bakeDecalTexture } from "./decalTexture";

addEventListener("message", (event: MessageEvent<unknown>) => {
  const job = event.data;
  if (!isDecalBakeJob(job)) return;
  let reply: DecalBakeReply;
  try {
    reply = { id: job.id, data: bakeDecalTexture(job.style, job.seed, job.size, job.paint).data };
  } catch (error) {
    reply = { id: job.id, error: error instanceof Error ? error.message : String(error) };
  }
  postMessage(reply, { transfer: "data" in reply && reply.data.buffer instanceof ArrayBuffer ? [reply.data.buffer] : [] });
});

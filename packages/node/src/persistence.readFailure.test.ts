import { expect, test } from "bun:test";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGameRuntime } from "@jgengine/core/runtime/gameRuntime";
import type { WorldChunkRecord } from "@jgengine/core/runtime/hostPersistence";
import { createGameHost } from "./host";
import { filePersistence } from "./persistence";

const chunk: WorldChunkRecord = {
  serverId: "world-a", chunkKey: "0,0", updatedAt: 1,
  snapshot: { chunkKey: "0,0", objects: [], entities: [], flags: { cargo: "copper-seal" } },
};

test("file chunk reads preserve missing-directory behavior and reject an existing non-directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jg-chunk-read-"));
  const persistence = filePersistence(directory);
  try {
    expect(await persistence.loadChunks(chunk.serverId)).toEqual([]);
    await persistence.saveChunks(chunk.serverId, [chunk]);
    const path = join(directory, "chunks", chunk.serverId);
    const preserved = `${path}.preserved`;
    const original = await readFile(join(path, "0%2C0.json"), "utf8");
    await rename(path, preserved);
    await writeFile(path, "filesystem fault fixture");
    await expect(persistence.loadChunks(chunk.serverId)).rejects.toMatchObject({ code: "ENOTDIR" });
    expect(await readFile(join(preserved, "0%2C0.json"), "utf8")).toBe(original);
    await rm(path);
    await rename(preserved, path);
    expect(await persistence.loadChunks(chunk.serverId)).toEqual([chunk]);
    expect(await readFile(join(path, "0%2C0.json"), "utf8")).toBe(original);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("host admission fails before hydration on a file chunk read error, then retries without losing saved state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jg-chunk-admission-"));
  const persistence = filePersistence(directory);
  const gameId = "cargo-ledger";
  const initialRuntime = createGameRuntime({
    gameId, save: { auto: "5ms", scope: "player+chunks" }, commands: {},
  });
  const initial = createGameHost({ persistence, runtimes: [initialRuntime], createServerId: () => chunk.serverId });
  try {
    await initial.joinServer({ userId: "alice", gameId });
    await initial.stop();
    await persistence.saveChunks(chunk.serverId, [chunk]);
    const serverFile = join(directory, "servers", `${chunk.serverId}.json`);
    const savedServer = await readFile(serverFile, "utf8");
    const path = join(directory, "chunks", chunk.serverId);
    const preserved = `${path}.preserved`;
    const savedChunk = await readFile(join(path, "0%2C0.json"), "utf8");
    await rename(path, preserved);
    await writeFile(path, "filesystem fault fixture");
    const hydrated: unknown[] = [];
    const runtime = createGameRuntime({
      gameId, save: { auto: "5ms", scope: "player+chunks" }, commands: {},
      loop: { onInit(ctx) { hydrated.push(ctx.snapshot.chunks[chunk.chunkKey]?.flags); } },
    });
    const restored = createGameHost({ persistence, runtimes: [runtime] });
    const events: unknown[] = [];
    const unsubscribe = restored.subscribe(event => events.push(event));
    try {
      await expect(restored.joinServer({ userId: "alice", gameId, serverId: chunk.serverId }))
        .rejects.toMatchObject({ code: "ENOTDIR" });
      expect(hydrated).toEqual([]);
      expect(events).toEqual([]);
      expect(await readFile(serverFile, "utf8")).toBe(savedServer);
      expect(await readFile(join(preserved, "0%2C0.json"), "utf8")).toBe(savedChunk);
      await rm(path);
      await rename(preserved, path);
      expect(await restored.joinServer({ userId: "alice", gameId, serverId: chunk.serverId }))
        .toEqual({ serverId: chunk.serverId, isNew: false });
      expect(hydrated).toEqual([{ cargo: "copper-seal" }]);
      expect(await persistence.loadChunks(chunk.serverId)).toEqual([chunk]);
      expect(await readFile(join(path, "0%2C0.json"), "utf8")).toBe(savedChunk);
      await restored.stop();
    } finally {
      unsubscribe();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

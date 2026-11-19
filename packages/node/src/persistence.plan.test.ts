import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { GameServerRecord, ServerPersistPlan } from "@jgengine/core/runtime/hostPersistence";
import { createEmptyServerRow } from "@jgengine/core/runtime/snapshot";

import { filePersistence } from "./persistence";

const server: GameServerRecord = {
  serverId: "srv-1", gameId: "demo", status: "running", memberUserIds: ["alice"], slotsPerServer: 16,
  save: { auto: "5s", scope: "player+chunks" }, serverState: createEmptyServerRow(), sessionPlayers: {},
  revision: 2, tickAnchorMs: 0, createdAt: 0, updatedAt: 0,
};

const plan: ServerPersistPlan = {
  server,
  profiles: [{ userId: "alice", gameId: "demo", playerState: { userId: "alice", inventories: {}, economy: {}, unlocks: [], session: {} }, revision: 2, updatedAt: 0 }],
  chunks: [{ serverId: "srv-1", chunkKey: "0,0", snapshot: { chunkKey: "0,0", objects: [], entities: [] }, updatedAt: 0 }],
  deletedChunks: [],
  leaderboard: [{ userId: "alice", stat: "gold", scope: "profile", by: 5 }],
  changed: { serverState: true, sessionPlayers: true, revision: true, any: true },
};

async function scratch(): Promise<string> {
  return mkdtemp(join(tmpdir(), "jg-plan-"));
}

test("a plan that fails before its journal changes nothing, and the retry counts points once", async () => {
  const dir = await scratch();
  try {
    const persistence = filePersistence(dir);
    await persistence.loadServer("warm-up");
    // The chunk folder is a file, so staging the chunk fails part-way through the plan.
    await writeFile(join(dir, "chunks", "srv-1"), "not a folder");
    await expect(persistence.savePlan(plan)).rejects.toThrow();
    expect(await persistence.getLeaderboardProfile({ gameId: "demo", userId: "alice" })).toEqual({});
    expect(await persistence.loadProfile({ userId: "alice", gameId: "demo" })).toBeNull();
    expect(await persistence.loadServer("srv-1")).toBeNull();

    await rm(join(dir, "chunks", "srv-1"));
    await persistence.savePlan(plan);
    expect(await persistence.getLeaderboardProfile({ gameId: "demo", userId: "alice" })).toEqual({ gold: 5 });
    expect(await persistence.loadServer("srv-1")).toEqual(server);
    expect(await persistence.loadChunks("srv-1")).toHaveLength(1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a plan whose journal was written is finished by the next call, never applied twice", async () => {
  const dir = await scratch();
  try {
    const persistence = filePersistence(dir);
    await persistence.loadServer("warm-up");
    // The server row's path is a folder, so moving it into place fails after the journal is written.
    await mkdir(join(dir, "servers", "srv-1.json"));
    await persistence.savePlan(plan);
    await expect(persistence.loadServer("srv-1")).rejects.toThrow();
    expect(JSON.parse(await readFile(join(dir, "plan.journal.json"), "utf8")).moves.length).toBeGreaterThan(0);

    await rm(join(dir, "servers", "srv-1.json"), { recursive: true });
    const reopened = filePersistence(dir);
    expect(await reopened.loadServer("srv-1")).toEqual(server);
    expect(await reopened.getLeaderboardProfile({ gameId: "demo", userId: "alice" })).toEqual({ gold: 5 });
    await expect(readFile(join(dir, "plan.journal.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

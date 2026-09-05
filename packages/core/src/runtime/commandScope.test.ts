import { expect, test } from "bun:test";

import { commandScopeEscape, resolveCommandScope, scopeWithActor } from "./commandRunner";
import { createGameRuntime } from "./gameRuntime";
import { createRuntimeSnapshot } from "./snapshot";

test("resolveCommandScope reads the scope a command derives from its own input", () => {
  const commands = {
    "world.place": {
      scope: (input: { chunkKey: string }, actorUserId: string) => ({
        players: [actorUserId],
        chunkKeys: [input.chunkKey],
      }),
      validate: () => null,
      apply: (snapshot: ReturnType<typeof createRuntimeSnapshot>) => snapshot,
    },
    "world.anything": {
      validate: () => null,
      apply: (snapshot: ReturnType<typeof createRuntimeSnapshot>) => snapshot,
    },
  };

  expect(resolveCommandScope(commands, "world.place", { chunkKey: "0,0" }, "alice")).toEqual({
    players: ["alice"],
    chunkKeys: ["0,0"],
  });
  expect(resolveCommandScope(commands, "world.anything", { chunkKey: "0,0" }, "alice")).toEqual({ players: ["alice"], chunkKeys: [] });
  expect(resolveCommandScope(commands, "missing", { chunkKey: "0,0" }, "alice")).toEqual({ players: ["alice"], chunkKeys: [] });
});

test("scopeWithActor keeps the actor hydrated without widening an unscoped roster", () => {
  expect(scopeWithActor({ players: ["bob"], chunkKeys: [] }, "alice")).toEqual({
    players: ["bob", "alice"],
    chunkKeys: [],
  });
  expect(scopeWithActor({ players: ["alice"] }, "alice")).toEqual({ players: ["alice"] });
  expect(scopeWithActor({ chunkKeys: ["0,0"] }, "alice")).toEqual({ chunkKeys: ["0,0"] });
  expect(scopeWithActor(undefined, "alice")).toBeUndefined();
});

test("commandScopeEscape names writes the scope never hydrated", () => {
  const dirty = { server: true, players: ["alice", "bob"], chunks: ["0,0", "9,9"] };

  expect(commandScopeEscape(undefined, dirty, "world.place")).toBeNull();
  expect(commandScopeEscape({ chunkKeys: ["0,0", "9,9"] }, dirty, "world.place")).toBeNull();
  expect(commandScopeEscape({ players: ["alice"], chunkKeys: ["0,0"] }, dirty, "world.place")).toBe(
    'Command "world.place" wrote outside its declared scope: players bob; chunks 9,9',
  );
});

test("joinScope defaults to the joining member alone when a runtime declares no onNewPlayer", () => {
  const bare = createGameRuntime({ gameId: "demo", save: "none", commands: {} });
  expect(bare.joinScope("alice", true)).toEqual({ players: ["alice"], chunkKeys: [] });

  const hooked = createGameRuntime({
    gameId: "demo",
    save: "none",
    commands: {},
    loop: { onNewPlayer: () => {} },
  });
  expect(hooked.joinScope("alice", true)).toBeUndefined();

  const scoped = createGameRuntime({
    gameId: "demo",
    save: "none",
    commands: {},
    loop: { onNewPlayer: () => {}, joinScope: (userId) => ({ players: [userId] }) },
  });
  expect(scoped.joinScope("alice", true)).toEqual({ players: ["alice"] });
});

 test("actor shorthand resolves before hydration", () => {
  expect(resolveCommandScope({ place: { scope: () => ({ players: "actor", chunkKeys: ["0,0"] }), validate: () => null, apply: s => s } }, "place", {}, "alice")).toEqual({ players: ["alice"], chunkKeys: ["0,0"] });
 });

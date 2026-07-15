import { describe, expect, test } from "bun:test";

import { defineGame } from "../game/defineGame";
import { memorySaveBackend } from "../game/saveStore";
import { createAssetCatalog } from "../scene/assetCatalog";
import { defineStore } from "../store/defineStore";
import { convex } from "./adapter";
import { createGameContext } from "./gameContext";

const progress = defineStore<{ level: number }>("save.progress", { level: 1 });

function offlineGame(persist: boolean | { storage?: "local" | "memory"; mode?: "autosave" | "manual" }) {
  return defineGame({ name: "SaveTest", assets: createAssetCatalog(), multiplayer: "off", persist });
}

describe("ctx.game.save", () => {
  test("whole-world round-trips across a fresh context through a shared backend", async () => {
    const backend = memorySaveBackend();

    const host = createGameContext({
      definition: offlineGame(false),
      content: {},
      player: { userId: "p1", isNew: true },
      save: { backend, mode: "manual" },
    });
    progress.write(host, { level: 7 });
    host.scene.entity.spawn("hero", { id: "p1", position: [1, 0, 2] });
    expect(host.game.save).toBeDefined();
    await host.game.save!.save();

    const reboot = createGameContext({
      definition: offlineGame(false),
      content: {},
      player: { userId: "p1", isNew: true },
      save: { backend, mode: "manual" },
    });
    expect(await reboot.game.save!.load()).toBe(true);
    expect(progress.read(reboot)).toEqual({ level: 7 });
    expect(reboot.scene.entity.get("p1")?.position).toEqual([1, 0, 2]);
  });

  test("persist:true auto-wires ctx.game.save for an offline game", () => {
    const ctx = createGameContext({
      definition: offlineGame(true),
      content: {},
      player: { userId: "p1", isNew: true },
    });
    expect(ctx.game.save).toBeDefined();
  });

  test("persist is ignored for a server-authoritative world", () => {
    const ctx = createGameContext({
      definition: defineGame({
        name: "Hosted",
        assets: createAssetCatalog(),
        multiplayer: convex({ authority: "server" }),
        persist: true,
      }),
      content: {},
      player: { userId: "p1", isNew: true },
    });
    expect(ctx.game.save).toBeUndefined();
  });

  test("no persist config leaves ctx.game.save undefined", () => {
    const ctx = createGameContext({
      definition: defineGame({ name: "Plain", assets: createAssetCatalog(), multiplayer: "off" }),
      content: {},
      player: { userId: "p1", isNew: true },
    });
    expect(ctx.game.save).toBeUndefined();
  });
});

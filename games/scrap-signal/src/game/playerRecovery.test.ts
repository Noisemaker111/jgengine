import { afterEach, beforeEach, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { memorySaveBackend } from "@jgengine/core/save/saveStore";

import { loop } from "../loop";
import { seededRng } from "@jgengine/core/random/rng";

import { characterNodes, pickCharacter, resetCharacterState, talentTree } from "./characters";
import { content } from "./content";
import { respawnFee, rollGun } from "./handroll";
import { inventories } from "./inventories";
import { saveScrapState } from "./save";
import { characterIdStore, discoveredStationsStore, talentRanksStore } from "./stores";
import { TRAVEL_STATIONS } from "./world/sites";

// The relay's own save document writes to the browser's storage; give the test one that keeps it.
const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
beforeEach(() => {
  const items = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
      removeItem: (key: string) => void items.delete(key),
    },
  });
});
afterEach(() => {
  resetCharacterState();
  if (storageDescriptor) Object.defineProperty(globalThis, "localStorage", storageDescriptor);
  else Reflect.deleteProperty(globalThis, "localStorage");
});

function boot(backend: ReturnType<typeof memorySaveBackend>): GameContext {
  return createGameContext({
    definition: defineGameDefinition({ name: "player-recovery-test", assets: createAssetCatalog(), multiplayer: "off", persist: true, inventories }),
    content,
    player: { userId: "reclaimer", isNew: true },
    save: { backend, key: "player-recovery-test", mode: "manual" },
  });
}

/** Let the boot's save load and resume run to the end. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

test("a save written without the chassis boots with it rebuilt at its level, possessions kept and the fee paid once", async () => {
  const backend = memorySaveBackend();
  const first = boot(backend);
  const station = TRAVEL_STATIONS[1];
  if (station === undefined) throw new Error("expected a second station");
  const character = pickCharacter("gunk");
  const tree = talentTree();
  const node = character === null ? undefined : characterNodes(character)[0];
  if (tree === null || node === undefined) throw new Error("no talent tree");
  tree.hydrate({ points: 2, ranks: { [node.id]: 3 } });
  characterIdStore.write(first, "gunk");
  talentRanksStore.write(first, tree.snapshot().ranks);
  discoveredStationsStore.write(first, [station.zoneId]);
  first.game.economy.grant("reclaimer", "cash", 1000, "test");
  const gun = rollGun(seededRng("recovery"), 4, { family: "rifle" });
  first.player.inventory.put("hotbar", gun.id, 1, { slot: 0 });
  // The chassis is gone when the world is written: the save keeps the run but nobody to play it.
  await saveScrapState(first);
  expect(first.scene.entity.get("reclaimer")).toBeNull();
  resetCharacterState();

  const second = boot(backend);
  loop.onNewPlayer(second);
  await settle();
  const chassis = second.scene.entity.get("reclaimer");
  expect(chassis).not.toBeNull();
  expect(Math.hypot((chassis?.position[0] ?? 0) - station.x, (chassis?.position[2] ?? 0) - station.z)).toBeLessThan(8);
  expect(second.scene.entity.stats.get("reclaimer", "level")?.current).toBe(1 + 3 + 2);
  expect(second.scene.entity.stats.get("reclaimer", "skillPoints")?.current).toBe(2);
  expect(second.player.inventory.state("hotbar").slots[0]?.itemId).toBe(gun.id);
  expect(second.game.economy.balance("reclaimer", "cash")).toBe(1000 - respawnFee(1000));
  expect(second.game.notices.list().some((notice) => notice.text.includes("Lost:"))).toBe(true);

  // The rebuilt chassis is in the next save, so a second boot does not charge again.
  await saveScrapState(second);
  resetCharacterState();
  const third = boot(backend);
  loop.onNewPlayer(third);
  await settle();
  expect(third.scene.entity.get("reclaimer")).not.toBeNull();
  expect(third.game.economy.balance("reclaimer", "cash")).toBe(1000 - respawnFee(1000));
});

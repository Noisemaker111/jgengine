import { describe, expect, test } from "bun:test";

import { createLocalGameState, LOCAL_GAME_STATE_KEY } from "./localGameState";

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    get length() {
      return map.size;
    },
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

describe("local game state", () => {
  test("moves an existing per-key local save into one document and removes the old keys", () => {
    const storage = memoryStorage({
      "ai-game:camera-look:world-a:slot-0": JSON.stringify({ yaw: 1.25, pitch: -0.4 }),
      "ai-game:camera-look:world-a:slot-2": JSON.stringify({ yaw: "bad", pitch: 0 }),
      "ai-game:game-ui-session:world-a": JSON.stringify({ version: 1, menu: { type: "tablet-home" } }),
      "ai-game:player-name": "Ada",
      "ai-game:local-game-data:slot-1": "{}",
      "llmville:unrelated": "keep",
    });

    const state = createLocalGameState(storage, storage);

    expect(state.readCameraLook(0, "world-a")).toEqual({ yaw: 1.25, pitch: -0.4 });
    expect(state.readCameraLook(2, "world-a")).toBeNull();
    expect(state.readMenu("world-a")).toEqual({ type: "tablet-home" });
    expect([...storage.map.keys()].filter((key) => key.startsWith("ai-game:"))).toEqual([]);
    expect(storage.getItem("llmville:unrelated")).toBe("keep");

    const reopened = createLocalGameState(storage, storage);
    expect(reopened.readCameraLook(0, "world-a")).toEqual({ yaw: 1.25, pitch: -0.4 });
  });

  test("an existing document wins over stray legacy keys", () => {
    const storage = memoryStorage({
      [LOCAL_GAME_STATE_KEY]: JSON.stringify({ version: 1, worlds: { w: { cameraLook: { "0": { yaw: 2, pitch: 0 } } } } }),
      "ai-game:camera-look:w:slot-0": JSON.stringify({ yaw: 9, pitch: 0 }),
    });
    const state = createLocalGameState(storage, storage);
    expect(state.readCameraLook(0, "w")).toEqual({ yaw: 2, pitch: 0 });
    expect(storage.getItem("ai-game:camera-look:w:slot-0")).toBeNull();
  });

  test("writes, snapshots and resets", () => {
    const storage = memoryStorage();
    const state = createLocalGameState(storage, storage);
    state.writeCameraLook(1, "w", { yaw: Number.NaN, pitch: 0.5 });
    state.writeMenu("w", { type: "closed" });
    expect(state.readCameraLook(1, "w")).toEqual({ yaw: 0, pitch: 0.5 });
    const snapshot = state.snapshot();
    state.reset();
    expect(state.readMenu("w")).toBeUndefined();
    expect(storage.getItem(LOCAL_GAME_STATE_KEY)).toBeNull();
    state.restore(snapshot);
    expect(state.readMenu("w")).toEqual({ type: "closed" });
  });

  test("corrupt documents start empty", () => {
    const storage = memoryStorage({ [LOCAL_GAME_STATE_KEY]: "{not json" });
    expect(createLocalGameState(storage, storage).readCameraLook(0, "w")).toBeNull();
  });
});

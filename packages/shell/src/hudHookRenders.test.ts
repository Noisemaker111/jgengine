import { describe, expect, test } from "bun:test";
import { act, createRoot, extend } from "@react-three/fiber";
import { createElement, type ReactElement } from "react";
import * as THREE from "three";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import type { QuestDef } from "@jgengine/core/game/quest";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { GameProvider } from "@jgengine/react/provider";
import { useFeed, useFriends, useQuestJournal } from "@jgengine/react/hooks";

const QUESTS: QuestDef[] = [
  { id: "cull", title: "Cull the pack", objectives: [{ id: "kill", kind: "kill", count: 3 }] },
];

function fixture(): GameContext {
  return createGameContext({
    definition: defineGameDefinition({
      name: "HUD hook renders",
      assets: createAssetCatalog(),
      multiplayer: "off",
      persist: false,
      features: { quest: true, social: true },
    }),
    content: {},
    player: { userId: "player", isNew: true },
  });
}

async function mounted(ctx: GameContext, element: ReactElement, run: () => Promise<void>) {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  extend(THREE);
  const root = createRoot({} as HTMLCanvasElement);
  await root.configure({
    frameloop: "never",
    size: { width: 400, height: 300, top: 0, left: 0 },
    dpr: 1,
    gl: () => ({ render() {}, setSize() {}, setPixelRatio() {} }) as unknown as THREE.WebGLRenderer,
  });
  try {
    await act(async () => {
      root.render(createElement(GameProvider, { context: ctx }, element));
    });
    await run();
  } finally {
    await act(async () => root.unmount());
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
}

/** A store write inside act, the way the live loop's writes arrive. */
async function write(change: () => void): Promise<void> {
  await act(async () => { change(); });
}

let renders = 0;

/** Stands where `ToastStack` (`packages/react/src/components.tsx`) reads the feed. */
function ToastRows() {
  const entries = useFeed({ action: "entity.died", limit: 5 });
  renders += 1;
  return createElement("group", { userData: { rows: entries.length } });
}

/** Stands where `JournalQuestTracker` (`registry/jgengine/journal-quest-tracker.tsx`) reads the journal. */
function JournalRows() {
  const journal = useQuestJournal();
  renders += 1;
  return createElement("group", { userData: { rows: journal.length, progress: journal[0]?.objectives[0]?.progress ?? 0 } });
}

/** Stands where `FriendsList` (`packages/react/src/social.tsx`) reads friends. */
function FriendRows() {
  const friends = useFriends();
  renders += 1;
  return createElement("group", { userData: { rows: friends.length } });
}

describe("HUD list hooks", () => {
  test("useFeed keeps one list through pose writes and re-renders on each pushed entry", async () => {
    renders = 0;
    const ctx = fixture();
    const actor = ctx.scene.entity.spawn("actor", { position: [0, 0, 0] });
    await mounted(ctx, createElement(ToastRows), async () => {
      expect(renders).toBe(1);

      for (let tick = 0; tick < 20; tick += 1) {
        await write(() => ctx.scene.entity.setPose(actor, { position: [tick, 0, 0], dt: 1 / 60 }));
      }
      expect(renders).toBe(1);

      await write(() => ctx.game.feed.push("entity.died", { victim: "grunt" }));
      expect(renders).toBe(2);

      await write(() => ctx.game.feed.push("entity.died", { victim: "brute" }));
      expect(renders).toBe(3);
    });
  });

  test("useQuestJournal keeps one list through pose writes and re-renders on accept, progress and abandon", async () => {
    renders = 0;
    const ctx = fixture();
    const quest = ctx.game.quest!;
    quest.register(QUESTS);
    const actor = ctx.scene.entity.spawn("actor", { position: [0, 0, 0] });
    await mounted(ctx, createElement(JournalRows), async () => {
      expect(renders).toBe(1);

      for (let tick = 0; tick < 20; tick += 1) {
        await write(() => ctx.scene.entity.setPose(actor, { position: [tick, 0, 0], dt: 1 / 60 }));
      }
      expect(renders).toBe(1);

      await write(() => { quest.accept("player", "cull"); });
      expect(renders).toBe(2);

      await write(() => { quest.progress("player", "cull", "kill", 1); });
      expect(renders).toBe(3);

      await write(() => { quest.abandon("player", "cull"); });
      expect(renders).toBe(4);
    });
  });

  test("useFriends keeps one list through pose writes and re-renders on an accepted friend", async () => {
    renders = 0;
    const ctx = fixture();
    const social = ctx.game.social!;
    const actor = ctx.scene.entity.spawn("actor", { position: [0, 0, 0] });
    await mounted(ctx, createElement(FriendRows), async () => {
      expect(renders).toBe(1);

      for (let tick = 0; tick < 20; tick += 1) {
        await write(() => ctx.scene.entity.setPose(actor, { position: [tick, 0, 0], dt: 1 / 60 }));
      }
      expect(renders).toBe(1);

      let requestId = "";
      await write(() => {
        const result = social.friends.request("player", "pal");
        if ("requestId" in result) requestId = result.requestId;
      });
      await write(() => { social.friends.accept("pal", requestId); });
      expect(renders).toBe(2);

      await write(() => { social.friends.remove("player", "pal"); });
      expect(renders).toBe(3);
    });
  });
});

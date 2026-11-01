import { expect, test } from "bun:test";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { createHostedWorldSession } from "@jgengine/core/runtime/hostedWorldSession";
import type { GameContext, GameContextContent } from "@jgengine/core/runtime/gameContext";
import { createHostRouter, loopbackPipe } from "./hostRouter";
import { createWsBackend } from "./createWsBackend";
import type { TransportPipeFactory } from "./pipe";
import { createWorldGameHost } from "./worldHost";

const CONTENT: GameContextContent = { entityById: () => ({ stats: { health: { max: 10 } } }) };

function setup() {
  const definition = defineGameDefinition({
    name: "Wire",
    assets: createAssetCatalog(),
    multiplayer: "off",
    features: { players: true },
    loop: {
      onNewPlayer(ctx: GameContext, player) {
        ctx.scene.entity.spawn("hero", { id: player!.userId, position: [0, 0, 0] });
      },
      onTick(ctx: GameContext, dt) {
        const hero = ctx.scene.entity.get("alice");
        if (hero) ctx.scene.entity.setPose("alice", { position: [hero.position[0] + dt * 3.333, 0, 0] });
      },
    },
  });
  const session = createHostedWorldSession({ definition, content: CONTENT });
  const host = createWorldGameHost({ session: () => session });
  const router = createHostRouter({ host, allowAnonymous: true, precision: { position: 2 } });
  return { host, router };
}

function recordingPipe(router: ReturnType<typeof createHostRouter>, kinds: string[]): TransportPipeFactory {
  const inner = loopbackPipe(router);
  return (handlers) => inner({ ...handlers, onMessage: (data) => { kinds.push(typeof data === "string" ? "text" : "binary"); handlers.onMessage(data); } });
}

async function settle(router: ReturnType<typeof createHostRouter>) {
  await new Promise((resolve) => setTimeout(resolve, 10));
  await router.drain();
}

function firstEntityX(view: unknown): number | undefined {
  const state = (view as { serverState?: { snapshot?: { entities?: { position: number[] }[] } } } | null)?.serverState;
  return state?.snapshot?.entities?.[0]?.position[0];
}

for (const codec of ["binary", "json"] as const) {
  test(`a client on the ${codec} codec receives the world from the host`, async () => {
    const { host, router } = setup();
    const kinds: string[] = [];
    const backend = createWsBackend({ userId: "alice", pipe: recordingPipe(router, kinds), codec });
    const views: unknown[] = [];
    try {
      const joined = await backend.transport.joinServer({ gameId: "wire" });
      if (!joined.ok) throw new Error("join failed");
      backend.feeds!.subscribeServer("wire", (view) => views.push(view));
      await settle(router);
      for (let i = 0; i < 3; i += 1) {
        host.tick(0.05);
        await settle(router);
      }
      expect(views.length).toBeGreaterThan(1);
      expect(kinds.includes(codec === "binary" ? "binary" : "text")).toBe(true);
      if (codec === "json") expect(kinds.includes("binary")).toBe(false);
      const last = views[views.length - 1] as { serverState: { kind: string; diff?: { entities: { id: string; position: number[] }[] } } };
      const moved = last.serverState.diff?.entities.find((entity) => entity.id === "alice");
      expect(moved?.position[0]).toBeCloseTo(0.5, 1);
    } finally {
      backend.close();
      router.close();
      await router.drain();
      await host.stop();
    }
  });
}

test("the first world frame of a binary client carries the baseline entities", async () => {
  const { host, router } = setup();
  const backend = createWsBackend({ userId: "alice", pipe: loopbackPipe(router) });
  const views: unknown[] = [];
  try {
    const joined = await backend.transport.joinServer({ gameId: "wire" });
    if (!joined.ok) throw new Error("join failed");
    backend.feeds!.subscribeServer("wire", (view) => views.push(view));
    await settle(router);
    expect(firstEntityX(views.find((view) => view !== null))).toBe(0);
  } finally {
    backend.close();
    router.close();
    await router.drain();
    await host.stop();
  }
});

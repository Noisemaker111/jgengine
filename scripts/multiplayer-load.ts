/**
 * Replication load probe: N clients on one hosted world with E entities, ticked at 20 Hz.
 * Prints server-to-client bytes per tick and host ms per tick (tick + projection + encode, client decode excluded).
 *
 *   bun scripts/multiplayer-load.ts [--clients 8,32,64] [--entities 500,2000] [--ticks 40]
 *     [--codec json|binary] [--radius <world units>] [--table]
 *
 * Not a CI gate. `--codec` and `--radius` are ignored by builds that predate them.
 */
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { createHostedWorldSession } from "@jgengine/core/runtime/hostedWorldSession";
import type { GameContext, GameContextContent } from "@jgengine/core/runtime/gameContext";
import { createHostRouter, loopbackPipe } from "../packages/ws/src/hostRouter";
import { createWsBackend } from "../packages/ws/src/createWsBackend";
import type { TransportPipeFactory } from "../packages/ws/src/pipe";
import { createWorldGameHost } from "../packages/ws/src/worldHost";

const WORLD = 1000;
const DT = 0.05;

function flag(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 && process.argv[at + 1] !== undefined ? process.argv[at + 1]! : fallback;
}

function list(name: string, fallback: string): number[] {
  return flag(name, fallback).split(",").map(Number);
}

const CONTENT: GameContextContent = {
  entityById: (id) => (id === "hero" || id === "npc" ? { stats: { health: { max: 10 } } } : null),
};

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Result = { clients: number; entities: number; bytesPerTick: number; bytesPerClientTick: number; hostMsPerTick: number };

async function run(clients: number, entities: number, ticks: number, codec: string, radius: number | undefined): Promise<Result> {
  const random = rng(clients * 100_003 + entities);
  const npcIds: string[] = [];
  const definition = defineGameDefinition({
    name: "Load",
    assets: createAssetCatalog(),
    multiplayer: "off",
    features: { players: true },
    ...(radius === undefined ? {} : { replication: { aoiRadius: radius } }),
    loop: {
      onNewPlayer(ctx: GameContext, player) {
        ctx.scene.entity.spawn("hero", { id: player!.userId, position: [random() * WORLD, 0, random() * WORLD] });
      },
      onTick(ctx: GameContext, dt) {
        for (const id of npcIds) {
          const e = ctx.scene.entity.get(id);
          if (!e) continue;
          const x = Math.min(WORLD, Math.max(0, e.position[0] + (random() - 0.5) * 8 * dt * 20));
          const z = Math.min(WORLD, Math.max(0, e.position[2] + (random() - 0.5) * 8 * dt * 20));
          ctx.scene.entity.setPose(id, { position: [x, 0, z], rotationY: random() * 6.28 });
        }
      },
    },
  });
  const session = createHostedWorldSession({ definition, content: CONTENT });
  const host = createWorldGameHost({ session: () => session });
  const router = createHostRouter({ host, allowAnonymous: true });
  const ctx = session.runner().context();
  for (let i = 0; i < Math.max(0, entities - clients); i += 1) {
    const id = `npc${i}`;
    npcIds.push(id);
    ctx.scene.entity.spawn("npc", { id, position: [random() * WORLD, 0, random() * WORLD] });
  }

  let counting = false;
  let bytes = 0;
  const countingPipe = (): TransportPipeFactory => {
    const inner = loopbackPipe(router);
    return (handlers) =>
      inner({
        ...handlers,
        onMessage: (data) => {
          if (!counting) {
            handlers.onMessage(data);
            return;
          }
          bytes += typeof data === "string" ? new TextEncoder().encode(data).length : (data as Uint8Array).byteLength;
        },
      });
  };
  const options: Record<string, unknown> = {};
  if (codec !== "default") options["codec"] = codec;
  const backends = [];
  for (let i = 0; i < clients; i += 1) {
    const backend = createWsBackend({ userId: `u${i}`, pipe: countingPipe(), ...options } as never);
    const joined = await backend.transport.joinServer({ gameId: "shared" });
    if (!joined.ok) throw new Error("join failed");
    backend.feeds!.subscribeServer("shared", () => {});
    backends.push(backend);
  }
  await router.drain();
  await new Promise((resolve) => setTimeout(resolve, 20));
  await router.drain();

  let hostMs = 0;
  for (let t = 0; t < ticks + 5; t += 1) {
    if (t === 5) {
      counting = true;
      bytes = 0;
      hostMs = 0;
    }
    const start = performance.now();
    host.tick(DT);
    await router.drain();
    hostMs += performance.now() - start;
    await new Promise((resolve) => setTimeout(resolve, 0));
    await router.drain();
  }
  const measured = ticks;
  for (const backend of backends) backend.close();
  router.close();
  await router.drain();
  await host.stop();
  return {
    clients,
    entities,
    bytesPerTick: Math.round(bytes / measured),
    bytesPerClientTick: Math.round(bytes / measured / clients),
    hostMsPerTick: Math.round((hostMs / measured) * 100) / 100,
  };
}

const codec = flag("codec", "default");
const radiusArg = flag("radius", "");
const radius = radiusArg === "" ? undefined : Number(radiusArg);
const ticks = Number(flag("ticks", "40"));
const rows: Result[] = [];
for (const entities of list("entities", "500,2000")) {
  for (const clients of list("clients", "8,32,64")) {
    rows.push(await run(clients, entities, ticks, codec, radius));
  }
}
console.log(`codec=${codec} radius=${radius ?? "off"} ticks=${ticks} dt=${DT}`);
console.log("| clients | entities | bytes/tick (all clients) | bytes/tick/client | host ms/tick |");
console.log("|---:|---:|---:|---:|---:|");
for (const r of rows) {
  console.log(`| ${r.clients} | ${r.entities} | ${r.bytesPerTick} | ${r.bytesPerClientTick} | ${r.hostMsPerTick} |`);
}
process.exit(0);

/**
 * Headless proof: a real in-repo game hosted at 20 Hz with two local clients over the binary delta codec and
 * a spatial interest radius. Each client must join, receive a baseline, then diffs, see its own entity and the
 * nearby wanderer, and never see the other player's entity 500 units away.
 *
 *   bun scripts/multiplayer-two-clients.ts [--game odd-orbit] [--radius 60] [--ticks 40]
 */
import { createHostedWorldSession } from "@jgengine/core/runtime/hostedWorldSession";
import { DEFAULT_HOST_TICK_MS } from "@jgengine/core/runtime/hostPolicy";
import { createHostRouter, loopbackPipe } from "../packages/ws/src/hostRouter";
import { createWsBackend } from "../packages/ws/src/createWsBackend";
import { createWorldGameHost } from "../packages/ws/src/worldHost";

function flag(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  // type-escape: test and probe code reads untyped frames
  return at >= 0 && process.argv[at + 1] !== undefined ? process.argv[at + 1]! : fallback;
}

const gameId = flag("game", "odd-orbit");
const radius = Number(flag("radius", "60"));
const ticks = Number(flag("ticks", "40"));

const module = await import(`../games/${gameId}/src/game.config`);
const playable = module.game;
const definition = { ...playable.game, replication: { aoiRadius: radius } };
const session = createHostedWorldSession({ definition, content: playable.content });
const host = createWorldGameHost({ session: () => session });
const router = createHostRouter({ host, allowAnonymous: true });

type Seen = { baselines: number; diffs: number; entityIds: Set<string> };
const clients = ["alice", "bob"].map((userId) => {
  const seen: Seen = { baselines: 0, diffs: 0, entityIds: new Set() };
  const backend = createWsBackend({ userId, pipe: loopbackPipe(router) });
  return { userId, seen, backend };
});

for (const client of clients) {
  const joined = await client.backend.transport.joinServer({ gameId: "shared" });
  if (!joined.ok) throw new Error(`${client.userId} failed to join`);
  // type-escape: test and probe code reads untyped frames
  client.backend.feeds!.subscribeServer("shared", (view) => {
    // type-escape: test and probe code reads untyped frames
    const frame = (view as { serverState?: { kind?: string; snapshot?: { entities?: { id: string }[] }; diff?: { entities?: { id: string }[] } } } | null)?.serverState;
    if (frame?.kind === "baseline") client.seen.baselines += 1;
    if (frame?.kind === "diff") client.seen.diffs += 1;
    for (const entity of frame?.snapshot?.entities ?? frame?.diff?.entities ?? []) client.seen.entityIds.add(entity.id);
  });
}
const ctx = session.runner().context();
ctx.scene.entity.spawn("npc", { id: "alice", position: [0, 0, 0] });
ctx.scene.entity.spawn("npc", { id: "bob", position: [500, 0, 0] });
ctx.scene.entity.spawn("npc", { id: "wanderer", position: [0, 0, 0] });
const dt = DEFAULT_HOST_TICK_MS / 1000;
for (let tick = 0; tick < ticks; tick += 1) {
  ctx.scene.entity.setPose("wanderer", { position: [tick * 0.5, 0, 0] });
  host.tick(dt);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await router.drain();
}
let failed = false;
for (const client of clients) {
  const { baselines, diffs, entityIds } = client.seen;
  const other = client.userId === "alice" ? "bob" : "alice";
  const wanderer = entityIds.has("wanderer");
  const ok = baselines >= 1 && diffs >= 1 && entityIds.has(client.userId) && !entityIds.has(other) && wanderer === (client.userId === "alice");
  failed ||= !ok;
  console.log(`${client.userId}: baselines=${baselines} diffs=${diffs} entities=[${[...entityIds].join(",")}] ${ok ? "ok" : "FAIL"}`);
}
for (const client of clients) client.backend.close();
router.close();
await router.drain();
await host.stop();
console.log(`${gameId}: ${failed ? "FAILED" : "two clients played"} (tick ${DEFAULT_HOST_TICK_MS} ms, radius ${radius})`);
process.exit(failed ? 1 : 0);

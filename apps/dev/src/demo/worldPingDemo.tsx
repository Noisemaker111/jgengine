import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import {
  createPingSystem,
  DEFAULT_PING_CATEGORIES,
  PING_FEED_ACTION,
  type PingCategory,
  type PingSystem,
} from "@jgengine/core/game/ping";
import type { PointerHit } from "@jgengine/core/input/pointer";
import type {
  GameContext,
  GameContextEntityEntry,
  GameContextObjectEntry,
} from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { environment, grass, terrain } from "@jgengine/core/world/features";
import { createMarkerSet, type MarkerSet } from "@jgengine/core/world/markers";
import { useFeed } from "@jgengine/react/hooks";

import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import { WorldPings } from "@jgengine/shell/world/WorldPings";
import type { PlayableGame } from "@jgengine/shell/registry";

const SCOUT = "scout";
const RELAY = "relay";
const CRATE = "crate";

const objectPingCategory: Record<string, PingCategory> = {
  [CRATE]: "loot",
};

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [SCOUT]: { movement: { walkSpeed: 6 }, role: "player" },
  [RELAY]: { role: "npc" },
};

const objectCatalog: Record<string, GameContextObjectEntry> = {
  [CRATE]: {},
};

const CRATES: readonly [number, number, number][] = [
  [10, 0, 8],
  [-12, 0, -6],
];

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 90, d: 90 }, height: 3, frequency: 0.03, seed: "pings" }),
  vegetation: grass({ area: { w: 76, d: 76 }, density: 3, colors: ["#2f4f1e", "#8fbf4a"], seed: "pings" }),
});

const markerSet: MarkerSet = createMarkerSet();
let pingSystem: PingSystem | null = null;

const game = defineGameDefinition({
  name: "world-pings",
  assets: createAssetCatalog(),
  multiplayer: null,
  features: { social: true },
  inventories: {},
  input: {
    moveForward: ["KeyW"],
    moveBack: ["KeyS"],
    moveLeft: ["KeyA"],
    moveRight: ["KeyD"],
    ping: ["KeyQ"],
  },
});

function onInit(ctx: GameContext): void {
  markerSet.clear();
  pingSystem = createPingSystem({
    markers: markerSet,
    feed: { push: (action, entry) => ctx.game.feed.push(action, entry) },
    party: ctx.game.social!.party,
    ttlMs: 8000,
    categories: DEFAULT_PING_CATEGORIES,
    classify: {
      roleOf: (id) => {
        const entity = ctx.scene.entity.get(id);
        return entity === null ? null : entityCatalog[entity.name]?.role ?? null;
      },
      categoryOf: (id) => {
        const object = ctx.scene.object.get(id);
        return object === null ? null : objectPingCategory[object.catalogId] ?? null;
      },
    },
  });

  ctx.game.commands.define("map.ping", {
    apply(state, input) {
      pingSystem?.ping(state.player.userId, input as PointerHit);
      return state;
    },
  });

  for (const position of CRATES) ctx.scene.object.place(CRATE, position[0], 0, position[2]);
}

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(SCOUT, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
  ctx.scene.entity.spawn(RELAY, { id: "relay-1", position: [6, 0, -14], role: "npc" });
  // Seed a few persistent demo pings (no ttl) so the world markers are always
  // visible; the pointer ping below uses the short ttl to show the fade-out.
  markerSet.add({ id: "seed-loot", kind: "loot", position: [10, 0, 8], label: "Loot here", meta: { ping: true, callout: "Loot here" } });
  markerSet.add({ id: "seed-here", kind: "location", position: [-8, 0, 12], label: "Going here", meta: { ping: true, callout: "Going here" } });
  markerSet.add({ id: "seed-enemy", kind: "enemy", position: [4, 0, -13], label: "Enemy spotted", meta: { ping: true, callout: "Enemy spotted" } });
}

function onTick(): void {
  markerSet.prune(Date.now());
}

function PingUI() {
  const pings = useFeed({ action: PING_FEED_ACTION, limit: 4 });
  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <div className="absolute left-4 top-4 rounded-lg border border-cyan-300/25 bg-neutral-900/80 px-4 py-3 shadow-xl backdrop-blur-sm">
        <h1 className="text-sm font-semibold tracking-wide text-cyan-200">World Pings</h1>
        <p className="text-xs text-white/60">
          Press <span className="text-cyan-300">Q</span> to ping what you aim at — the arrow + callout appears in the world.
        </p>
      </div>
      <div className="absolute bottom-4 left-4 w-64 rounded-lg border border-white/15 bg-neutral-900/80 p-3 text-[12px] leading-6 shadow-xl backdrop-blur-sm">
        <div className="mb-1 border-b border-white/10 pb-1 text-[10px] font-semibold uppercase tracking-widest text-white/45">
          Callouts
        </div>
        {pings.length === 0 ? (
          <p className="text-white/50">No pings yet.</p>
        ) : (
          <ul className="text-white/85">
            {[...pings].reverse().map((entry, index) => {
              const payload = entry.data as { callout: string };
              return (
                <li key={`${entry.at}-${index}`} className="flex items-center gap-2">
                  <span className="text-cyan-300">◎</span>
                  {payload.callout}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export const worldPingDemoGame: PlayableGame = {
  game,
  content: {
    entityById: (catalogId) => entityCatalog[catalogId] ?? null,
    objectById: (catalogId) => objectCatalog[catalogId] ?? null,
  },
  loop: { onInit, onNewPlayer, onTick, onReset: () => {}, onDispose: () => {} },
  GameUI: PingUI,
  environment: () => <EnvironmentScene feature={terrainFeature} />,
  WorldOverlay: () => <WorldPings markers={markerSet} />,
  pointer: { pingCommand: "map.ping" },
  camera: {
    initialDistance: 34,
    initialHeight: 26,
    minDistance: 12,
    maxDistance: 70,
    targetHeight: 0,
    maxPolarAngle: 1.3,
  },
};

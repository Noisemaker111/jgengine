import { useMemo, useSyncExternalStore } from "react";

import { defineGame } from "@jgengine/core/game/defineGame";
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
import { createFogField, type FogField } from "@jgengine/core/world/fog";
import { createMarkerSet, type MarkerSet } from "@jgengine/core/world/markers";
import { resolveTerrainField, type TerrainField } from "@jgengine/core/world/terrain";
import { Compass, Minimap, WorldMap } from "@jgengine/react/map";
import { usePlayer, useSceneEntities, useFeed } from "@jgengine/react/hooks";

import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import { bakeTerrainMap, type BakedMap } from "@jgengine/shell/map/terrainMap";
import { MapMarkerBeacons } from "@jgengine/shell/map/MapMarkerBeacons";
import type { PlayableGame } from "@jgengine/shell/registry";

const SCOUT = "scout";
const RAIDER = "raider";
const CACHE = "cache";
const HAZARD = "hazard";
const RAIDER_ID = "raider-1";
const RAIDER_MARKER = "raider-marker";

const BOUNDS = { minX: -60, minZ: -60, maxX: 60, maxZ: 60 };
const FOG_CELL = 6;

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 120, d: 120 }, height: 5, frequency: 0.03, seed: "extraction", waterLevel: -2 }),
  vegetation: grass({ area: { w: 100, d: 100 }, density: 4, colors: ["#2f4f1e", "#8fbf4a"], seed: "extraction" }),
});

const objectPingCategory: Record<string, PingCategory> = {
  [CACHE]: "loot",
  [HAZARD]: "danger",
};

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [SCOUT]: { movement: { walkSpeed: 6 }, role: "player" },
  [RAIDER]: { movement: { walkSpeed: 4 }, role: "enemy" },
};

const objectCatalog: Record<string, GameContextObjectEntry> = {
  [CACHE]: {},
  [HAZARD]: {},
};

const OBJECTIVES: readonly { id: string; label: string; position: [number, number, number] }[] = [
  { id: "obj-extract", label: "Extraction", position: [44, 0, -46] },
  { id: "obj-relay", label: "Relay", position: [-40, 0, 30] },
];
const CACHES: readonly [number, number, number][] = [
  [18, 0, 12],
  [-26, 0, -18],
  [8, 0, -34],
];
const HAZARDS: readonly [number, number, number][] = [[-12, 0, -6]];

const terrainField: TerrainField = resolveTerrainField(terrainFeature.terrain);
const markerSet: MarkerSet = createMarkerSet();
const fogField: FogField = createFogField({ bounds: BOUNDS, cellSize: FOG_CELL });

let pingSystem: PingSystem | null = null;
let raiderAngle = 0;
let lastPlayerXZ: [number, number] | null = null;

let worldMapOpen = true;
const mapListeners = new Set<() => void>();
function setWorldMapOpen(open: boolean): void {
  worldMapOpen = open;
  for (const listener of mapListeners) listener();
}

const game = defineGame({
  name: "extraction-map",
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
    toggleMap: ["KeyM"],
  },
});

function seedMarkers(): void {
  markerSet.clear();
  for (const objective of OBJECTIVES) {
    markerSet.add({ id: objective.id, kind: "objective", position: objective.position, label: objective.label });
  }
  CACHES.forEach((position, index) => {
    markerSet.add({ id: `cache-${index}`, kind: "loot", position, label: "Supply cache" });
  });
  HAZARDS.forEach((position, index) => {
    markerSet.add({ id: `hazard-${index}`, kind: "danger", position, label: "Minefield" });
  });
}

function onInit(ctx: GameContext): void {
  raiderAngle = 0;
  lastPlayerXZ = null;
  worldMapOpen = true;
  fogField.reset();
  seedMarkers();

  fogField.reveal(0, 0, 22);
  fogField.revealAlong([0, 0], [18, 12], 10);
  fogField.revealAlong([0, 0], [-26, -18], 8);

  pingSystem = createPingSystem({
    markers: markerSet,
    feed: { push: (action, entry) => ctx.game.feed.push(action, entry) },
    party: ctx.game.social!.party,
    ttlMs: 45_000,
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
      if (pingSystem === null) return state;
      pingSystem.ping(state.player.userId, input as PointerHit);
      return state;
    },
  });
  ctx.game.commands.define("ui.toggleMap", {
    apply(state) {
      setWorldMapOpen(!worldMapOpen);
      return state;
    },
  });

  for (const position of CACHES) ctx.scene.object.place(CACHE, position[0], 0, position[2]);
  for (const position of HAZARDS) ctx.scene.object.place(HAZARD, position[0], 0, position[2]);
}

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(SCOUT, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
  ctx.scene.entity.spawn(RAIDER, { id: RAIDER_ID, position: [24, 0, -24], role: "npc" });
  markerSet.add({ id: RAIDER_MARKER, kind: "enemy", position: [24, 0, -24], label: "Raider" });
  if (pingSystem !== null) {
    pingSystem.ping(ctx.player.userId, {
      point: [30, 0, 8],
      normal: [0, 1, 0],
      entity: null,
      object: null,
    }, "location");
  }
}

function onTick(ctx: GameContext, dt: number): void {
  raiderAngle += dt * 0.4;
  const raiderX = 24 + Math.cos(raiderAngle) * 14;
  const raiderZ = -24 + Math.sin(raiderAngle) * 14;
  ctx.scene.entity.setPose(RAIDER_ID, { position: [raiderX, 0, raiderZ], rotationY: raiderAngle, dt });
  markerSet.add({ id: RAIDER_MARKER, kind: "enemy", position: [raiderX, 0, raiderZ], label: "Raider" });

  const player = ctx.scene.entity.get(ctx.player.userId);
  if (player !== null) {
    const here: [number, number] = [player.position[0], player.position[2]];
    if (lastPlayerXZ === null) fogField.reveal(here[0], here[1], 14);
    else fogField.revealAlong(lastPlayerXZ, here, 14);
    lastPlayerXZ = here;
  }

  markerSet.prune(Date.now());
}

function useWorldMapOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      mapListeners.add(listener);
      return () => mapListeners.delete(listener);
    },
    () => worldMapOpen,
    () => worldMapOpen,
  );
}

function MapUI() {
  const player = usePlayer();
  const entities = useSceneEntities();
  const pings = useFeed({ action: PING_FEED_ACTION, limit: 3 });
  const open = useWorldMapOpen();
  const self =
    entities.find((entity) => entity.id === player.userId) ??
    entities.find((entity) => entity.role === "player") ??
    null;
  const center: [number, number] = self === null ? [0, 0] : [self.position[0], self.position[2]];
  const facingYaw = self === null ? 0 : self.rotationY;
  const baked: BakedMap | null = useMemo(() => bakeTerrainMap(terrainField, BOUNDS, { resolution: 160 }), []);
  const background = baked?.url;

  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <div className="absolute left-1/2 top-4 -translate-x-1/2">
        <Compass facingYaw={facingYaw} center={center} markers={markerSet} width={360} />
      </div>

      {open ? (
        <div className="pointer-events-auto absolute left-4 top-4">
          <WorldMap
            markers={markerSet}
            bounds={BOUNDS}
            fog={fogField}
            player={center}
            facingYaw={facingYaw}
            background={background}
            width={340}
            onClose={() => setWorldMapOpen(false)}
          />
        </div>
      ) : (
        <div className="absolute left-4 top-16 rounded-md border border-white/15 bg-neutral-900/80 px-3 py-2 text-[11px] text-white/60">
          Press <span className="text-emerald-300">M</span> for the world map
        </div>
      )}

      <div className="absolute bottom-4 right-4">
        <Minimap
          markers={markerSet}
          fog={fogField}
          center={center}
          facingYaw={facingYaw}
          worldRadius={46}
          size={188}
          background={background}
          mapBounds={BOUNDS}
          title="Sector"
        />
      </div>

      <div className="absolute bottom-4 left-4 w-64 rounded-lg border border-white/15 bg-neutral-900/80 p-3 text-[12px] leading-6 shadow-xl backdrop-blur-sm">
        <div className="mb-1 border-b border-white/10 pb-1 text-[10px] font-semibold uppercase tracking-widest text-white/45">
          Comms
        </div>
        {pings.length === 0 ? (
          <p className="text-white/50">Press Q to ping what you aim at.</p>
        ) : (
          <ul className="text-white/85">
            {[...pings].reverse().map((entry, index) => {
              const payload = entry.data as { callout: string; category: string };
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

export const mapDemoGame: PlayableGame = {
  game,
  content: {
    entityById: (catalogId) => entityCatalog[catalogId] ?? null,
    objectById: (catalogId) => objectCatalog[catalogId] ?? null,
  },
  loop: { onInit, onNewPlayer, onTick },
  GameUI: MapUI,
  environment: () => <EnvironmentScene feature={terrainFeature} />,
  WorldOverlay: () => <MapMarkerBeacons markers={markerSet} />,
  pointer: { pingCommand: "map.ping" },
  camera: {
    initialDistance: 40,
    initialHeight: 34,
    minDistance: 16,
    maxDistance: 80,
    targetHeight: 0,
    maxPolarAngle: 1.35,
  },
};

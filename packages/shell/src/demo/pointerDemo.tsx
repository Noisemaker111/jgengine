import { defineGame } from "@jgengine/core/game/defineGame";
import { contextVerb } from "@jgengine/core/interaction/contextMenu";
import {
  createNavGrid,
  findPath,
  type NavGrid,
} from "@jgengine/core/nav/navGrid";
import {
  advancePathFollow,
  createPathFollow,
  pathFromNav,
  type PathFollowConfig,
  type PathFollowState,
  type Waypoint,
} from "@jgengine/core/nav/pathFollow";
import type {
  GameContext,
  GameContextEntityEntry,
  GameContextObjectEntry,
} from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";

import type { PlayableGame } from "../registry";

const VILLAGER = "villager";
const CREEP = "creep";
const BOULDER = "boulder";
const CREEP_ID = "creep-1";

const BOUNDS = { minX: -24, minZ: -24, maxX: 24, maxZ: 24 };
const CELL = 1.5;
const OBSTACLES: readonly (readonly [number, number])[] = [
  [-6, -4],
  [5, 6],
  [8, -9],
  [-11, 8],
];
const SQUAD: readonly (readonly [number, number, number])[] = [
  [3, 0, 2],
  [-3, 0, 2],
  [0, 0, 4],
];
const CREEP_PATH: readonly Waypoint[] = [
  [-22, 0, -16],
  [-8, 0, -16],
  [-8, 0, 10],
  [10, 0, 10],
  [10, 0, -14],
  [22, 0, -14],
];

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [VILLAGER]: {
    movement: { walkSpeed: 5 },
    role: "npc",
    verbs: [contextVerb("Stop", "unit.stop"), contextVerb("Cheer", "unit.cheer")],
  },
  [CREEP]: { role: "enemy" },
};

const objectCatalog: Record<string, GameContextObjectEntry> = {
  [BOULDER]: { verbs: [contextVerb("Inspect", "world.inspect")] },
};

interface Mover {
  config: PathFollowConfig;
  state: PathFollowState;
}

let nav: NavGrid | null = null;
const movers = new Map<string, Mover>();
let creep: Mover | null = null;

interface OrderInput {
  selection: string[];
  point: [number, number, number];
}
interface TargetInput {
  target: string;
  point?: [number, number, number];
}

function orderUnit(ctx: GameContext, id: string, point: readonly [number, number, number]): void {
  if (nav === null) return;
  const unit = ctx.scene.entity.get(id);
  if (unit === null) return;
  const route = findPath(nav, [unit.position[0], unit.position[2]], [point[0], point[2]], { clearance: 1.4 });
  if (route === null) return;
  const config: PathFollowConfig = { waypoints: pathFromNav(route, 0), speed: unit.movement.walkSpeed ?? 5 };
  movers.set(id, { config, state: createPathFollow(config) });
}

const game = defineGame({
  name: "pointer-commander",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: {},
  input: {
    moveForward: ["KeyW"],
    moveBack: ["KeyS"],
    moveLeft: ["KeyA"],
    moveRight: ["KeyD"],
  },
});

function onInit(ctx: GameContext): void {
  movers.clear();
  creep = null;
  const grid = createNavGrid({ bounds: BOUNDS, cellSize: CELL });
  for (const [x, z] of OBSTACLES) {
    ctx.scene.object.place(BOULDER, x, 0, z);
    grid.blockAabb({ minX: x - 1.6, minZ: z - 1.6, maxX: x + 1.6, maxZ: z + 1.6 });
  }
  nav = grid;

  ctx.game.commands.define<OrderInput>("unit.order", {
    apply(state, input) {
      for (const id of input.selection) orderUnit(state, id, input.point);
      return state;
    },
  });
  ctx.game.commands.define<TargetInput>("unit.stop", {
    apply(state, input) {
      movers.delete(input.target);
      return state;
    },
  });
  ctx.game.commands.define<TargetInput>("unit.cheer", {
    apply(state, input) {
      state.scene.entity.floatText({ instanceId: input.target, text: "For the realm!", kind: "info" });
      return state;
    },
  });
  ctx.game.commands.define<TargetInput>("world.inspect", {
    apply(state, input) {
      if (input.point !== undefined) state.scene.entity.floatText({ position: input.point, text: "Granite", kind: "info" });
      return state;
    },
  });
}

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(VILLAGER, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
  for (const position of SQUAD) ctx.scene.entity.spawn(VILLAGER, { position, role: "npc" });
  const config: PathFollowConfig = { waypoints: CREEP_PATH, speed: 3.5, loop: true };
  creep = { config, state: createPathFollow(config) };
  ctx.scene.entity.spawn(CREEP, { id: CREEP_ID, position: CREEP_PATH[0], role: "npc" });
}

function onTick(ctx: GameContext, dt: number): void {
  for (const [id, mover] of movers) {
    mover.state = advancePathFollow(mover.config, mover.state, dt);
    ctx.scene.entity.setPose(id, { position: mover.state.position, rotationY: mover.state.heading, dt });
    if (mover.state.done) movers.delete(id);
  }
  if (creep !== null) {
    creep.state = advancePathFollow(creep.config, creep.state, dt);
    ctx.scene.entity.setPose(CREEP_ID, { position: creep.state.position, rotationY: creep.state.heading, dt });
  }
}

function CommanderUI() {
  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <div className="absolute left-4 top-4 rounded-lg border border-emerald-300/25 bg-neutral-900/80 px-4 py-3 shadow-xl backdrop-blur-sm">
        <h1 className="text-sm font-semibold tracking-wide text-emerald-200">RTS Commander</h1>
        <p className="text-xs text-white/60">Pointer-driven unit command</p>
      </div>
      <div className="absolute bottom-4 left-4 w-72 rounded-lg border border-white/15 bg-neutral-900/80 p-3 text-[13px] leading-6 shadow-xl backdrop-blur-sm">
        <div className="mb-1 border-b border-white/10 pb-1 text-[10px] font-semibold uppercase tracking-widest text-white/45">
          Controls
        </div>
        <ul className="text-white/80">
          <li><span className="text-emerald-300">Left-drag</span> — box-select villagers</li>
          <li><span className="text-emerald-300">Left-click</span> — select one</li>
          <li><span className="text-emerald-300">Right-click ground</span> — move here (A*)</li>
          <li><span className="text-emerald-300">Right-click unit / rock</span> — verb menu</li>
          <li><span className="text-emerald-300">Middle-drag</span> — orbit · wheel — zoom</li>
        </ul>
      </div>
      <div className="absolute bottom-4 right-4 max-w-[220px] rounded-lg border border-white/10 bg-neutral-900/70 px-3 py-2 text-right text-[11px] text-white/50">
        Green ring = selected. The looping creep walks an authored path (tower-defense pathFollow).
      </div>
    </div>
  );
}

export const pointerDemoGame: PlayableGame = {
  game,
  content: {
    entityById: (catalogId) => entityCatalog[catalogId] ?? null,
    objectById: (catalogId) => objectCatalog[catalogId] ?? null,
  },
  loop: { onInit, onNewPlayer, onTick },
  GameUI: CommanderUI,
  pointer: {
    select: true,
    selectFilter: (id) => id !== CREEP_ID,
    orderCommand: "unit.order",
    contextMenu: true,
  },
  camera: {
    initialDistance: 34,
    initialHeight: 28,
    minDistance: 12,
    maxDistance: 64,
    targetHeight: 0,
    maxPolarAngle: 1.25,
  },
};

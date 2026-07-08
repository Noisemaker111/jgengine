import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { createNavGrid, findPath, type NavGrid, type NavPoint } from "@jgengine/core/nav/navGrid";

import {
  chaseTargetCell,
  farthestCorner,
  frightSecondsForLevel,
  ghostChainScore,
  ghostSpeedForLevel,
  scheduledMode,
  slideMove,
  type Dir,
  type Mode,
} from "./game/ai";
import { LIVES, MUNCHER, SCORE, START_LIVES } from "./game/catalog";
import {
  CORNERS,
  cellKey,
  cellToWorld,
  GHOSTS,
  isWall,
  NAV_BOUNDS,
  PEN_CENTER,
  PLAYER_START,
  pelletCells,
  powerCells,
  worldToCell,
  type Cell,
  type GhostDef,
} from "./game/maze";

export type Phase = "playing" | "levelup" | "won" | "lost";

const EAT_RADIUS = 0.72;
const PELLET_SCORE = 10;
const POWER_SCORE = 50;
const RETARGET_INTERVAL = 0.4;
const SPEED_FRIGHT = 2.4;
const SPEED_EATEN = 8;
const LEVEL_UP_PAUSE = 2;
export const MAX_LEVEL = 5;

interface GhostState {
  def: GhostDef;
  route: NavPoint[] | null;
  ri: number;
  mode: Mode;
  retargetAt: number;
}

let nav: NavGrid | null = null;
let elapsed = 0;
let phase: Phase = "playing";
let level = 1;
let levelStartElapsed = 0;
let levelUpUntil = 0;
let frightenedUntil = 0;
let ghostChain = 0;
let lastMuncher: [number, number] = [0, 0];
let muncherDir: Dir = { dc: 0, dr: -1 };
const pelletSet = new Set<string>();
const powerSet = new Set<string>();
const ghosts = new Map<string, GhostState>();

function levelElapsed(): number {
  return elapsed - levelStartElapsed;
}

export function getPhase(): Phase {
  return phase;
}
export function getLevel(): number {
  return level;
}
export function getLevelUpRemaining(): number {
  return Math.max(0, levelUpUntil - elapsed);
}
export function pelletsLeft(): number {
  return pelletSet.size + powerSet.size;
}
export function getFrightenedRemaining(): number {
  return Math.max(0, frightenedUntil - elapsed);
}
export function ghostModeOf(id: string): Mode | null {
  return ghosts.get(id)?.mode ?? null;
}
export function remainingPelletCells(): Cell[] {
  return pelletCells.filter((cell) => pelletSet.has(cellKey(cell.c, cell.r)));
}
export function remainingPowerCells(): Cell[] {
  return powerCells.filter((cell) => powerSet.has(cellKey(cell.c, cell.r)));
}

export function onInit(ctx: GameContext): void {
  const grid = createNavGrid({ bounds: NAV_BOUNDS, cellSize: 1, diagonal: false });
  grid.reset(true);
  for (let r = 0; r < grid.rows; r += 1) {
    for (let c = 0; c < grid.cols; c += 1) {
      if (isWall(c, r)) grid.setWalkable(c, r, false);
    }
  }
  nav = grid;

  elapsed = 0;
  phase = "playing";
  level = 1;
  levelStartElapsed = 0;
  levelUpUntil = 0;
  frightenedUntil = 0;
  ghostChain = 0;
  muncherDir = { dc: 0, dr: -1 };
  pelletSet.clear();
  powerSet.clear();
  for (const cell of pelletCells) pelletSet.add(cellKey(cell.c, cell.r));
  for (const cell of powerCells) powerSet.add(cellKey(cell.c, cell.r));
  ghosts.clear();

  ctx.game.commands.define("restart", {
    apply(state: GameContext) {
      fullRestart(state);
      return state;
    },
  });
}

export function onNewPlayer(ctx: GameContext): void {
  const start = cellToWorld(PLAYER_START.c, PLAYER_START.r);
  ctx.scene.entity.spawn(MUNCHER, { id: ctx.player.userId, position: start, role: "player" });
  lastMuncher = [start[0], start[2]];
  for (const def of GHOSTS) {
    const gs = cellToWorld(def.start.c, def.start.r);
    ctx.scene.entity.spawn(def.kind, { id: def.id, position: gs, role: "npc" });
    ghosts.set(def.id, { def, route: null, ri: 0, mode: scheduledMode(0), retargetAt: 0 });
  }
}

function fullRestart(ctx: GameContext): void {
  const userId = ctx.player.userId;
  level = 1;
  ctx.scene.entity.stats.set(userId, SCORE, { current: 0 });
  ctx.scene.entity.stats.set(userId, LIVES, { current: START_LIVES });
  startLevel(ctx);
}

function startLevel(ctx: GameContext): void {
  pelletSet.clear();
  powerSet.clear();
  for (const cell of pelletCells) pelletSet.add(cellKey(cell.c, cell.r));
  for (const cell of powerCells) powerSet.add(cellKey(cell.c, cell.r));
  ghostChain = 0;
  levelStartElapsed = elapsed;
  resetActors(ctx);
  phase = "playing";
}

function targetCellFor(gs: GhostState, muncherCell: Cell, ghostCell: Cell): Cell {
  if (gs.mode === "eaten") return PEN_CENTER;
  if (gs.mode === "frightened") return farthestCorner(muncherCell, CORNERS);
  if (gs.mode === "scatter") return gs.def.scatter;
  const distTiles = Math.abs(ghostCell.c - muncherCell.c) + Math.abs(ghostCell.r - muncherCell.r);
  return chaseTargetCell(gs.def, muncherCell, muncherDir, distTiles);
}

function resetActors(ctx: GameContext): void {
  const start = cellToWorld(PLAYER_START.c, PLAYER_START.r);
  ctx.scene.entity.setPose(ctx.player.userId, { position: start, rotationY: 0 });
  lastMuncher = [start[0], start[2]];
  muncherDir = { dc: 0, dr: -1 };
  frightenedUntil = 0;
  for (const gs of ghosts.values()) {
    const home = cellToWorld(gs.def.start.c, gs.def.start.r);
    ctx.scene.entity.setPose(gs.def.id, { position: home, rotationY: 0 });
    gs.route = null;
    gs.ri = 0;
    gs.mode = scheduledMode(levelElapsed());
    gs.retargetAt = 0;
  }
}

export function onTick(ctx: GameContext, dt: number): void {
  if (phase === "levelup") {
    elapsed += dt;
    if (elapsed >= levelUpUntil) startLevel(ctx);
    return;
  }
  if (phase !== "playing" || nav === null) return;
  elapsed += dt;
  const userId = ctx.player.userId;
  const muncher = ctx.scene.entity.get(userId);
  if (muncher === null) return;

  const [sx, sz] = slideMove(lastMuncher[0], lastMuncher[1], muncher.position[0], muncher.position[2]);
  const dx = sx - lastMuncher[0];
  const dz = sz - lastMuncher[1];
  if (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001) {
    muncherDir = Math.abs(dx) >= Math.abs(dz) ? { dc: Math.sign(dx), dr: 0 } : { dc: 0, dr: Math.sign(dz) };
  }
  ctx.scene.entity.setPose(userId, {
    position: [sx, 0, sz],
    rotationY: Math.atan2(muncherDir.dc, muncherDir.dr),
  });
  lastMuncher = [sx, sz];
  const muncherCell = worldToCell(sx, sz);

  const mk = cellKey(muncherCell.c, muncherCell.r);
  if (pelletSet.has(mk)) {
    pelletSet.delete(mk);
    ctx.scene.entity.stats.delta(userId, SCORE, PELLET_SCORE);
  }
  if (powerSet.has(mk)) {
    powerSet.delete(mk);
    ctx.scene.entity.stats.delta(userId, SCORE, POWER_SCORE);
    frightenedUntil = elapsed + frightSecondsForLevel(level);
    ghostChain = 0;
    for (const gs of ghosts.values()) {
      if (gs.mode !== "eaten") {
        gs.route = null;
        gs.retargetAt = 0;
      }
    }
  }
  if (pelletSet.size === 0 && powerSet.size === 0) {
    if (level >= MAX_LEVEL) {
      phase = "won";
    } else {
      level += 1;
      phase = "levelup";
      levelUpUntil = elapsed + LEVEL_UP_PAUSE;
    }
    return;
  }

  for (const gs of ghosts.values()) {
    const entity = ctx.scene.entity.get(gs.def.id);
    if (entity === null) continue;
    let gx = entity.position[0];
    let gz = entity.position[2];

    if (gs.mode !== "eaten") {
      gs.mode = frightenedUntil > elapsed ? "frightened" : scheduledMode(levelElapsed());
    }

    const ghostCell = worldToCell(gx, gz);
    const target = targetCellFor(gs, muncherCell, ghostCell);
    const speed =
      gs.mode === "eaten" ? SPEED_EATEN : gs.mode === "frightened" ? SPEED_FRIGHT : ghostSpeedForLevel(level);

    if (gs.route === null || gs.ri >= gs.route.length || elapsed >= gs.retargetAt) {
      const tw = cellToWorld(target.c, target.r);
      const route = findPath(nav, [gx, gz], [tw[0], tw[2]], { smooth: false });
      gs.route = route;
      gs.ri = route !== null && route.length > 1 ? 1 : 0;
      gs.retargetAt = elapsed + RETARGET_INTERVAL;
    }

    let hx = 0;
    let hz = 0;
    if (gs.route !== null && gs.ri < gs.route.length) {
      const wp = gs.route[gs.ri]!;
      const wdx = wp[0] - gx;
      const wdz = wp[1] - gz;
      const dist = Math.hypot(wdx, wdz);
      const travel = speed * dt;
      if (dist <= travel || dist < 1e-4) {
        gx = wp[0];
        gz = wp[1];
        gs.ri += 1;
      } else {
        gx += (wdx / dist) * travel;
        gz += (wdz / dist) * travel;
      }
      hx = wdx;
      hz = wdz;
    }
    ctx.scene.entity.setPose(gs.def.id, { position: [gx, 0, gz], rotationY: Math.atan2(hx, hz), dt });

    if (gs.mode === "eaten") {
      const pen = cellToWorld(PEN_CENTER.c, PEN_CENTER.r);
      if (Math.hypot(gx - pen[0], gz - pen[2]) < 0.4) {
        gs.mode = frightenedUntil > elapsed ? "frightened" : scheduledMode(levelElapsed());
        gs.route = null;
      }
    }

    const contact = Math.hypot(gx - sx, gz - sz);
    if (contact < EAT_RADIUS) {
      if (gs.mode === "frightened") {
        gs.mode = "eaten";
        gs.route = null;
        gs.retargetAt = 0;
        ghostChain += 1;
        const chainScore = ghostChainScore(ghostChain);
        ctx.scene.entity.stats.delta(userId, SCORE, chainScore);
        ctx.scene.entity.floatText({ instanceId: userId, text: String(chainScore), kind: "info" });
      } else if (gs.mode !== "eaten") {
        ctx.scene.entity.stats.delta(userId, LIVES, -1);
        const lives = ctx.scene.entity.stats.get(userId, LIVES);
        if (lives === null || lives.current <= 0) {
          phase = "lost";
        } else {
          resetActors(ctx);
        }
        return;
      }
    }
  }
}

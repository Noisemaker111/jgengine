import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityDiedEvent } from "@jgengine/core/game/events";
import { createTacticalGrid, type TacticalGrid, type Tile } from "@jgengine/core/tactics/tacticalGrid";
import { createTurnLoop, type TurnLoop } from "@jgengine/core/turn/turnLoop";

import { chooseEnemyIntent } from "../ai";
import { createBattleGrid, manhattan, sameTile, tileToWorld, tilesWithinRange, worldToTile, GRID_SIZE } from "../board";
import { resolveAttack } from "../combat";
import { ENEMY_UNITS } from "../entities/enemies/catalog";
import { PLAYER_UNITS } from "../entities/players/catalog";
import { PLAYER_UNIT_IDS, WAVES, playerSpawnTile } from "../waves";
import { createBattleStore, type EnemyIntentEntry } from "./store";

export const store = createBattleStore();

interface UnitSpec {
  catalogId: string;
  team: "player" | "enemy";
  move: number;
  range: number;
  damage: number;
  pushTiles?: number;
}

let grid: TacticalGrid = createTacticalGrid({ width: GRID_SIZE, height: GRID_SIZE });
let turnLoop: TurnLoop = createTurnLoop({ order: ["player", "enemy"] });
const unitSpecs = new Map<string, UnitSpec>();
const deadPlayerIds = new Set<string>();
let currentWaveIndex = 0;

function playerInstanceId(catalogId: string): string {
  return `p:${catalogId}`;
}

function enemyInstanceId(waveIndex: number, index: number): string {
  return `e:${waveIndex}:${index}`;
}

function playerTiles(): Tile[] {
  const tiles: Tile[] = [];
  for (const [id, spec] of unitSpecs) {
    if (spec.team !== "player") continue;
    const tile = grid.tileOf(id);
    if (tile !== null) tiles.push(tile);
  }
  return tiles;
}

function computeIntents(): EnemyIntentEntry[] {
  const targets = playerTiles();
  const entries: EnemyIntentEntry[] = [];
  for (const [id, spec] of unitSpecs) {
    if (spec.team !== "enemy") continue;
    const tile = grid.tileOf(id);
    if (tile === null) continue;
    entries.push({ enemyId: id, tile, intent: chooseEnemyIntent(grid, tile, spec.move, spec.range, targets) });
  }
  return entries;
}

function spawnWave(ctx: GameContext, waveIndex: number): void {
  currentWaveIndex = waveIndex;
  const wave = WAVES[waveIndex]!;

  for (const [id, spec] of [...unitSpecs]) {
    if (spec.team === "enemy") {
      ctx.scene.entity.despawn(id);
      unitSpecs.delete(id);
    }
  }

  grid = createBattleGrid(wave.obstacles);
  turnLoop = createTurnLoop({ order: ["player", "enemy"] });

  PLAYER_UNIT_IDS.forEach((catalogId, index) => {
    const id = playerInstanceId(catalogId);
    if (deadPlayerIds.has(id)) return;
    const tile = playerSpawnTile(index);
    const def = PLAYER_UNITS[catalogId]!;
    if (!unitSpecs.has(id)) {
      ctx.scene.entity.spawn(catalogId, { id, position: tileToWorld(tile) });
      unitSpecs.set(id, {
        catalogId,
        team: "player",
        move: def.move,
        range: def.range,
        damage: def.damage,
        ...(def.pushTiles === undefined ? {} : { pushTiles: def.pushTiles }),
      });
    } else {
      ctx.scene.entity.setPose(id, { position: tileToWorld(tile) });
    }
    grid.place(id, tile);
  });

  wave.enemies.forEach((spawn, index) => {
    const id = enemyInstanceId(waveIndex, index);
    const def = ENEMY_UNITS[spawn.catalogId]!;
    ctx.scene.entity.spawn(spawn.catalogId, { id, position: tileToWorld(spawn.tile) });
    unitSpecs.set(id, { catalogId: spawn.catalogId, team: "enemy", move: def.move, range: def.range, damage: def.damage });
    grid.place(id, spawn.tile);
  });

  store.setState({
    phase: "player",
    waveIndex,
    waveLabel: wave.label,
    round: turnLoop.round(),
    selectedUnitId: null,
    moveTiles: [],
    attackTiles: [],
    actedIds: [],
    movedIds: [],
    intents: computeIntents(),
    banner: { title: wave.label, subtitle: "Deploy your squad", tone: "neutral" },
  });
}

function markActed(unitId: string): void {
  store.update((state) => ({
    ...state,
    actedIds: state.actedIds.includes(unitId) ? state.actedIds : [...state.actedIds, unitId],
    selectedUnitId: null,
    moveTiles: [],
    attackTiles: [],
  }));
}

export function selectUnit(unitId: string): void {
  const state = store.getState();
  if (state.phase !== "player" || state.actedIds.includes(unitId)) return;
  const spec = unitSpecs.get(unitId);
  if (spec === undefined || spec.team !== "player") return;
  const tile = grid.tileOf(unitId);
  if (tile === null) return;
  const moveTiles = state.movedIds.includes(unitId) ? [] : grid.reachable(tile, spec.move).map((entry) => entry.tile);
  const attackTiles = tilesWithinRange(tile, spec.range);
  store.setState({ selectedUnitId: unitId, moveTiles, attackTiles });
}

export function cancelSelection(): void {
  store.setState({ selectedUnitId: null, moveTiles: [], attackTiles: [] });
}

function performMove(unitId: string, tile: Tile): void {
  const ctx = activeCtx;
  if (ctx === null) return;
  const spec = unitSpecs.get(unitId);
  if (spec === undefined) return;
  if (!grid.move(unitId, tile)) return;
  ctx.scene.entity.setPose(unitId, { position: tileToWorld(tile) });
  const attackTiles = tilesWithinRange(tile, spec.range);
  store.update((state) => ({
    ...state,
    moveTiles: [],
    attackTiles,
    movedIds: state.movedIds.includes(unitId) ? state.movedIds : [...state.movedIds, unitId],
  }));
}

function performAttack(unitId: string, targetId: string): void {
  const ctx = activeCtx;
  if (ctx === null) return;
  const attackerSpec = unitSpecs.get(unitId);
  const attackerTile = grid.tileOf(unitId);
  const targetTile = grid.tileOf(targetId);
  if (attackerSpec === undefined || attackerTile === null || targetTile === null) return;
  const resolution = resolveAttack(
    { damage: attackerSpec.damage, ...(attackerSpec.pushTiles === undefined ? {} : { pushTiles: attackerSpec.pushTiles }) },
    attackerTile,
    targetTile,
  );
  ctx.scene.entity.effect({ from: unitId, to: targetId, effect: "damage", via: { amount: resolution.damage } });
  if (resolution.pushDirection !== null && ctx.scene.entity.get(targetId) !== null) {
    const pushResult = grid.push(targetId, resolution.pushDirection, { distance: attackerSpec.pushTiles ?? 1 });
    for (const move of pushResult.moves) {
      if (move.id === targetId) ctx.scene.entity.setPose(targetId, { position: tileToWorld(move.to) });
    }
  }
  markActed(unitId);
}

export function waitSelected(): void {
  const state = store.getState();
  if (state.selectedUnitId !== null) markActed(state.selectedUnitId);
}

export function handleBoardClick(input: { point: readonly [number, number, number]; entity: string | null }): void {
  const state = store.getState();
  if (state.phase !== "player") return;

  if (input.entity !== null && unitSpecs.has(input.entity)) {
    const spec = unitSpecs.get(input.entity)!;
    if (spec.team === "player") {
      selectUnit(input.entity);
      return;
    }
    if (state.selectedUnitId !== null) {
      const targetTile = grid.tileOf(input.entity);
      if (targetTile !== null && state.attackTiles.some((tile) => sameTile(tile, targetTile))) {
        performAttack(state.selectedUnitId, input.entity);
      }
    }
    return;
  }

  const tile = worldToTile(input.point[0], input.point[2]);
  if (tile === null || state.selectedUnitId === null) {
    cancelSelection();
    return;
  }
  if (state.moveTiles.some((candidate) => sameTile(candidate, tile))) {
    performMove(state.selectedUnitId, tile);
    return;
  }
  cancelSelection();
}

function advanceToPlayerPhase(): void {
  const ctx = activeCtx;
  if (ctx === null) return;
  const state = store.getState();
  if (state.phase !== "enemy") return;
  turnLoop.advanceTurn();
  store.setState({ phase: "player", round: turnLoop.round(), actedIds: [], intents: computeIntents(), banner: null });
}

function resolveEnemyTurn(): void {
  const ctx = activeCtx;
  if (ctx === null) return;
  const state = store.getState();
  for (const entry of state.intents) {
    if (!unitSpecs.has(entry.enemyId) || entry.intent.kind === "hold") continue;
    const spec = unitSpecs.get(entry.enemyId)!;
    if (!sameTile(entry.intent.moveTo, entry.tile) && grid.occupantAt(entry.intent.moveTo) === null) {
      grid.move(entry.enemyId, entry.intent.moveTo);
      ctx.scene.entity.setPose(entry.enemyId, { position: tileToWorld(entry.intent.moveTo) });
    }
    if (entry.intent.kind === "attack") {
      const currentTile = grid.tileOf(entry.enemyId);
      const defenderId = grid.occupantAt(entry.intent.targetTile);
      if (
        currentTile !== null &&
        defenderId !== null &&
        unitSpecs.get(defenderId)?.team === "player" &&
        manhattan(currentTile, entry.intent.targetTile) <= spec.range
      ) {
        const resolution = resolveAttack({ damage: spec.damage }, currentTile, entry.intent.targetTile);
        ctx.scene.entity.effect({ from: entry.enemyId, to: defenderId, effect: "damage", via: { amount: resolution.damage } });
      }
    }
    if (store.getState().phase !== "enemy") return;
  }
  advanceToPlayerPhase();
}

export function endTurn(): void {
  const state = store.getState();
  if (state.phase !== "player") return;
  store.setState({ phase: "enemy", selectedUnitId: null, moveTiles: [], attackTiles: [] });
  turnLoop.advanceTurn();
  resolveEnemyTurn();
}

function onEntityDied(ctx: GameContext, event: EntityDiedEvent): void {
  const spec = unitSpecs.get(event.instanceId);
  if (spec === undefined) return;
  grid.remove(event.instanceId);
  unitSpecs.delete(event.instanceId);

  if (spec.team === "player") {
    deadPlayerIds.add(event.instanceId);
    const survivors = [...unitSpecs.values()].some((entry) => entry.team === "player");
    if (!survivors) {
      store.setState({
        phase: "defeat",
        selectedUnitId: null,
        moveTiles: [],
        attackTiles: [],
        banner: { title: "Squad Lost", subtitle: "The breach has overrun the outpost.", tone: "defeat" },
      });
      return;
    }
    const current = store.getState();
    if (current.selectedUnitId === event.instanceId) {
      store.setState({ selectedUnitId: null, moveTiles: [], attackTiles: [] });
    }
    return;
  }

  const remainingEnemies = [...unitSpecs.values()].some((entry) => entry.team === "enemy");
  if (remainingEnemies) return;

  const nextWave = currentWaveIndex + 1;
  if (nextWave >= WAVES.length) {
    store.setState({ phase: "victory", banner: { title: "Sector Secured", subtitle: "All breach waves eliminated.", tone: "victory" } });
    return;
  }
  store.setState({
    phase: "wave-clear",
    banner: { title: "Wave Cleared", subtitle: `Advancing to ${WAVES[nextWave]!.label}`, tone: "warning" },
  });
  ctx.time.after(1.6, () => spawnWave(ctx, nextWave));
}

let activeCtx: GameContext | null = null;

export function initBattle(ctx: GameContext): void {
  activeCtx = ctx;
  deadPlayerIds.clear();
  unitSpecs.clear();

  ctx.game.commands.define<{ point: readonly [number, number, number]; entity: string | null }>("battle.boardClick", {
    apply(state, input) {
      handleBoardClick(input);
      return state;
    },
  });
  ctx.game.commands.define<{ unitId: string }>("battle.selectUnit", {
    apply(state, input) {
      selectUnit(input.unitId);
      return state;
    },
  });
  ctx.game.commands.define("battle.wait", {
    apply(state) {
      waitSelected();
      return state;
    },
  });
  ctx.game.commands.define("endTurn", {
    apply(state) {
      endTurn();
      return state;
    },
  });
  ctx.game.commands.define("cancelSelection", {
    apply(state) {
      cancelSelection();
      return state;
    },
  });

  ctx.game.events.on("entity.died", (event) => onEntityDied(ctx, event));

  spawnWave(ctx, 0);
}

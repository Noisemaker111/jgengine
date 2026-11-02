import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Euler } from "three";

import type { MovementCommitFrame } from "@jgengine/core/game/playableGame";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { useGameContext } from "@jgengine/react/provider";
import { LOCAL_PLAYER_CATALOG_ID, LOCAL_PLAYER_WALK_SPEED } from "@llmville/game/game/content";
import { standingStep, type PlayerPosition } from "@llmville/game/movement/playerMovement";
import { resolvePlayerSpeed } from "@llmville/game/user/personalUpgrades";
import { engineActions, type GameEngine } from "@/runtime/gameEngine";
import { localGameState } from "@/user/localGameState";

const LOOK_PERSIST_INTERVAL_MS = 1_000;
/** The shell's first-person yaw faces +Z at 0; a three camera's Euler yaw faces -Z at 0. */
const SHELL_YAW_FROM_CAMERA_YAW = Math.PI;

const NEARBY_PLAYERS_KEY = "llmville.nearbyPlayers";

function isPositionList(value: unknown): value is readonly PlayerPosition[] {
  return Array.isArray(value) && value.every(
    (entry: unknown) => typeof entry === "object" && entry !== null && "x" in entry && "z" in entry
      && typeof entry.x === "number" && typeof entry.z === "number",
  );
}

/** Other players' positions, which block the local player's step. */
export function setNearbyPlayers(ctx: GameContext, positions: readonly PlayerPosition[]): void {
  ctx.game.store.set(NEARBY_PLAYERS_KEY, positions);
}

/** `controls.movement.beforeCommit`: LLMville's standing rule over the shell's walk. */
export function stepAroundNearbyPlayers(frame: MovementCommitFrame): readonly [number, number, number] | undefined {
  const stored = frame.ctx.game.store.get(NEARBY_PLAYERS_KEY);
  return standingStep(frame.current, frame.next, isPositionList(stored) ? stored : []);
}

/**
 * Spawns the local player as the entity the shell walks, where the world entry placed it and facing
 * where it last looked. The shell's presence lane uploads this entity's pose, so it must not exist
 * before the spawn is known.
 */
export function spawnLocalPlayer(ctx: GameContext, position: PlayerPosition, look: { yaw: number } | null): void {
  ctx.scene.entity.spawn(LOCAL_PLAYER_CATALOG_ID, {
    id: ctx.player.userId,
    position: [position.x, 0, position.z],
    rotationY: (look?.yaw ?? 0) + SHELL_YAW_FROM_CAMERA_YAW,
    movement: { walkSpeed: LOCAL_PLAYER_WALK_SPEED },
  });
}

/** Personal speed upgrades retune the walk speed the shell moves the player at. */
export function useLocalPlayerWalkSpeed(walkSpeedLevel: number): void {
  const ctx = useGameContext();
  useEffect(() => {
    ctx.scene.entity.update(ctx.player.userId, {
      movement: { walkSpeed: resolvePlayerSpeed(LOCAL_PLAYER_WALK_SPEED, walkSpeedLevel) },
    });
  }, [ctx, walkSpeedLevel]);
}

/**
 * The shell walks the player entity; LLMville's rules read the position from its own state. Each
 * frame copies the walked position in, and a position the game sets (a presence seed, a teleport)
 * moves the entity. Equal positions are skipped both ways, so neither side echoes the other.
 */
export function useLocalPlayerBridge(engine: GameEngine | null): void {
  const ctx = useGameContext();
  const camera = useThree((state) => state.camera);
  const look = useMemo(() => new Euler(0, 0, 0, "YXZ"), []);
  const lastPersistedAt = useRef(0);

  useEffect(() => {
    if (engine === null) return;
    const follow = () => {
      const { x, z } = engine.getState().player.position;
      const entity = ctx.scene.entity.get(ctx.player.userId);
      if (entity === null || (entity.position[0] === x && entity.position[2] === z)) return;
      ctx.scene.entity.setPose(ctx.player.userId, { position: [x, 0, z] });
    };
    follow();
    return engine.subscribe(follow);
  }, [ctx, engine]);

  useFrame(function localPlayerBridge() {
    if (engine === null) return;
    const entity = ctx.scene.entity.get(ctx.player.userId);
    if (entity === null) return;
    const [x, , z] = entity.position;
    const current = engine.getState().player.position;
    if (current.x !== x || current.z !== z) engine.dispatch(engineActions.setPlayerPosition({ x, z }));

    const now = performance.now();
    if (now - lastPersistedAt.current < LOOK_PERSIST_INTERVAL_MS) return;
    lastPersistedAt.current = now;
    const { activeSlot, gameId } = engine.getState().session;
    if (gameId === null) return;
    look.setFromQuaternion(camera.quaternion, "YXZ");
    localGameState().writeCameraLook(activeSlot, gameId, { yaw: look.y, pitch: look.x });
  });
}

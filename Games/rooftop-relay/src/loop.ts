import { createResourcePool, type ResourcePool } from "@jgengine/core/combat/resourcePool";
import { createRaceState, type RaceState, type RaceTrack } from "@jgengine/core/game/race";
import type { SpawnPoints } from "@jgengine/core/game/spawnPoints";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { groundSpeed } from "@jgengine/core/scene/entityStore";
import type { MarkerSet } from "@jgengine/core/world/markers";

import { classifyHandoff, type HandoffQuality } from "./game/baton";
import { applyFallPenalty, applyHandoff, INITIAL_RELAY_STATE, startRelay, tickRelayClock, TOTAL_LEGS, type RelayState } from "./game/relay/state";
import { buildLegTracks } from "./game/route/race";
import { ROUTE } from "./game/route/legs";
import { runnerByLegIndex } from "./game/runners/catalog";
import { isExhausted, stepStamina } from "./game/stamina";
import { EXHAUSTED_JUMP_DAMPEN, FALL_HEIGHT_THRESHOLD, HANDOFF_ZONE_RADIUS, STAMINA_MAX } from "./game/tuning";
import { buildRouteMarkers, placeRoute, possessRunnerForLeg, recordCheckpoints, respawnRunnersAtLegStarts, spawnRunners } from "./game/world/setup";

const STORE_KEY = "relay-session";

export interface Session {
  relay: RelayState;
  stamina: ResourcePool;
  spawnPoints: SpawnPoints;
  markers: MarkerSet;
  legTracks: readonly RaceTrack[];
  raceState: RaceState;
  prevJumpDown: boolean;
}

function freshRaceStateForLeg(legIndex: number, tracks: readonly RaceTrack[], now: number): RaceState {
  const track = tracks[legIndex] ?? tracks[tracks.length - 1]!;
  const state = createRaceState({ track });
  state.addRacer("relay", now);
  return state;
}

export function getSession(ctx: GameContext): Session {
  const session = ctx.game.store.get(STORE_KEY) as Session | undefined;
  if (session === undefined) throw new Error("rooftop-relay: session accessed before onInit");
  return session;
}

function resetSession(ctx: GameContext, session: Session): void {
  respawnRunnersAtLegStarts(ctx);
  session.relay = startRelay();
  session.stamina.set(STAMINA_MAX);
  session.raceState = freshRaceStateForLeg(0, session.legTracks, ctx.time.now());
  session.prevJumpDown = false;
}

function performHandoff(ctx: GameContext, session: Session, quality: HandoffQuality): void {
  const outgoingLegIndex = session.relay.legIndex;
  const nextRunnerName = outgoingLegIndex < TOTAL_LEGS - 1 ? runnerByLegIndex(outgoingLegIndex + 1).name : null;
  session.relay = applyHandoff(session.relay, quality, nextRunnerName);
  if (session.relay.phase === "running") {
    possessRunnerForLeg(ctx, session.relay.legIndex);
    session.stamina.set(STAMINA_MAX);
    session.raceState = freshRaceStateForLeg(session.relay.legIndex, session.legTracks, ctx.time.now());
  }
}

export function onInit(ctx: GameContext): void {
  placeRoute(ctx);
  const legTracks = buildLegTracks(ROUTE);
  const session: Session = {
    relay: INITIAL_RELAY_STATE,
    stamina: createResourcePool({ max: STAMINA_MAX, initial: STAMINA_MAX }),
    spawnPoints: recordCheckpoints(ROUTE),
    markers: buildRouteMarkers(ROUTE),
    legTracks,
    raceState: freshRaceStateForLeg(0, legTracks, ctx.time.now()),
    prevJumpDown: false,
  };
  ctx.game.store.set(STORE_KEY, session);

  ctx.game.commands.define("start", {
    validate(state) {
      const current = getSession(state);
      return current.relay.phase === "running" ? { reason: "already running" } : null;
    },
    apply(state) {
      const current = getSession(state);
      resetSession(state, current);
      state.game.store.set(STORE_KEY, current);
      return state;
    },
  });

  ctx.game.commands.define("restart", {
    apply(state) {
      const current = getSession(state);
      resetSession(state, current);
      state.game.store.set(STORE_KEY, current);
      return state;
    },
  });

  ctx.game.commands.define("handoff", {
    validate(state) {
      const current = getSession(state);
      if (current.relay.phase !== "running") return { reason: "relay is not running" };
      const activeId = state.player.possession.active(state.player.userId);
      const entity = state.scene.entity.get(activeId);
      if (entity === null) return { reason: "no active runner" };
      const leg = ROUTE.legs[current.relay.legIndex]!;
      const [hx, , hz] = leg.handoffCheckpoint.position;
      const distance = Math.hypot(entity.position[0] - hx, entity.position[2] - hz);
      if (distance > HANDOFF_ZONE_RADIUS * 1.6) return { reason: "not inside the handoff zone" };
      return null;
    },
    apply(state) {
      const current = getSession(state);
      const activeId = state.player.possession.active(state.player.userId);
      const entity = state.scene.entity.get(activeId)!;
      const quality = classifyHandoff(current.relay.baton, groundSpeed(entity));
      performHandoff(state, current, quality);
      state.game.store.set(STORE_KEY, current);
      return state;
    },
  });
}

export function onNewPlayer(ctx: GameContext): void {
  spawnRunners(ctx, ROUTE);
}

export function onTick(ctx: GameContext, dt: number): void {
  const session = getSession(ctx);

  if (session.relay.phase !== "running") return;

  const activeId = ctx.player.possession.active(ctx.player.userId);
  const entity = ctx.scene.entity.get(activeId);
  if (entity === null) return;

  if (isExhausted(session.stamina.current()) && entity.velocity[1] > 1) {
    ctx.player.motion.setVerticalVelocity(entity.velocity[1] * EXHAUSTED_JUMP_DAMPEN);
  }

  if (entity.position[1] < FALL_HEIGHT_THRESHOLD) {
    const runnerName = runnerByLegIndex(session.relay.legIndex).name;
    session.relay = applyFallPenalty(session.relay, runnerName);
    const leg = ROUTE.legs[session.relay.legIndex]!;
    session.spawnPoints.respawn(ctx.scene.entity, activeId, leg.startCheckpoint.id);
    ctx.game.store.set(STORE_KEY, session);
    return;
  }

  const speed = groundSpeed(entity);
  const sprinting = ctx.input.isDown("sprint");
  const moving = speed > 0.15;
  const jumpDown = ctx.input.isDown("jump");
  const jumped = jumpDown && !session.prevJumpDown;
  session.prevJumpDown = jumpDown;
  session.stamina.set(
    stepStamina({ current: session.stamina.current(), max: session.stamina.max(), sprinting, moving, jumped, dt }),
  );

  session.relay = tickRelayClock(session.relay, dt, speed);

  if (session.relay.phase === "running") {
    const events = session.raceState.update(ctx.time.now(), { relay: entity.position });
    for (const event of events) {
      if (event.type === "race.finished") {
        performHandoff(ctx, session, classifyHandoff(session.relay.baton, speed));
        break;
      }
    }
  }

  ctx.game.store.set(STORE_KEY, session);
}

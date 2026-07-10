import { createRecordBook, type RecordStorage } from "@jgengine/core/game/recordBook";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { GLIDER_GHOST_ENTITY, GLIDER_PACER_ENTITY, GLIDER_PLAYER_ENTITY } from "./game/entities/gliders/catalog";
import { fanSpoolState } from "./game/flight/fanSchedule";
import { createMouseSteer, type MouseSteer } from "./game/input/mouseSteer";
import { createRaceSession, PACER_RACER_ID, RECORD_BOOK_KEY, RECORD_FIELDS, SESSION_STORE_KEY, type RaceSession } from "./game/race/session";
import { FANS, SPAWN_HEADING, SPAWN_POSITION } from "./game/race/route";
import { placeCityProps, syncFanRotors } from "./game/world/setup";

const MOUSE_KEY = "mouseSteer";
const GHOST_SPAWNED_KEY = "ghostSpawned";
export const GHOST_RACER_ID = "ghost";

function browserStorage(): RecordStorage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

export function onInit(ctx: GameContext): void {
  const previousMouse = ctx.game.store.get(MOUSE_KEY) as MouseSteer | undefined;
  if (previousMouse !== undefined) previousMouse.detach();

  const session = createRaceSession(createRecordBook({ key: RECORD_BOOK_KEY, fields: RECORD_FIELDS, storage: browserStorage() }));
  ctx.game.store.set(SESSION_STORE_KEY, session);
  ctx.game.store.set(GHOST_SPAWNED_KEY, false);

  const mouseSteer = createMouseSteer();
  mouseSteer.attach();
  ctx.game.store.set(MOUSE_KEY, mouseSteer);

  if (!ctx.game.commands.has("start")) {
    ctx.game.commands.define("start", {
      apply: (state) => (state.game.store.get(SESSION_STORE_KEY) as RaceSession | undefined)?.start(),
    });
  }
  if (!ctx.game.commands.has("restart")) {
    ctx.game.commands.define("restart", {
      apply: (state) => (state.game.store.get(SESSION_STORE_KEY) as RaceSession | undefined)?.restart(),
    });
  }
  if (!ctx.game.commands.has("dodge")) {
    ctx.game.commands.define("dodge", {
      apply: (state) => (state.game.store.get(SESSION_STORE_KEY) as RaceSession | undefined)?.requestDodge(),
    });
  }

  placeCityProps(ctx);
}

export function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.despawn(ctx.player.userId);
  ctx.scene.entity.spawn(GLIDER_PLAYER_ENTITY, {
    id: ctx.player.userId,
    position: SPAWN_POSITION,
    rotationY: SPAWN_HEADING,
    role: "player",
  });

  ctx.scene.entity.despawn(PACER_RACER_ID);
  ctx.scene.entity.spawn(GLIDER_PACER_ENTITY, {
    id: PACER_RACER_ID,
    position: SPAWN_POSITION,
    rotationY: SPAWN_HEADING,
    role: "npc",
  });

  ctx.scene.entity.despawn(GHOST_RACER_ID);
  ctx.game.store.set(GHOST_SPAWNED_KEY, false);
}

function syncGhost(ctx: GameContext, pose: { position: readonly [number, number, number]; heading: number } | null, dt: number): void {
  const spawned = ctx.game.store.get(GHOST_SPAWNED_KEY) === true;
  if (pose === null) {
    if (spawned) {
      ctx.scene.entity.despawn(GHOST_RACER_ID);
      ctx.game.store.set(GHOST_SPAWNED_KEY, false);
    }
    return;
  }
  if (!spawned) {
    ctx.scene.entity.spawn(GLIDER_GHOST_ENTITY, {
      id: GHOST_RACER_ID,
      position: pose.position,
      rotationY: pose.heading,
      role: "npc",
    });
    ctx.game.store.set(GHOST_SPAWNED_KEY, true);
  }
  ctx.scene.entity.setPose(GHOST_RACER_ID, { position: pose.position, rotationY: pose.heading, dt });
}

export function onTick(ctx: GameContext, dt: number): void {
  const session = ctx.game.store.get(SESSION_STORE_KEY) as RaceSession | undefined;
  const mouseSteer = ctx.game.store.get(MOUSE_KEY) as MouseSteer | undefined;
  if (session === undefined || mouseSteer === undefined) return;

  const mouse = mouseSteer.sample();
  session.tick(
    dt,
    {
      pitchUp: ctx.input.isDown("pitchUp"),
      pitchDown: ctx.input.isDown("pitchDown"),
      yawLeft: ctx.input.isDown("yawLeft"),
      yawRight: ctx.input.isDown("yawRight"),
      mouseX: mouse.x,
      mouseY: mouse.y,
    },
    ctx.input.isDown("thrust"),
    ctx.input.isDown("airbrake"),
  );

  const snapshot = session.snapshot();
  ctx.scene.entity.setPose(ctx.player.userId, {
    position: snapshot.playerPose.position,
    rotationY: snapshot.playerPose.heading,
    dt,
  });
  ctx.scene.entity.setPose(PACER_RACER_ID, {
    position: snapshot.pacerPose.position,
    rotationY: snapshot.pacerPose.heading,
    dt,
  });
  syncGhost(ctx, snapshot.ghost.pose, dt);

  const fanStates = new Map(FANS.map((schedule) => [schedule.id, fanSpoolState(schedule, snapshot.totalTime)]));
  syncFanRotors(ctx, fanStates, snapshot.totalTime);
}

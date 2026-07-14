import { setGamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { createMarkerSet } from "@jgengine/core/world/markers";

import { COURIER_ENTITY } from "./game/content";
import { CLOUD_TRIGGER_Y } from "./game/world/archipelago";
import { beginCourse, registerCommands, settleFlight } from "./game/runtime/commands";
import { getBridge, resetBridge } from "./game/runtime/bridge";
import { archipelagoStore, courseStore, markersStore, raceStore, sessionStore, spawnPointsStore } from "./game/runtime/store";
import {
  applyCheckpoint,
  applyFinish,
  applyRespawnPenalty,
  applyTimeCap,
  initialSession,
  type GamePhase as SessionPhase,
} from "./game/session/sessionState";
import type { CourseDef } from "./game/world/courses";
import { spawnPoseId } from "./game/world/spawnIds";
import { archipelago, courses } from "./world";

function syncPhase(ctx: GameContext, phase: SessionPhase): void {
  setGamePhase(ctx, phase === "playing" ? "playing" : phase === "menu" ? "menu" : "ended");
}

export function onInit(ctx: GameContext): void {
  resetBridge();
  sessionStore.write(ctx, initialSession(courses[0]!.id));
  archipelagoStore.write(ctx, archipelago);
  syncPhase(ctx, "menu");

  const markers = createMarkerSet(() => ctx.time.now());
  archipelago.islets.forEach((islet) => {
    markers.add({ id: `islet-${islet.id}`, kind: "location", position: [islet.position.x, islet.position.y, islet.position.z] });
  });
  markersStore.write(ctx, markers);

  registerCommands(ctx, archipelago, courses);
}

export function onNewPlayer(ctx: GameContext): void {
  const start = archipelago.pylons.find((p) => p.isletId === archipelago.islets[0]!.id)!;
  ctx.scene.entity.spawn(COURIER_ENTITY, {
    id: ctx.player.userId,
    position: { x: start.base.x, y: start.ringY, z: start.base.z },
    role: "player",
  });
  beginMenuPark(ctx, courses[0]!);
}

function beginMenuPark(ctx: GameContext, course: CourseDef): void {
  const cp = course.checkpoints[0]!;
  const bridge = resetBridge();
  bridge.active = true;
  bridge.frozen = true;
  ctx.scene.entity.update(ctx.player.userId, { position: [cp.center[0], cp.center[1], cp.center[2]] });
}

export function onTick(ctx: GameContext, dt: number): void {
  void dt;
  const session = sessionStore.peek(ctx);
  if (session === undefined) return;
  syncPhase(ctx, session.phase);
  const bridge = getBridge();
  bridge.input.steer = (ctx.input.isDown("steerRight") ? 1 : 0) - (ctx.input.isDown("steerLeft") ? 1 : 0);
  bridge.input.pitch = (ctx.input.isDown("pitchUp") ? 1 : 0) - (ctx.input.isDown("pitchDown") ? 1 : 0);
  bridge.frozen = session.phase !== "playing";
  if (bridge.frozen) bridge.velocity = { x: 0, y: 0, z: 0 };

  if (session.phase !== "playing") return;

  const userId = ctx.player.userId;
  const entity = ctx.scene.entity.get(userId);
  if (entity === null) return;

  const race = raceStore.peek(ctx);
  const course = courseStore.peek(ctx);
  if (race === undefined || course === undefined) return;

  const now = ctx.time.now();
  const events = race.update(now, { [userId]: entity.position });
  let nextSession = session;
  for (const event of events) {
    if (event.type === "checkpoint.hit") nextSession = applyCheckpoint(nextSession, event.checkpoint, now);
    if (event.type === "race.finished") nextSession = applyFinish(course, nextSession, now - nextSession.startedAt, now);
  }

  if (nextSession.phase === "playing" && entity.position[1] < CLOUD_TRIGGER_Y) {
    nextSession = settleFlight(ctx, nextSession, entity.position);
    const progress = race.progressOf(userId);
    const spawnId = progress !== null && progress.lastCheckpoint >= 0 ? spawnPoseId(course.id, progress.lastCheckpoint) : spawnPoseId(course.id, -1);
    const spawnPoints = spawnPointsStore.peek(ctx);
    spawnPoints?.respawn(ctx.scene.entity, userId, spawnId);
    bridge.velocity = { x: 0, y: 0, z: 0 };
    bridge.attached = false;
    bridge.anchor = null;
    nextSession = applyRespawnPenalty(nextSession, now);
  }

  if (nextSession.phase === "playing") {
    const elapsed = now - nextSession.startedAt + nextSession.penaltySeconds;
    if (elapsed > course.totalTimeCapSeconds) nextSession = applyTimeCap(nextSession, now);
  }

  if (nextSession !== session) {
    sessionStore.write(ctx, nextSession);
    syncPhase(ctx, nextSession.phase);
  }
}

export { beginCourse };

import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { createMarkerSet } from "@jgengine/core/world/markers";

import { COURIER_ENTITY } from "./game/content";
import { CLOUD_TRIGGER_Y, type Archipelago } from "./game/world/archipelago";
import { beginCourse, registerCommands, settleFlight } from "./game/runtime/commands";
import { getBridge, resetBridge } from "./game/runtime/bridge";
import { storeGet, storeSet } from "./game/runtime/store";
import { applyCheckpoint, applyFinish, applyRespawnPenalty, applyTimeCap, initialSession, type SessionState } from "./game/session/sessionState";
import type { CourseDef } from "./game/world/courses";
import { spawnPoseId } from "./game/world/spawnIds";
import { archipelago, courses } from "./world";
import type { RaceState } from "@jgengine/core/game/race";
import type { SpawnPoints } from "@jgengine/core/game/spawnPoints";
import type { MarkerSet } from "@jgengine/core/world/markers";

export function onInit(ctx: GameContext): void {
  resetBridge();
  storeSet<SessionState>(ctx, "session", initialSession(courses[0]!.id));
  storeSet<Archipelago>(ctx, "archipelago", archipelago);

  const markers = createMarkerSet(() => ctx.time.now());
  archipelago.islets.forEach((islet) => {
    markers.add({ id: `islet-${islet.id}`, kind: "location", position: [islet.position.x, islet.position.y, islet.position.z] });
  });
  storeSet<MarkerSet>(ctx, "markers", markers);

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
  const session = storeGet<SessionState>(ctx, "session");
  if (session === undefined) return;
  const bridge = getBridge();
  bridge.input.steer = (ctx.input.isDown("steerRight") ? 1 : 0) - (ctx.input.isDown("steerLeft") ? 1 : 0);
  bridge.input.pitch = (ctx.input.isDown("pitchUp") ? 1 : 0) - (ctx.input.isDown("pitchDown") ? 1 : 0);
  bridge.frozen = session.phase !== "playing";
  if (bridge.frozen) bridge.velocity = { x: 0, y: 0, z: 0 };

  if (session.phase !== "playing") return;

  const userId = ctx.player.userId;
  const entity = ctx.scene.entity.get(userId);
  if (entity === null) return;

  const race = storeGet<RaceState>(ctx, "race");
  const course = storeGet<CourseDef>(ctx, "course");
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
    const spawnPoints = storeGet<SpawnPoints>(ctx, "spawnPoints");
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

  if (nextSession !== session) storeSet(ctx, "session", nextSession);
}

export { beginCourse };

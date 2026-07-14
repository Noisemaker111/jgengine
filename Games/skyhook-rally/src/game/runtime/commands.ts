import { createRaceState, firstPastPost, raceTrack } from "@jgengine/core/game/race";
import { createSpawnPoints } from "@jgengine/core/game/spawnPoints";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { HOOK_CONE_COS, HOOK_MAX_LENGTH } from "../physics/constants";
import { pickHookTarget } from "../physics/hookTarget";
import { createApexDetector, forwardVector, isApexOpen } from "../physics/swing";
import {
  applyFlightDistance,
  applyMissedHook,
  applyRelease,
  initialSession,
  selectCourse,
  startCourse,
  type SessionState,
} from "../session/sessionState";
import type { Archipelago } from "../world/archipelago";
import type { CourseDef } from "../world/courses";
import { headingTo, spawnPoseId } from "../world/spawnIds";
import { getBridge, resetBridge } from "./bridge";
import { courseStore, flightOriginStore, markersStore, raceStore, sessionStore, spawnPointsStore } from "./store";

function settleFlight(ctx: GameContext, session: SessionState, landedAt: readonly [number, number, number]): SessionState {
  const origin = flightOriginStore.peek(ctx);
  if (origin === undefined) return session;
  flightOriginStore.write(ctx, undefined);
  const distance = Math.hypot(landedAt[0] - origin.x, landedAt[1] - origin.y, landedAt[2] - origin.z);
  return applyFlightDistance(session, distance);
}

function syncCourseMarkers(ctx: GameContext, course: CourseDef): void {
  const markers = markersStore.peek(ctx);
  if (markers === undefined) return;
  for (const marker of markers.query({ kind: "objective" })) markers.remove(marker.id);
  course.checkpoints.forEach((cp, index) => {
    markers.add({
      id: `objective-${course.id}-${index}`,
      kind: "objective",
      position: cp.center,
      label: `Checkpoint ${index + 1}`,
    });
  });
}

export function beginCourse(ctx: GameContext, courses: readonly CourseDef[], courseId: string): void {
  const course = courses.find((c) => c.id === courseId);
  if (course === undefined) return;
  const userId = ctx.player.userId;

  const race = createRaceState({ track: raceTrack({ checkpoints: course.checkpoints, laps: 1 }), win: firstPastPost(1) });
  race.addRacer(userId, ctx.time.now());

  const spawnPoints = createSpawnPoints();
  const firstCp = course.checkpoints[0]!;
  const secondCp = course.checkpoints[1] ?? firstCp;
  const startYaw = headingTo(firstCp.center, secondCp.center);
  spawnPoints.record(spawnPoseId(course.id, -1), {
    x: firstCp.center[0],
    y: firstCp.center[1],
    z: firstCp.center[2],
    rotationY: startYaw,
  });
  course.checkpoints.forEach((cp, index) => {
    const next = course.checkpoints[index + 1] ?? cp;
    const yaw = headingTo(cp.center, next.center);
    spawnPoints.record(spawnPoseId(course.id, index), { x: cp.center[0], y: cp.center[1], z: cp.center[2], rotationY: yaw });
  });

  raceStore.write(ctx, race);
  spawnPointsStore.write(ctx, spawnPoints);
  courseStore.write(ctx, course);
  flightOriginStore.write(ctx, undefined);
  syncCourseMarkers(ctx, course);

  const bridge = resetBridge();
  bridge.active = true;
  bridge.frozen = false;
  bridge.aim.yaw = startYaw;

  const startPose = spawnPoints.get(spawnPoseId(course.id, -1))!;
  ctx.scene.entity.update(userId, {
    position: [startPose.x, startPose.y, startPose.z],
    rotationY: startYaw,
  });

  sessionStore.write(ctx, startCourse(course, ctx.time.now()));
}

export function registerCommands(ctx: GameContext, archipelago: Archipelago, courses: readonly CourseDef[]): void {
  ctx.game.commands.define("hook", {
    apply(gameCtx) {
      const session = sessionStore.peek(gameCtx);
      if (session === undefined || session.phase !== "playing") return;
      const bridge = getBridge();
      const userId = gameCtx.player.userId;
      const entity = gameCtx.scene.entity.get(userId);
      if (entity === null) return;
      const now = gameCtx.time.now();

      if (bridge.attached) {
        const wasTrueSwing = isApexOpen(bridge.apex);
        bridge.attached = false;
        bridge.anchor = null;
        bridge.apex = createApexDetector();
        flightOriginStore.write(gameCtx, { x: entity.position[0], y: entity.position[1], z: entity.position[2] });
        sessionStore.write(gameCtx, applyRelease(session, wasTrueSwing, now));
        return;
      }

      const origin = { x: entity.position[0], y: entity.position[1], z: entity.position[2] };
      const forward = forwardVector(bridge.aim.yaw, bridge.aim.pitch);
      const target = pickHookTarget(origin, forward, archipelago.pylons, HOOK_MAX_LENGTH, HOOK_CONE_COS);
      if (target === null) {
        sessionStore.write(gameCtx, applyMissedHook(session, now));
        return;
      }
      const anchor = { x: target.base.x, y: target.ringY, z: target.base.z };
      const dist = Math.hypot(origin.x - anchor.x, origin.y - anchor.y, origin.z - anchor.z);
      bridge.attached = true;
      bridge.anchor = anchor;
      bridge.ropeLength = Math.max(1.5, dist);
      bridge.apex = createApexDetector();
      sessionStore.write(gameCtx, settleFlight(gameCtx, session, entity.position));
    },
  });

  ctx.game.commands.define("restartCourse", {
    apply(gameCtx) {
      const session = sessionStore.peek(gameCtx);
      const courseId = session?.courseId ?? session?.selectedCourseId ?? courses[0]!.id;
      beginCourse(gameCtx, courses, courseId);
    },
  });

  ctx.game.commands.define("startRun", {
    apply(gameCtx) {
      const session = sessionStore.peek(gameCtx) ?? initialSession(courses[0]!.id);
      if (session.phase !== "menu") return;
      beginCourse(gameCtx, courses, session.selectedCourseId);
    },
  });

  ctx.game.commands.define("returnToMenu", {
    apply(gameCtx) {
      const session = sessionStore.peek(gameCtx);
      const selected = session?.selectedCourseId ?? courses[0]!.id;
      const bridge = resetBridge();
      bridge.active = true;
      bridge.frozen = true;
      const course = courses.find((c) => c.id === selected) ?? courses[0]!;
      const cp = course.checkpoints[0]!;
      gameCtx.scene.entity.update(gameCtx.player.userId, { position: [cp.center[0], cp.center[1], cp.center[2]] });
      sessionStore.write(gameCtx, initialSession(selected));
    },
  });

  courses.forEach((course, index) => {
    ctx.game.commands.define(`selectCourse${index + 1}`, {
      apply(gameCtx) {
        const session = sessionStore.peek(gameCtx);
        if (session === undefined) return;
        sessionStore.write(gameCtx, selectCourse(session, course.id));
      },
    });
  });
}

export { settleFlight };

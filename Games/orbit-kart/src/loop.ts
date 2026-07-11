import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import { RIVALS } from "./game/ai/rivals";
import { CAMERA_ANCHOR_ID, CAMERA_LEAD_SECONDS, PLAYER_ID } from "./game/constants";
import { PLAYER_KART_ENTITY, RIVAL_KART_ENTITY } from "./game/entities/karts/catalog";
import { createClusterMarkers, updateKartMarkers } from "./game/race/markers";
import { MARKERS_STORE_KEY, readMarkers } from "./game/race/markersStore";
import { RACER_SPAWNS } from "./game/race/track";
import { createRaceSession, type RacePhase, type RaceSession } from "./game/race/session";
import { readSession, SESSION_STORE_KEY } from "./game/race/sessionStore";

const RACE_PHASE_STORE_KEY = "orbitKartRacePhase";

function syncPhase(ctx: GameContext, phase: RacePhase): void {
  ctx.game.store.set(RACE_PHASE_STORE_KEY, phase);
  setGamePhase(ctx, phase === "start" ? "menu" : phase === "finished" ? "ended" : "playing");
}

export function onInit(ctx: GameContext): void {
  const session = createRaceSession();
  ctx.game.store.set(SESSION_STORE_KEY, session);
  ctx.game.store.set(MARKERS_STORE_KEY, createClusterMarkers());
  syncPhase(ctx, "start");

  if (!ctx.game.commands.has("startRace")) {
    ctx.game.commands.define("startRace", {
      apply(state) {
        readSession(state)?.confirmStart();
      },
    });
  }
  if (!ctx.game.commands.has("restart")) {
    ctx.game.commands.define("restart", {
      apply(state) {
        readSession(state)?.restart();
      },
    });
  }
}

export function onNewPlayer(ctx: GameContext): void {
  const playerSpawn = RACER_SPAWNS[PLAYER_ID]!;
  ctx.scene.entity.despawn(ctx.player.userId);
  ctx.scene.entity.spawn(PLAYER_KART_ENTITY, {
    id: ctx.player.userId,
    position: playerSpawn.position,
    rotationY: playerSpawn.heading,
    role: "player",
  });

  for (const rival of RIVALS) {
    const spawn = RACER_SPAWNS[rival.id]!;
    ctx.scene.entity.despawn(rival.id);
    ctx.scene.entity.spawn(RIVAL_KART_ENTITY[rival.id]!, {
      id: rival.id,
      position: spawn.position,
      rotationY: spawn.heading,
      role: "npc",
    });
  }

  ctx.scene.entity.despawn(CAMERA_ANCHOR_ID);
  ctx.scene.entity.spawn(CAMERA_ANCHOR_ID, {
    id: CAMERA_ANCHOR_ID,
    position: playerSpawn.position,
    rotationY: playerSpawn.heading,
    role: "prop",
  });
  ctx.camera.follow(CAMERA_ANCHOR_ID);
}

export function onTick(ctx: GameContext, dt: number): void {
  const session: RaceSession | undefined = readSession(ctx);
  if (session === undefined) return;

  session.tick(dt, ctx.time.now(), {
    thrust: ctx.input.isDown("thrust"),
    retro: ctx.input.isDown("retroThrust"),
    rotateLeft: ctx.input.isDown("rotateLeft"),
    rotateRight: ctx.input.isDown("rotateRight"),
    dischargeHeld: ctx.input.isDown("dischargeSling"),
  });

  const snapshot = session.snapshot();
  const previousPhase = ctx.game.store.get(RACE_PHASE_STORE_KEY) as RacePhase | undefined;
  if (snapshot.phase !== previousPhase) syncPhase(ctx, snapshot.phase);

  const playerKart = snapshot.karts[PLAYER_ID];
  if (playerKart !== undefined) {
    ctx.scene.entity.setPose(ctx.player.userId, { position: playerKart.position, rotationY: playerKart.heading, dt });
    const [px, , pz] = playerKart.position;
    const [vx, vz] = playerKart.velocity;
    ctx.scene.entity.setPose(CAMERA_ANCHOR_ID, {
      position: [px + vx * CAMERA_LEAD_SECONDS, playerKart.position[1], pz + vz * CAMERA_LEAD_SECONDS],
      rotationY: playerKart.heading,
      dt,
    });
  }
  for (const rival of RIVALS) {
    const kart = snapshot.karts[rival.id];
    if (kart !== undefined) ctx.scene.entity.setPose(rival.id, { position: kart.position, rotationY: kart.heading, dt });
  }

  const markers = readMarkers(ctx);
  if (markers !== undefined) updateKartMarkers(markers, snapshot);
}

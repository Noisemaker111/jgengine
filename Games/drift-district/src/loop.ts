import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { setGamePhase } from "@jgengine/core/game/gamePhase";

import { CAR_PLAYER_ENTITY } from "./game/entities/vehicles/catalog";
import { createRaceSession, SESSION_STORE_KEY, type RacePhase, type RaceSession } from "./game/race/session";
import { RIVALS } from "./game/rivals/catalog";
import { createDriveInput, type DriveInput } from "./game/vehicle/input";
import { placeCityProps, syncBarriers } from "./game/world/setup";

const SESSION_KEY = SESSION_STORE_KEY;
const INPUT_KEY = "input";
const RUN_SEED = "drift-district-run";

function syncPhase(ctx: GameContext, phase: RacePhase): void {
  setGamePhase(
    ctx,
    phase === "start" ? "menu" : phase === "countdown" || phase === "racing" ? "playing" : "ended",
  );
}

export function onInit(ctx: GameContext): void {
  const previousInput = ctx.game.store.get(INPUT_KEY) as DriveInput | undefined;
  if (previousInput !== undefined) previousInput.detach();

  const session = createRaceSession(RUN_SEED);
  ctx.game.store.set(SESSION_KEY, session);

  const input = createDriveInput();
  input.attach();
  ctx.game.store.set(INPUT_KEY, input);

  if (!ctx.game.commands.has("confirm")) {
    ctx.game.commands.define("confirm", {
      apply: (state) => (state.game.store.get(SESSION_KEY) as RaceSession | undefined)?.confirm(),
    });
  }
  if (!ctx.game.commands.has("restart")) {
    ctx.game.commands.define("restart", {
      apply: (state) => (state.game.store.get(SESSION_KEY) as RaceSession | undefined)?.restart(),
    });
  }

  placeCityProps(ctx, session.snapshot().shiftState);
  syncPhase(ctx, session.snapshot().phase);
}

export function onNewPlayer(ctx: GameContext): void {
  const session = ctx.game.store.get(SESSION_KEY) as RaceSession | undefined;
  if (session === undefined) return;
  const snapshot = session.snapshot();

  ctx.scene.entity.despawn(ctx.player.userId);
  ctx.scene.entity.spawn(CAR_PLAYER_ENTITY, {
    id: ctx.player.userId,
    position: snapshot.playerPose.position,
    rotationY: snapshot.playerPose.heading,
    role: "player",
  });

  for (const rival of RIVALS) {
    const pose = snapshot.rivalPoses[rival.id];
    ctx.scene.entity.despawn(rival.id);
    ctx.scene.entity.spawn(rival.entityId, {
      id: rival.id,
      position: pose?.position ?? snapshot.playerPose.position,
      rotationY: pose?.heading ?? 0,
      role: "npc",
    });
  }
}

export function onTick(ctx: GameContext, dt: number): void {
  const session = ctx.game.store.get(SESSION_KEY) as RaceSession | undefined;
  const input = ctx.game.store.get(INPUT_KEY) as DriveInput | undefined;
  if (session === undefined || input === undefined) return;

  const previousPhase = session.snapshot().phase;
  if (input.consumeConfirm()) session.confirm();
  if (input.consumeRestart()) session.restart();

  const axis = input.sample(dt);
  const boostPressed = input.consumeBoost();
  session.tick(dt, axis, boostPressed);

  const snapshot = session.snapshot();
  if (snapshot.phase !== previousPhase) syncPhase(ctx, snapshot.phase);
  ctx.scene.entity.setPose(ctx.player.userId, {
    position: snapshot.playerPose.position,
    rotationY: snapshot.playerPose.heading,
    dt,
  });
  for (const rival of RIVALS) {
    const pose = snapshot.rivalPoses[rival.id];
    if (pose !== undefined) ctx.scene.entity.setPose(rival.id, { position: pose.position, rotationY: pose.heading, dt });
  }
  syncBarriers(ctx, snapshot.shiftState);

  ctx.game.store.set(SESSION_KEY, session);
}

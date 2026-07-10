import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { SLEDDERS } from "./game/ai/sledders";
import { SLED_PLAYER_ENTITY } from "./game/entities/vehicles/catalog";
import { createDriveInput, type DriveInput } from "./game/vehicle/input";
import { createRaceSession, SESSION_STORE_KEY, type RaceSession } from "./game/race/session";
import { placeShoreProps } from "./game/world/setup";

const SESSION_KEY = SESSION_STORE_KEY;
const INPUT_KEY = "input";
const RUN_SEED = "frostbite-circuit-run";

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

  placeShoreProps(ctx);
}

export function onNewPlayer(ctx: GameContext): void {
  const session = ctx.game.store.get(SESSION_KEY) as RaceSession | undefined;
  if (session === undefined) return;
  const snapshot = session.snapshot();

  ctx.scene.entity.despawn(ctx.player.userId);
  ctx.scene.entity.spawn(SLED_PLAYER_ENTITY, {
    id: ctx.player.userId,
    position: snapshot.playerPose.position,
    rotationY: snapshot.playerPose.heading,
    role: "player",
  });

  for (const def of SLEDDERS) {
    const pose = snapshot.sledderPoses[def.id];
    ctx.scene.entity.despawn(def.id);
    ctx.scene.entity.spawn(def.entityId, {
      id: def.id,
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

  if (input.consumeConfirm()) session.confirm();
  if (input.consumeRestart()) session.restart();

  const axis = input.sample(dt);
  session.tick(dt, axis);

  const snapshot = session.snapshot();
  ctx.scene.entity.setPose(ctx.player.userId, {
    position: snapshot.playerPose.position,
    rotationY: snapshot.playerPose.heading,
    dt,
  });
  for (const def of SLEDDERS) {
    const pose = snapshot.sledderPoses[def.id];
    if (pose !== undefined) ctx.scene.entity.setPose(def.id, { position: pose.position, rotationY: pose.heading, dt });
  }

  ctx.game.store.set(SESSION_KEY, session);
}

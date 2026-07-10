import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { DEFAULT_DIFFICULTY, type DifficultyId } from "./game/match/difficulty";
import { getSimulation } from "./game/match/simulation";
import { PLAYER_CYAN } from "./game/entities/catalog";
import { placeArenaDressing, spawnMatchEntities } from "./game/world/setup";

interface ThrowChargeInput {
  point: readonly [number, number, number];
}

interface StartInput {
  difficulty?: DifficultyId;
}

interface SelectDifficultyInput {
  difficulty: DifficultyId;
}

export function onInit(ctx: GameContext): void {
  placeArenaDressing(ctx);
  spawnMatchEntities(ctx, 0, 0, 13, 0);
  ctx.game.store.set("selectedDifficulty", DEFAULT_DIFFICULTY);

  const sim = getSimulation(ctx);

  ctx.game.commands.define<ThrowChargeInput>("throwCharge", {
    apply(state, input) {
      sim.throwChargeAt(state, input.point[0], input.point[2]);
    },
  });
  ctx.game.commands.define("throwFacing", {
    apply(state) {
      sim.throwFacing(state);
    },
  });
  ctx.game.commands.define("detonateCharges", {
    apply(state) {
      sim.detonateLocalCharges(state);
    },
  });
  ctx.game.commands.define("dodgeRoll", {
    apply(state) {
      sim.dodgeRoll(state);
    },
  });
  ctx.game.commands.define<StartInput>("start", {
    apply(state, input) {
      const stored = state.game.store.get("selectedDifficulty") as DifficultyId | undefined;
      sim.start(state, input?.difficulty ?? stored ?? DEFAULT_DIFFICULTY);
    },
  });
  ctx.game.commands.define("restart", {
    apply(state) {
      sim.restart(state);
    },
  });
  ctx.game.commands.define<SelectDifficultyInput>("selectDifficulty", {
    apply(state, input) {
      sim.setSelectedDifficulty(state, input.difficulty);
    },
  });
}

export function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(PLAYER_CYAN, { id: ctx.player.userId, position: [-8, 0, 0], role: "player" });
}

export function onTick(ctx: GameContext, dt: number): void {
  getSimulation(ctx).tick(ctx, dt);
}

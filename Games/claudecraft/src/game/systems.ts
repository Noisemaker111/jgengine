import { defineSystem } from "@jgengine/core/game/defineSystem";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { resolvePlayerMovementTuning, stepPlayerMovement } from "@jgengine/core/movement/playerMovement";

import { tickMobs } from "./ai/mobs";
import { tickAuction } from "./auction/systems";
import { tickMusic } from "./audio/setup";
import { tickFiesta } from "./arena/fiesta";
import { tickAuras, tickHero } from "./combat/engine";
import { tickDelve } from "./delves/systems";
import { tickMail } from "./mail/systems";
import { tickValeCup } from "./minigames/valeCup";
import { tickProtectYumi } from "./minigames/yumi";
import { tickPets } from "./pets/systems";
import { tickWorldBoss } from "./world/worldBoss";
import { physics, world } from "../world";

const movementTuning = resolvePlayerMovementTuning({ physics, world });
const EMPTY_INPUT = { held: [] as readonly string[], pointer: null };

function forEachPlayer(ctx: GameContext, fn: (userId: string) => void): void {
  const members = ctx.game.players?.list() ?? [];
  if (members.length === 0) {
    fn(ctx.player.userId);
    return;
  }
  for (const member of members) fn(member.userId);
}

/** World-space AI: boss pressure + mob AI. */
export const mobs = defineSystem({
  id: "mobs",
  tick: { type: "frame", stage: "ai" },
  update(ctx, dt) {
    const clamped = Math.min(dt, 0.25);
    tickWorldBoss(ctx);
    tickMobs(ctx, clamped);
  },
});

/** Combat simulation: auras + per-player hero kit. */
export const combat = defineSystem({
  id: "combat",
  tick: { type: "frame", stage: "combat" },
  update(ctx, dt) {
    const clamped = Math.min(dt, 0.25);
    tickAuras(ctx);
    forEachPlayer(ctx, (userId) => tickHero(ctx, userId, clamped));
  },
});

/** Companions. */
export const pets = defineSystem({
  id: "pets",
  tick: { type: "frame", stage: "activities", after: "combat" },
  update(ctx, dt) {
    const clamped = Math.min(dt, 0.25);
    forEachPlayer(ctx, (userId) => tickPets(ctx, userId, clamped));
  },
});

/** Delves, mail, auction — slow world activities. */
export const economyActivities = defineSystem({
  id: "economy-activities",
  tick: { type: "frame", stage: "activities" },
  update(ctx, dt) {
    const clamped = Math.min(dt, 0.25);
    forEachPlayer(ctx, (userId) => {
      tickDelve(ctx, userId, clamped);
      tickMail(ctx, userId);
      tickAuction(ctx, userId);
    });
  },
});

/** Seasonal / arena minigames. */
export const minigames = defineSystem({
  id: "minigames",
  tick: { type: "frame", stage: "activities" },
  update(ctx, dt) {
    const clamped = Math.min(dt, 0.25);
    forEachPlayer(ctx, (userId) => {
      tickValeCup(ctx, userId, clamped);
      tickProtectYumi(ctx, userId, clamped);
      tickFiesta(ctx, userId, clamped);
    });
  },
});

/** Hosted multiplayer: step each member's movement from their held input. */
export const multiplayerMovement = defineSystem({
  id: "multiplayer-movement",
  feature: "players",
  tick: { type: "frame", stage: "movement" },
  update(ctx, dt) {
    const members = ctx.game.players?.list() ?? [];
    for (const member of members) {
      stepPlayerMovement(ctx, member.userId, member.input ?? EMPTY_INPUT, dt, movementTuning);
    }
  },
});

/** Adaptive music bed. */
export const audio = defineSystem({
  id: "audio",
  tick: { type: "frame", stage: "effects" },
  update(ctx) {
    forEachPlayer(ctx, (userId) => tickMusic(ctx, userId));
  },
});

/**
 * Composition root for ClaudeCraft runtime capabilities — meaningful systems, not micro-ticks.
 * Classic `loop` still owns boot (register catalogs, death handlers, world setup) and join.
 */
export const systems = [
  multiplayerMovement,
  combat,
  mobs,
  pets,
  economyActivities,
  minigames,
  audio,
];

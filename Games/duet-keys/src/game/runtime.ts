import { createLevelSequence, type LevelSequence } from "@jgengine/core/game/levelSequence";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

import { ROOMS, type RoomDef } from "./rooms/catalog";
import { applyRoomVisuals, buildRoom, currentRoomState } from "./rooms/setup";
import { duetStore, freshRoom } from "./stores";
import type { HeroId } from "./types";

export const levelSeq = perContext<LevelSequence<RoomDef>>(() =>
  createLevelSequence({
    levels: ROOMS.map((room) => ({ id: room.id, config: room })),
    storage: null,
  }),
);

interface Seats {
  lumen: string | null;
  anchor: string | null;
}
const seats = perContext<Seats>(() => ({ lumen: null, anchor: null }));

function heroesOwnedBy(ctx: GameContext, userId: string): HeroId[] {
  return ctx.player.possession
    .listOwned(userId)
    .filter((id): id is HeroId => id === "lumen" || id === "anchor");
}

/** Assign a joining player to a hero seat: first player drives both (swappable); a second takes Anchor. */
export function seatPlayer(ctx: GameContext, userId: string): void {
  const s = seats(ctx);
  if (s.lumen === userId || s.anchor === userId) {
    ctx.player.possession.possess(userId, s.lumen === userId ? "lumen" : "anchor");
    return;
  }
  if (s.lumen === null) {
    s.lumen = userId;
    ctx.player.possession.own(userId, "lumen");
    ctx.player.possession.possess(userId, "lumen");
    if (s.anchor === null) {
      s.anchor = userId; // solo: own both, swap between them
      ctx.player.possession.own(userId, "anchor");
    }
    return;
  }
  // second distinct player claims Anchor, taking it from a solo player if needed
  if (s.anchor !== null && s.anchor === s.lumen) ctx.player.possession.disown(s.anchor, "anchor");
  s.anchor = userId;
  ctx.player.possession.own(userId, "anchor");
  ctx.player.possession.possess(userId, "anchor");
}

export function swapHero(ctx: GameContext, userId: string): boolean {
  const owned = heroesOwnedBy(ctx, userId);
  if (owned.length < 2) return false;
  const active = ctx.player.possession.active(userId);
  const next = owned.find((id) => id !== active) ?? owned[0];
  ctx.player.possession.possess(userId, next);
  duetStore.update(ctx, (state) => ({ ...state, active: next }));
  return true;
}

export function activeHero(ctx: GameContext, userId: string): HeroId {
  const active = ctx.player.possession.active(userId);
  return active === "anchor" ? "anchor" : "lumen";
}

export function loadCurrentRoom(ctx: GameContext): void {
  const current = levelSeq(ctx).current();
  if (current === null) return;
  const room = current.config;
  duetStore.update(ctx, (state) => ({ ...state, ...freshRoom(current.index), active: "lumen" }));
  buildRoom(ctx, room);
  applyRoomVisuals(ctx, room, currentRoomState(ctx, room));
  for (const userId of [seats(ctx).lumen, seats(ctx).anchor]) {
    if (userId !== null) ctx.player.possession.possess(userId, seats(ctx).lumen === userId ? "lumen" : "anchor");
  }
}

export function startRun(ctx: GameContext): void {
  levelSeq(ctx).start();
  loadCurrentRoom(ctx);
}

export function advanceRoom(ctx: GameContext): void {
  const seq = levelSeq(ctx);
  seq.clear();
  if (seq.advance()) {
    loadCurrentRoom(ctx);
  } else {
    duetStore.update(ctx, (state) => ({ ...state, status: "complete", solveTimer: 0 }));
  }
}

export function resetRoom(ctx: GameContext): void {
  loadCurrentRoom(ctx);
}

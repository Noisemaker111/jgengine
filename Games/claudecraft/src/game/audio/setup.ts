import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { inCombat } from "../session/hero";
import { classStore } from "../session/stores";
import { ZONES, zoneAt } from "../world/zones";
import { cue } from "./cues";

const ZONE_TRANSPOSE: Record<string, number> = { vale: 0, marsh: -2, peaks: 3 };

let lastTheme: string | null | undefined;

function hubTheme(x: number, z: number): string | null {
  for (const zone of ZONES) {
    const dx = x - zone.hub.x;
    const dz = z - zone.hub.z;
    if (dx * dx + dz * dz <= (zone.hub.radius + 8) ** 2) return "town";
  }
  return null;
}

/** Register one-shot SFX cues against the engine event bus. Call once from onInit. */
export function setupAudioCues(ctx: GameContext): void {
  ctx.game.events.on("stat.levelUp", () => cue(ctx, "level_up"));
  ctx.game.events.on("loot.granted", () => cue(ctx, "loot_item"));
  ctx.game.events.on("quest.accepted", () => cue(ctx, "quest_accept"));
  ctx.game.events.on("quest.completed", () => cue(ctx, "quest_done"));
  ctx.game.events.on("worldItem.picked_up", () => cue(ctx, "loot_item"));
  ctx.game.events.on("entity.died", () => cue(ctx, "death"));
}

/** Crossfade the soundtrack to the player's current zone/combat theme. Cheap per-tick — only emits on a theme change. */
export function tickMusic(ctx: GameContext, userId: string): void {
  if (classStore.peek(ctx, userId) === undefined) return;
  const self = ctx.scene.entity.get(userId);
  if (self === null) return;
  const [x, , z] = self.position;
  let theme: string;
  let transpose = 0;
  if (inCombat(ctx, userId)) {
    theme = "battle";
    transpose = ZONE_TRANSPOSE[zoneAt(z).id] ?? 0;
  } else {
    theme = hubTheme(x, z) ?? zoneAt(z).id;
  }
  if (theme === lastTheme) return;
  lastTheme = theme;
  ctx.game.audio.music(theme, transpose);
}

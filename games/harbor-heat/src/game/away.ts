import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { defineStore } from "@jgengine/core/store/defineStore";
import { accrueSince } from "@jgengine/core/time/accrueSince";
import { TURF } from "./city";
import { cityOf } from "./cityRuntime";

/** What changed while the player slept or was away, for the morning paper. */
export interface AwaySummary {
  kind: "sleep" | "away";
  title: string;
  summary: string;
  lines: readonly { label: string; value: string }[];
}

/** The morning paper waiting on screen; a menu, not run state. */
export const awayStore = defineStore<AwaySummary | undefined>("harbor.away", undefined);

/** At most this much real time catches up on Continue: the city keeps running, not forever. */
export const AWAY_CAP_MS = 20 * 60 * 1000;
/** Shorter gaps than this are a reload, not time away. */
const AWAY_MIN_MS = 60 * 1000;
/** Game-clock seconds in one in-game day (`game.config.ts` time.dayLength). */
const DAY = 720;

const SIDE: Record<string, string> = { player: "you", carmine: "the Carmines", riptide: "the Riptides", locals: "the locals" };

/**
 * Let `seconds` of game time pass at once: the clock jumps, the city's world model catches up (fronts
 * pay into the safe, crews push, blocks change hands, moods cool), and the morning paper is set.
 */
export function passTime(ctx: GameContext, seconds: number, kind: AwaySummary["kind"]): AwaySummary {
  const world = cityOf(ctx);
  const owners = Object.fromEntries(TURF.map((id) => [id, world.fact(`${id}.owner`)]));
  const clock = ctx.time.snapshot();
  ctx.time.hydrate({ ...clock, now: clock.now + seconds });
  const result = world.advance(seconds, { maxFires: kind === "sleep" ? 1 : 2 });
  const lines: { label: string; value: string }[] = [];
  const takings = Math.floor(result.gained["fronts.takings"] ?? 0);
  if (takings > 0) lines.push({ label: "Fronts' safe", value: `+$${takings.toLocaleString("en-US")}` });
  for (const id of TURF) {
    const now = world.fact(`${id}.owner`);
    if (now === owners[id]) continue;
    const label = world.def.places?.[id]?.label ?? id;
    lines.push({ label: label.charAt(0).toUpperCase() + label.slice(1), value: `${SIDE[String(owners[id])] ?? owners[id]} → ${SIDE[String(now)] ?? now}` });
  }
  const pushes = result.log.filter((entry) => entry.kind.startsWith("turf_push:")).length;
  if (pushes > 0) lines.push({ label: "Crew pushes", value: `${pushes}` });
  const hours = Math.round((seconds / DAY) * 24);
  const span = kind === "sleep" ? `${hours} hours` : `${Math.round(seconds / 60)} minutes`;
  const quiet = lines.length === 0;
  const summary: AwaySummary = {
    kind,
    title: kind === "sleep" ? (quiet ? "A quiet night in Mainsail" : "Mainsail never sleeps") : quiet ? "The city kept its head down" : "While you were gone",
    summary: quiet
      ? `${span} went by and nothing moved on the street.`
      : `${span} went by. ${result.log.at(-1)?.text ?? "The street kept moving."}`,
    lines,
  };
  awayStore.write(ctx, summary);
  return summary;
}

/** Game seconds from now until the next 08:00, at least an hour off. */
export function secondsUntilMorning(ctx: GameContext): number {
  const fraction = ctx.time.calendar().dayFraction;
  let ahead = (8 / 24 - fraction + 1) % 1;
  if (ahead < 1 / 24) ahead += 1;
  return ahead * DAY;
}

const anchors = perContext(() => ({ savedMs: null as number | null, appliedMs: 0 }));

/** The wall clock a loaded save was written at (the document's own `savedAt`), so Continue knows how long the city ran without you. */
export function noteSavedAt(ctx: GameContext, wallMs: number): void {
  anchors(ctx).savedMs = Number.isFinite(wallMs) && wallMs > 0 ? wallMs : null;
}

/**
 * After a save loads, catch the city up on the real time since it was written (capped). A second
 * load of the same save in one boot only catches up what passed since the first.
 */
export function catchUpAway(ctx: GameContext, nowMs = Date.now()): AwaySummary | null {
  const anchor = anchors(ctx);
  if (anchor.savedMs === null) return null;
  const accrual = accrueSince(Math.max(anchor.savedMs, anchor.appliedMs), nowMs, { capMs: AWAY_CAP_MS });
  anchor.appliedMs = accrual.anchorMs;
  if (accrual.elapsedMs < AWAY_MIN_MS) return null;
  return passTime(ctx, accrual.elapsedSeconds, "away");
}

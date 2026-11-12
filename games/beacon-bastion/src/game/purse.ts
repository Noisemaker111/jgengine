import type { WorldCause } from "@jgengine/core/worldModel/worldModel";

/**
 * Why the keep's gold moved, as its books record it. The keep's world owns the purse (`keep.gold`);
 * every change it makes is posted to the shared transaction ledger under one of these reasons, so the
 * books explain the purse rather than a bare number changing.
 */
export type PurseReason =
  | "opening-purse"
  | "kill-bounty"
  | "early-call-bonus"
  | "held-pay"
  | "tower-build"
  | "tower-upgrade"
  | "tower-sale"
  | "build-cancelled"
  | "order-cancelled"
  | "wall-mend"
  | "load"
  | "reconcile";

/** The fact the keep's purse lives in, and the one currency its books keep. */
export const PURSE_FACT = "keep.gold";
export const PURSE_CURRENCY = "gold";
export const PURSE_ACCOUNT = "keep";

/** The keep's ripples that pay gold, by the event that raises them. */
const EVENT_REASONS: Readonly<Record<string, PurseReason>> = {
  bounty: "kill-bounty",
  overlap_bonus: "early-call-bonus",
  held_pay: "held-pay",
};

/** The reason a world call that moved the purse is booked under. */
export function purseReason(cause: WorldCause): PurseReason {
  switch (cause.kind) {
    case "event":
      return EVENT_REASONS[cause.name ?? ""] ?? "reconcile";
    case "place":
      return "tower-build";
    case "remove":
      return "build-cancelled";
    case "cancel":
      return "order-cancelled";
    case "act":
      if (cause.name === "sell") return "tower-sale";
      if (cause.name === "mend") return "wall-mend";
      return "tower-upgrade";
    case "restore":
      return "load";
    default:
      return "reconcile";
  }
}

/** What the entry points at: the tower it was done to, else the kind, action or event it named. */
export function purseRef(cause: WorldCause): string | undefined {
  return cause.target ?? cause.name ?? undefined;
}

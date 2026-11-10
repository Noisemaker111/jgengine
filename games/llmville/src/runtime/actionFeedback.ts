import { createNoticeFeed } from "@jgengine/core/notifications/notices";

/** How long a refused action's reason stays up: long enough to read a two-sentence reason. */
const ACTION_NOTICE_TTL_MS = 4000;

/** Refused-action notices for every LLMville screen, drawn by the kit's toast wherever a notice stack mounts this feed. */
export const actionNotices = createNoticeFeed({ denyTtlMs: ACTION_NOTICE_TTL_MS });

function showDenied(text: string): void {
  actionNotices.push({ text, tone: "deny" });
}

/**
 * Player-facing labels for rejection reasons returned by backend mutations.
 * The backend computes precise reasons; until now they were dropped on the
 * floor and failed actions looked like dead buttons.
 */
const REASON_LABELS: Record<string, string> = {
  // Auth / access
  Unauthorized: "You don't have edit access to this lab.",
  unauthenticated: "Sign in to do that.",

  // Build placement (build.place pre-diagnosis + engine command)
  no_claims: "Place your first item in an open space to start your plot.",
  unclaimed_land: "Placement adds the needed plot tiles. Check the tile cost and nearby space.",
  structural_column: "Can't build on a structural column.",
  invalid_placement: "Blocked here — try a clear spot away from other labs and columns.",
  "Unknown build item": "That item isn't placeable.",
  "Out of stock": "You don't have that item in stock.",
  "Nothing placed to pick up": "Nothing of that item is placed nearby.",
  "Unknown player": "Session expired — reload the page.",

  // Store / economy
  "Not researched": "Research this item before buying it.",
  insufficient_funds: "Not enough cash.",
  not_enough_data: "Not enough data tokens.",
  unknown_item: "That item isn't for sale.",

  // Racks / hardware
  rack_full: "That rack is full.",
  no_stock: "You don't have that hardware in stock.",
  unknown_hardware: "Unknown hardware.",
  unknown_rack: "Unknown rack.",
  slot_occupied: "That slot is occupied.",
  empty_slot: "That slot is empty.",
  out_of_range_slot: "Invalid rack slot.",

  // Models / training
  already_serving: "Already serving.",
  unknown_model: "Unknown model.",
  vram_insufficient: "Not enough free VRAM for this model.",
};

const GENERIC_ERROR = "That didn't work — try again.";

/** Raise a notice for a backend rejection reason string. */
export function showActionError(reason: string | undefined): void {
  if (!reason) {
    showDenied(GENERIC_ERROR);
    return;
  }
  showDenied(REASON_LABELS[reason] ?? reason);
}

/**
 * Raise a notice for a thrown mutation error. Convex mutations reject with an
 * Error whose message embeds the ConvexError text (e.g.
 * "Uncaught ConvexError: <reason>"); unwrap what we can and fall back to a
 * generic label instead of dumping stack traces at the player.
 */
export function showActionErrorFromException(error: unknown): void {
  const raw =
    typeof error === "object" && error !== null
      ? ((error as { data?: unknown }).data ?? (error as { message?: unknown }).message)
      : undefined;
  if (typeof raw !== "string" || raw.length === 0) {
    showActionError(undefined);
    return;
  }
  const unwrapped = raw.replace(/^.*Uncaught ConvexError:\s*/i, "").replace(/\s*at .*/i, "").trim();
  if (REASON_LABELS[unwrapped] || REASON_LABELS[raw]) {
    showActionError(REASON_LABELS[unwrapped] ? unwrapped : raw);
    return;
  }
  showDenied(unwrapped.length > 0 && unwrapped.length <= 120 ? unwrapped : GENERIC_ERROR);
}

/** Throttle key so repeating guards don't spam notices every frame. */
const lastShownAt = new Map<string, number>();
const THROTTLE_MS = 2500;

export function showActionErrorThrottled(key: string, reason: string | undefined): void {
  const now = Date.now();
  const last = lastShownAt.get(key) ?? 0;
  if (now - last < THROTTLE_MS) return;
  lastShownAt.set(key, now);
  showActionError(reason);
}

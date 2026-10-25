import type { Id } from "@llmville/backend/convex/_generated/dataModel";

/** Minimal shape the main menu needs from `getUserWorld`. */
export interface MenuWorld {
  _id: Id<"games">;
}

/**
 * The single source of truth for the main-menu primary action.
 *
 * Everything the menu renders derives from this one value, so there is no
 * juggling of separate "loading" / "has world" booleans in the component.
 */
export const MAIN_MENU_KIND = {
  loading: "loading",
  new: "new",
  continue: "continue",
} as const;

export type MainMenuPhase =
  | { kind: typeof MAIN_MENU_KIND.loading }
  | { kind: typeof MAIN_MENU_KIND.new }
  | { kind: typeof MAIN_MENU_KIND.continue; gameId: Id<"games"> };

export interface DeriveMainMenuPhaseInput {
  /** True only on a genuine cold first-auth (no remembered Convex token yet). */
  authLoading: boolean;
  /** Convex-auth derived: a remembered login is authenticated on first render. */
  isAuthenticated: boolean;
  /**
   * From `useUserWorld`, which is gated on the Convex identity:
   * `undefined` = still loading (incl. waiting on the Convex token),
   * `null` = signed in with no world, object = the world.
   */
  userWorld: MenuWorld | null | undefined;
}

export function deriveMainMenuPhase({
  authLoading,
  isAuthenticated,
  userWorld,
}: DeriveMainMenuPhaseInput): MainMenuPhase {
  if (authLoading) return { kind: MAIN_MENU_KIND.loading };

  // Guests start a new lab (the action routes them to sign-in first).
  if (!isAuthenticated) return { kind: MAIN_MENU_KIND.new };

  // `userWorld` stays `undefined` until the Convex identity has propagated and
  // the query has resolved, so this single check covers both — no flicker.
  if (userWorld === undefined) return { kind: MAIN_MENU_KIND.loading };
  if (userWorld === null) return { kind: MAIN_MENU_KIND.new };

  return { kind: MAIN_MENU_KIND.continue, gameId: userWorld._id };
}

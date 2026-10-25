import { api } from "@llmville/backend/convex/_generated/api";
import { useMutation } from "convex/react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { useAuth, usePlayerIdentity } from "@/auth";
import { loadGameSessionModule, preloadGameRoute } from "@/runtime/gameRoutePreload";
import { deriveMainMenuPhase, MAIN_MENU_KIND, type MainMenuPhase } from "@/runtime/mainMenuPhase";
import { preloadGameCreateRoute } from "@/runtime/gameCreate";
import { destinationAfterAuth } from "@/runtime/playEntry";
import { clearAllLocalGamePersistence } from "@/storage/storage";
import { showActionErrorFromException } from "@/runtime/actionFeedback";
import { loadAuthScreenModule } from "@/user/authScreenPreload";
import { useUserWorld } from "@/world/world";

export interface MainMenuState {
  phase: MainMenuPhase;
  confirmDeleteWorld: boolean;
  setConfirmDeleteWorld: (open: boolean) => void;
  isDeleting: boolean;
  /** True from play/continue click until the game route takes over. */
  isEnteringGame: boolean;
  /** Start (or resume into) a lab — routes to sign-in first when needed. */
  startGame: () => void;
  /** Open the user's existing world. No-op unless the phase is `continue`. */
  continueGame: () => void;
  /** Warm the create-game route ahead of a click (hover / pointer-down). */
  warmCreateRoute: () => void;
  /** Warm the continue-game route when the user already has a world. */
  warmContinueRoute: () => void;
  deleteCurrentWorld: () => Promise<void>;
}

export function useMainMenu(): MainMenuState {
  const navigate = useNavigate();
  const router = useRouter();
  // Drive the menu off Convex auth (the optimistic token), not the better-auth
  // session: a remembered login is "authenticated" on the first render, so the
  // primary action resolves without waiting on the `/get-session` round-trip.
  const { isAuthenticated, playerId } = usePlayerIdentity();
  const { isConvexAuthLoading: authLoading } = useAuth();

  const [confirmDeleteWorld, setConfirmDeleteWorld] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEnteringGame, setIsEnteringGame] = useState(false);

  // `useUserWorld` only resolves once the Convex identity is ready, so its value
  // is honest: `undefined` while loading, `null` only when the signed-in user
  // truly has no world.
  const userWorld = useUserWorld();
  const deleteWorld = useMutation(api.world.deleteWorld);

  // Phase is derived straight from reactive state — no optimistic flags. The
  // backend deletes the world row synchronously, so `getUserWorld` flips to
  // null on its own the moment a delete commits.
  const phase = deriveMainMenuPhase({
    authLoading,
    isAuthenticated,
    userWorld,
  });

  // Start downloading the heavy game-session chunk the moment the player is
  // authenticated — before they even pick Continue/New — so it overlaps the
  // world lookup instead of starting on click. Touch devices never fire
  // hover/pointer warmups, so without this the download begins on click and the
  // player stares at a frozen menu while the navigation transition waits for it.
  useEffect(() => {
    if (isAuthenticated) void loadGameSessionModule();
  }, [isAuthenticated]);

  // Signed-out players are routed to /login on click, so warming the giant
  // game-session chunk here would only contend with the sign-in screen's own
  // chunk — warm the auth screen instead and leave the game download to the
  // authenticated effect above.
  const warmCreateRoute = useCallback(() => {
    if (!isAuthenticated) {
      void loadAuthScreenModule();
      return;
    }
    preloadGameCreateRoute(router);
  }, [isAuthenticated, router]);

  const warmContinueRoute = useCallback(() => {
    if (phase.kind !== MAIN_MENU_KIND.continue) return;
    preloadGameRoute(router, phase.gameId);
  }, [phase, router]);

  const startGame = useCallback(() => {
    if (!isAuthenticated) {
      void loadAuthScreenModule();
      void navigate({ to: "/login", search: { intent: "play" }, replace: true });
      return;
    }
    setIsEnteringGame(true);
    preloadGameCreateRoute(router);
    void loadGameSessionModule().finally(() => {
      void navigate(destinationAfterAuth("play"));
    });
  }, [isAuthenticated, navigate, router]);

  const continueGame = useCallback(() => {
    if (phase.kind !== MAIN_MENU_KIND.continue) return;
    const { gameId } = phase;
    setIsEnteringGame(true);
    preloadGameRoute(router, gameId);
    void loadGameSessionModule().finally(() => {
      void navigate({ to: "/game/$gameId", params: { gameId } });
    });
  }, [navigate, phase, router]);

  const deleteCurrentWorld = useCallback(async () => {
    if (!isAuthenticated || playerId === "anonymous") return;
    setIsDeleting(true);
    try {
      await deleteWorld({});
      clearAllLocalGamePersistence();
      setConfirmDeleteWorld(false);
    } catch (error) {
      // A failed destructive action must be visible — previously the dialog
      // just stayed open with no feedback.
      showActionErrorFromException(error);
    } finally {
      setIsDeleting(false);
    }
  }, [deleteWorld, isAuthenticated, playerId]);

  return {
    phase,
    confirmDeleteWorld,
    setConfirmDeleteWorld,
    isDeleting,
    isEnteringGame,
    startGame,
    continueGame,
    warmCreateRoute,
    warmContinueRoute,
    deleteCurrentWorld,
  };
}

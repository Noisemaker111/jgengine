import { useGameContext } from "@jgengine/react/provider";
import { engineActions, type GameEngine } from "@/runtime/gameEngine";
import { runPromptCommand } from "@/runtime/promptCommands";
import { matchesKeybind, type AppKeybinds } from "@/settings/settings";
import { useEffect, useRef } from "react";

interface UseGameEngineInputParams {
  engine: GameEngine;
  buildItemCount: number;
  onBuildPrimaryAction: () => void;
  onBuildTrashAction: () => void;
  onConfirmPlacement: () => void;
  isMenuOpen?: boolean;
  isStorageOpenOnTablet?: boolean;
  keybinds: AppKeybinds;
  onToggleTablet: (nextOpen?: boolean) => void;
  onPortalInteract?: () => boolean;
  onHoldInteract?: (holding: boolean) => void;
}

export function useGameEngineInput({
  engine,
  buildItemCount,
  onBuildPrimaryAction,
  onBuildTrashAction,
  onConfirmPlacement,
  isMenuOpen = false,
  isStorageOpenOnTablet = false,
  keybinds,
  onToggleTablet,
  onPortalInteract,
  onHoldInteract,
}: UseGameEngineInputParams) {
  const ctx = useGameContext();
  const buildCountRef = useRef(buildItemCount);
  const onToggleTabletRef = useRef(onToggleTablet);
  const onPortalInteractRef = useRef(onPortalInteract);
  const onHoldInteractRef = useRef(onHoldInteract);
  const isMenuOpenRef = useRef(isMenuOpen);
  const pendingToggleTabletRef = useRef<boolean | null>(null);
  const suppressToggleKeyUpRef = useRef(false);
  const buildPrimaryRef = useRef(onBuildPrimaryAction);
  const buildTrashRef = useRef(onBuildTrashAction);
  const confirmPlacementRef = useRef(onConfirmPlacement);

  useEffect(() => {
    buildCountRef.current = buildItemCount;
    buildPrimaryRef.current = onBuildPrimaryAction;
    buildTrashRef.current = onBuildTrashAction;
    confirmPlacementRef.current = onConfirmPlacement;
    onToggleTabletRef.current = onToggleTablet;
    onPortalInteractRef.current = onPortalInteract;
    onHoldInteractRef.current = onHoldInteract;
    isMenuOpenRef.current = isMenuOpen;
  }, [
    buildItemCount,
    onBuildPrimaryAction,
    onBuildTrashAction,
    onConfirmPlacement,
    onToggleTablet,
    onPortalInteract,
    onHoldInteract,
    isMenuOpen,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (event.target instanceof HTMLElement && event.target.closest('button, select, [data-chat-panel], [role="dialog"]'))) return;
      if (
        event.target instanceof HTMLInputElement
        || event.target instanceof HTMLTextAreaElement
        || (event.target instanceof HTMLElement && event.target.isContentEditable)
      ) {
        return;
      }

      const state =
        // llmville-allow-engine-getstate-in-hooks: DOM keydown handler reads latest build draft once per event.
        engine.getState();

      if (state.build.placementDraft !== null) {
        if (matchesKeybind(event, keybinds.rotatePlacement) && !event.repeat) {
          event.preventDefault();
          engine.dispatch(engineActions.rotateBuildDraft());
          return;
        }
        if (matchesKeybind(event, keybinds.cancelAction)) {
          event.preventDefault();
          engine.dispatch(engineActions.clearPlacementDraft());
          return;
        }
        if (matchesKeybind(event, keybinds.confirmAction) || matchesKeybind(event, keybinds.interact)) {
          event.preventDefault();
          confirmPlacementRef.current();
          return;
        }
        if (matchesKeybind(event, keybinds.deleteItem)) {
          event.preventDefault();
          buildTrashRef.current();
          return;
        }
        return;
      }

      const buildMenuActive = isStorageOpenOnTablet && !state.player.pointerLocked;
      if (!buildMenuActive) {
        if (matchesKeybind(event, keybinds.interact)) {
          if (!event.repeat) {
            event.preventDefault();
            onHoldInteractRef.current?.(true);
            if (onPortalInteractRef.current?.()) {
              return;
            }
            const invoke = state.interaction.activePrompt?.prompt.invoke;
            if (invoke) {
              runPromptCommand(ctx, invoke);
            }
          }
          return;
        }
        return;
      }

      if (matchesKeybind(event, keybinds.cycleTabPrevious)) {
        event.preventDefault();
        engine.dispatch(engineActions.cycleBuildTab(-1));
        return;
      }
      if (matchesKeybind(event, keybinds.cycleTabNext)) {
        event.preventDefault();
        const invoke = state.interaction.activePrompt?.prompt.invoke;
        if (!invoke || !runPromptCommand(ctx, invoke)) {
          engine.dispatch(engineActions.cycleBuildTab(1));
        }
        return;
      }
      if (matchesKeybind(event, keybinds.cycleItemPrevious)) {
        event.preventDefault();
        engine.dispatch(engineActions.cycleBuildItem(-1, buildCountRef.current));
        return;
      }
      if (matchesKeybind(event, keybinds.cycleItemNext)) {
        event.preventDefault();
        engine.dispatch(engineActions.cycleBuildItem(1, buildCountRef.current));
        return;
      }
      if (matchesKeybind(event, keybinds.cancelAction)) {
        event.preventDefault();
        if (buildMenuActive) onToggleTabletRef.current(false);
        return;
      }
      if (matchesKeybind(event, keybinds.confirmAction)) {
        event.preventDefault();
        buildPrimaryRef.current();
        return;
      }
      if (matchesKeybind(event, keybinds.deleteItem)) {
        event.preventDefault();
        buildTrashRef.current();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (matchesKeybind(event, keybinds.interact)) {
        onHoldInteractRef.current?.(false);
      }
    };

    const handleMenuKeys = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector('[role="dialog"]') || (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, button, [contenteditable="true"], [data-chat-panel]'))) return;
      const opensTablet = matchesKeybind(event, keybinds.toggleTablet);
      const escapeOpensTablet = matchesKeybind(event, keybinds.cancelAction);
      if (!opensTablet && !escapeOpensTablet) return;
      if (event.repeat) return;

      const state =
        // llmville-allow-engine-getstate-in-hooks: DOM keydown handler reads latest build draft once per event.
        engine.getState();
      if (state.build.placementDraft !== null) return;

      if (escapeOpensTablet) {
        if (isMenuOpenRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        onToggleTabletRef.current(true);
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      suppressToggleKeyUpRef.current = true;

      if (isMenuOpenRef.current) {
        pendingToggleTabletRef.current = false;
        return;
      }

      if (document.pointerLockElement) {
        pendingToggleTabletRef.current = null;
        onToggleTabletRef.current(true);
        return;
      }

      pendingToggleTabletRef.current = true;
    };

    const handleMenuKeyUp = (event: KeyboardEvent) => {
      if (!matchesKeybind(event, keybinds.toggleTablet)) return;
      if (!suppressToggleKeyUpRef.current) return;
      suppressToggleKeyUpRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      const nextOpen = pendingToggleTabletRef.current;
      pendingToggleTabletRef.current = null;
      if (nextOpen === null) return;
      onToggleTabletRef.current(nextOpen);
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) return;
      pendingToggleTabletRef.current = null;
      suppressToggleKeyUpRef.current = false;
    };

    const handleMouseUp = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const state =
        // llmville-allow-engine-getstate-in-hooks: mouseup handler reads placement draft at click time.
        engine.getState();
      const clickedCanvas = event.target instanceof HTMLCanvasElement;
      if (state.build.placementDraft !== null && (document.pointerLockElement instanceof HTMLCanvasElement || clickedCanvas)) {
        confirmPlacementRef.current();
      }
    };

    const handleBlur = () => {
      onHoldInteractRef.current?.(false);
      pendingToggleTabletRef.current = null;
      suppressToggleKeyUpRef.current = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("keydown", handleMenuKeys, { capture: true });
    window.addEventListener("keyup", handleMenuKeyUp, { capture: true });
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("keydown", handleMenuKeys, { capture: true });
      window.removeEventListener("keyup", handleMenuKeyUp, { capture: true });
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [ctx, engine, isStorageOpenOnTablet, keybinds, onHoldInteract, onPortalInteract, onToggleTablet]);
}

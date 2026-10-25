import {
  INTERACTION_TARGET_TYPE,
  type InteractionHint,
  type InteractionHintResolver,
  type InteractionProximity,
  type InteractionSnapshot,
} from "@llmville/game/simulation/interaction";
import { formatBindableKeyLabel, getAppSettingsSnapshot } from "@/settings/settings";
import { getTutorialInteractionHint } from "@/tutorial/tabletTutorial";
import { resolveTutorialInputMode } from "@/tutorial/tutorialInput";

export const resolveInteractionHint: InteractionHintResolver = (
  snapshot: InteractionSnapshot,
  proximity: InteractionProximity,
): InteractionHint | null => {
  const keybinds = getAppSettingsSnapshot().keybinds;
  const inputMode = resolveTutorialInputMode(snapshot.touchControlsEnabled);
  const interactKey = formatBindableKeyLabel(keybinds.interact.primary);
  const rotateKey = formatBindableKeyLabel(keybinds.rotatePlacement.primary);
  const cancelKey = formatBindableKeyLabel(keybinds.cancelAction.primary);
  const tabletKey = snapshot.touchControlsEnabled ? "Tablet" : formatBindableKeyLabel(keybinds.toggleTablet.primary);
  const inPlay = snapshot.pointerLocked || snapshot.touchControlsEnabled;

  if (snapshot.placementDraftActive && inPlay) {
    if (snapshot.touchControlsEnabled) {
      return { key: "Place", action: "Tap Place on the right · use D-pad to walk into position" };
    }
    return { key: `${interactKey} / Click`, action: `Place · ${rotateKey} rotate · ${cancelKey} cancel` };
  }

  if (snapshot.tutorialStarted && !snapshot.tutorialCompleted) {
    const tutorialHint = getTutorialInteractionHint(
      { ...snapshot, inputMode },
      { targetType: proximity.target?.type ?? null },
    );
    if (tutorialHint !== null) return tutorialHint;
  }

  if (!snapshot.hasLab) return null;
  if (proximity.nearDeskRig && !snapshot.isTraining) {
    return { key: tabletKey, action: "Open tablet -> OpenModem -> Post-train" };
  }
  if (proximity.target?.type === INTERACTION_TARGET_TYPE.rack && inPlay) {
    return { key: interactKey, action: "Configure Rack" };
  }

  return null;
};

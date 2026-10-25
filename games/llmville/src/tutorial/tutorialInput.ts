export type TutorialInputMode = "touch" | "keyboard";

export const TUTORIAL_INPUT_MODE = {
  touch: "touch",
  keyboard: "keyboard",
} as const satisfies Record<string, TutorialInputMode>;

export function resolveTutorialInputMode(isTouch: boolean): TutorialInputMode {
  return isTouch ? TUTORIAL_INPUT_MODE.touch : TUTORIAL_INPUT_MODE.keyboard;
}

export function tutorialTabletOpenPhrase(mode: TutorialInputMode): string {
  return mode === TUTORIAL_INPUT_MODE.touch ? "Swipe up or tap the tablet at the bottom" : "Press Tab";
}

export function tutorialPlaceConfirmPhrase(mode: TutorialInputMode): string {
  return mode === TUTORIAL_INPUT_MODE.touch ? "tap Place, then walk to the spot and tap Place again" : "click Place Item, then walk and press Enter to place";
}

export function tutorialRackConfigurePhrase(mode: TutorialInputMode, installed: number): string {
  const action = mode === TUTORIAL_INPUT_MODE.touch ? "tap E" : "press E";
  return `Open your rack with ${action}, then choose a GPU from each empty slot's Install menu (${installed}/2).`;
}

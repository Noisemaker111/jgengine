import { expect, test } from "bun:test";

import { accessibilityDemoGame } from "./accessibilityDemo";
import { ambienceDemoGame } from "./ambienceDemo";
import { cameraShakeDemoGame } from "./cameraShakeDemo";
import { coachMarksDemoGame } from "./coachMarksDemo";
import { codexDemoGame } from "./codexDemo";
import { comboMeterDemoGame } from "./comboMeterDemo";
import { countdownTimerDemoGame } from "./countdownTimerDemo";
import { cutsceneDemoGame } from "./cutsceneDemo";
import { damageDirectionDemoGame } from "./damageDirectionDemo";
import { dayNightDemoGame } from "./dayNightDemo";
import { dialogueDemoGame } from "./dialogueDemo";
import { fastTravelDemoGame } from "./fastTravelDemo";
import { feelAudioDemoGame } from "./feelAudioDemo";
import { floatingTextDemoGame } from "./floatingTextDemo";
import { interactionPromptDemoGame } from "./interactionPromptDemo";
import { keyRebindingDemoGame } from "./keyRebindingDemo";
import { killFeedDemoGame } from "./killFeedDemo";
import { localizationDemoGame } from "./localizationDemo";
import { mapDemoGame } from "./mapDemo";
import { menuFrameworkDemoGame } from "./menuFrameworkDemo";
import { notificationDemoGame } from "./notificationDemo";
import { objectiveBannerDemoGame } from "./objectiveBannerDemo";
import { particleDemoGame } from "./particleDemo";
import { pauseMenuDemoGame } from "./pauseMenuDemo";
import { photoModeDemoGame } from "./photoModeDemo";
import { questDemoGame } from "./questDemo";
import { radialDemoGame } from "./radialDemo";
import { saveSlotsDemoGame } from "./saveSlotsDemo";
import { scoreboardDemoGame } from "./scoreboardDemo";
import { screenEffectsDemoGame } from "./screenEffectsDemo";
import { shopGridDemoGame } from "./shopGridDemo";
import { statusEffectDemoGame } from "./statusEffectDemo";
import { talentTreeDemoGame } from "./talentTreeDemo";
import { uiFeedbackDemoGame } from "./uiFeedbackDemo";
import { waveDirectorDemoGame } from "./waveDirectorDemo";
import { waypointMarkersDemoGame } from "./waypointMarkersDemo";
import { worldPingDemoGame } from "./worldPingDemo";

// These demos moved to the one grass rule set and the one <Sky>; each must still build its game.
const DEMOS = {
  accessibilityDemoGame,
  ambienceDemoGame,
  cameraShakeDemoGame,
  coachMarksDemoGame,
  codexDemoGame,
  comboMeterDemoGame,
  countdownTimerDemoGame,
  cutsceneDemoGame,
  damageDirectionDemoGame,
  dayNightDemoGame,
  dialogueDemoGame,
  fastTravelDemoGame,
  feelAudioDemoGame,
  floatingTextDemoGame,
  interactionPromptDemoGame,
  keyRebindingDemoGame,
  killFeedDemoGame,
  localizationDemoGame,
  mapDemoGame,
  menuFrameworkDemoGame,
  notificationDemoGame,
  objectiveBannerDemoGame,
  particleDemoGame,
  pauseMenuDemoGame,
  photoModeDemoGame,
  questDemoGame,
  radialDemoGame,
  saveSlotsDemoGame,
  scoreboardDemoGame,
  screenEffectsDemoGame,
  shopGridDemoGame,
  statusEffectDemoGame,
  talentTreeDemoGame,
  uiFeedbackDemoGame,
  waveDirectorDemoGame,
  waypointMarkersDemoGame,
  worldPingDemoGame,
};

test("every migrated demo still defines its game", () => {
  for (const [name, game] of Object.entries(DEMOS)) {
    expect(game, name).toBeDefined();
    expect(typeof game, name).toBe("object");
  }
});

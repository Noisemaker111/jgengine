import { useState } from "react";
import { actionLabel } from "@jgengine/core/input/actionBindings";
import { keybinds } from "../keybinds";
import { closePanels } from "./uiController";
import { useOpenPanel } from "./hooks/useUiState";
import { AbilitiesModal } from "./components/AbilitiesModal";
import { BackpackModal } from "./components/BackpackModal";
import { CaptureMeter } from "./components/CaptureMeter";
import { CharacterSheetModal } from "./components/CharacterSheetModal";
import { CombatLogPanel } from "./components/CombatLogPanel";
import { DialogueModal } from "./components/DialogueModal";
import { FishingBar } from "./components/FishingBar";
import { FloatingCombatText } from "./components/FloatingCombatText";
import { GoldDisplay } from "./components/GoldDisplay";
import { Hotbar } from "./components/Hotbar";
import { KeybindBadge } from "./components/KeybindBadge";
import { PlayerFrame } from "./components/PlayerFrame";
import { QuestTracker } from "./components/QuestTracker";
import { TargetFrame } from "./components/TargetFrame";

export function GameUI() {
  const openPanel = useOpenPanel();
  const [combatText, setCombatText] = useState<string | null>(null);

  return (
    <div className="pointer-events-none absolute inset-0 z-20 grid h-full w-full grid-cols-[minmax(0,20rem)_1fr_minmax(0,20rem)] grid-rows-[auto_auto_1fr_auto] gap-3 p-4 font-sans text-stone-100">
      <div className="col-start-1 row-start-1 justify-self-start">
        <PlayerFrame />
      </div>
      <div className="col-start-1 row-start-2 flex flex-col items-start gap-2 justify-self-start">
        <TargetFrame />
        <CaptureMeter />
      </div>
      <div className="col-start-3 row-start-1 flex flex-col items-end gap-1 justify-self-end">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-stone-400">
          <span>Backpack</span>
          <KeybindBadge label={actionLabel(keybinds, "openBackpack") ?? "—"} />
          <span className="mx-1 text-stone-600">·</span>
          <span>Character</span>
          <KeybindBadge label={actionLabel(keybinds, "openCharacter") ?? "—"} />
          <span className="mx-1 text-stone-600">·</span>
          <span>Abilities</span>
          <KeybindBadge label={actionLabel(keybinds, "openAbilities") ?? "—"} />
        </div>
        <QuestTracker />
      </div>
      <div className="col-start-2 row-start-3 flex flex-col items-center justify-end gap-3 self-end pb-8">
        <FishingBar />
        <FloatingCombatText message={combatText} />
      </div>
      <div className="col-start-2 row-start-4 flex flex-col items-center gap-1 justify-self-center self-end">
        <Hotbar onStatus={setCombatText} />
        <GoldDisplay />
      </div>
      <div className="col-start-1 row-start-4 justify-self-start self-end">
        <CombatLogPanel />
      </div>
      {openPanel === "backpack" ? <BackpackModal onClose={closePanels} /> : null}
      {openPanel === "character" ? <CharacterSheetModal onClose={closePanels} /> : null}
      {openPanel === "abilities" ? <AbilitiesModal onClose={closePanels} /> : null}
      {openPanel === "dialogue" ? <DialogueModal /> : null}
    </div>
  );
}
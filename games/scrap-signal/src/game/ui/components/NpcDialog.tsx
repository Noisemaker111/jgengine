import { useEffect } from "react";
import { HudButton } from "@jgengine/core/hud/hudButton.view";
import { useGame } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { NPCS, objectiveLabel, scrapQuestById } from "../../quests/catalog";
import { npcDialogStore } from "../../quests/givers";
import { FERRALON } from "../../palette";
import { ScrapPanel } from "./ScrapPanel";

/** A conversation with a quest giver: what they say, and the quest they are offering with its pay. */
export function NpcDialog() {
  const { commands } = useGame();
  const dialog = useStore(npcDialogStore);
  const open = dialog !== null;
  useEffect(() => {
    if (open && typeof document !== "undefined" && document.exitPointerLock !== undefined) document.exitPointerLock();
  }, [open]);
  if (dialog === null) return null;
  const quest = dialog.questId === null ? undefined : scrapQuestById(dialog.questId);
  const close = () => commands.run("npc.close", {});
  return (
    <ScrapPanel title={NPCS[dialog.npc].name} closeLabel="Close [Esc]" onClose={close}>
      <p className="text-sm font-semibold leading-relaxed text-stone-200">{quest?.brief ?? dialog.line}</p>
      {quest !== undefined ? (
        <div className="mt-3 flex flex-col gap-1.5">
          <span className="text-xs font-black uppercase tracking-widest" style={{ color: FERRALON.hudXp }}>
            {quest.main ? "Story" : "Side"} mission · {quest.title}
          </span>
          {quest.objectives.map((objective) => (
            <span key={objective.id} className="text-[12px] text-stone-300">▸ {objectiveLabel(objective)}</span>
          ))}
          <span className="text-[12px] text-stone-400">
            Reward: {quest.reward.xp} XP{quest.reward.cash === undefined ? "" : ` · $${quest.reward.cash}`}
          </span>
          <HudButton block onClick={() => commands.run("quest.acceptOffer", {})} className="scrap-row scrap-row-amber">
            <span className="text-sm font-bold uppercase tracking-wider text-stone-100">Accept [E]</span>
          </HudButton>
        </div>
      ) : null}
    </ScrapPanel>
  );
}

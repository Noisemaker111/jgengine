import { DialogueBox, type DialogueChoice, type DialogueDef } from "@jgengine/react/components";
import { useGame, useGameStore, usePlayer } from "@jgengine/react/hooks";

import { NPCS } from "../../entities/npcs/catalog";
import { DIALOGUES } from "../../entities/npcs/dialogues";
import { CLOSE_BUTTON, PANEL, PANEL_TITLE } from "../theme";

function questArgs(choice: DialogueChoice): { command: string; questId: string } | null {
  if (choice.invoke === null) return null;
  const args = choice.invoke.args as { questId?: string } | undefined;
  if (args?.questId === undefined) return null;
  return { command: choice.invoke.command, questId: args.questId };
}

export function DialoguePanel() {
  const { commands } = useGame();
  const { userId } = usePlayer();
  const npcId = useGameStore((ctx) => ctx.game.store.get(`dialogue:${userId}`)) as string | undefined;
  const filtered = useGameStore((ctx): DialogueDef | null => {
    if (npcId === undefined) return null;
    const npc = NPCS.find((entry) => entry.id === npcId);
    const dialogue = DIALOGUES.find((entry) => entry.id === npc?.dialogueId);
    if (npc === undefined || dialogue === undefined) return null;
    return {
      id: dialogue.id,
      lines: dialogue.lines
        .map((line) => {
          if (!("choices" in line)) return line;
          const choices = line.choices.filter((choice) => {
            const quest = questArgs(choice);
            if (quest === null) return true;
            if (quest.command === "quest.accept") return ctx.game.quest!.canAccept(userId, quest.questId) === null;
            if (quest.command === "quest.turnIn") return ctx.game.quest!.canTurnIn(userId, quest.questId) === null;
            return true;
          });
          return { choices };
        })
        .filter((line) => !("choices" in line) || line.choices.length > 0),
    };
  });
  if (npcId === undefined || filtered === null) return null;
  const npc = NPCS.find((entry) => entry.id === npcId);
  return (
    <div className={`${PANEL} pointer-events-auto w-96`}>
      <div className={PANEL_TITLE}>
        <span>{npc?.name ?? npcId}</span>
        <button type="button" className={CLOSE_BUTTON} onClick={() => commands.run("dialogue.close", {})}>
          ✕
        </button>
      </div>
      <DialogueBox
        dialogue={filtered}
        className="space-y-2 px-4 py-3"
        lineClassName="text-sm leading-snug text-stone-200 [&>span:first-child]:mr-1.5 [&>span:first-child]:font-semibold [&>span:first-child]:text-amber-300"
        choicesClassName="flex flex-col gap-1 pt-1"
        choiceClassName="rounded border border-stone-700 bg-stone-900/80 px-3 py-1.5 text-left text-sm text-amber-100 hover:border-amber-500 hover:bg-stone-800"
        onChoice={(choice) => {
          if (choice.invoke === null) {
            commands.run("dialogue.close", {});
            return;
          }
          commands.run(choice.invoke.command, choice.invoke.args ?? {});
        }}
      />
    </div>
  );
}

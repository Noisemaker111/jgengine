import { DialogueBox, resolveDialogueInvoke } from "@jgengine/react/components";
import { useGame } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { DIALOGUES } from "../../entities/npcs/dialogues";
import { dialogueStore } from "../../commands";

export function DialoguePanel() {
  const { commands } = useGame();
  const dialogueId = useStore(dialogueStore, (v) => v ?? null);
  if (dialogueId === null) return null;
  const dialogue = DIALOGUES[dialogueId];
  if (dialogue === undefined) return null;
  return (
    <div className="pointer-events-auto w-[28rem] max-w-[90vw]">
      <DialogueBox
        dialogue={dialogue}
        onChoice={(choice, result) => {
          const invoke = resolveDialogueInvoke(choice, result);
          if (invoke !== null && invoke !== undefined) commands.run(invoke.command, invoke.args ?? {});
          else commands.run("dialogue.close", {});
        }}
        className="border-2 border-black bg-[#f4e8c8] p-4 text-[#1b1e26] shadow-[6px_6px_0_#000]"
        speakerClassName="text-xs font-black uppercase tracking-widest text-[#c23b3b]"
        lineClassName="text-sm font-semibold"
        choicesClassName="mt-2 flex gap-2"
        choiceClassName="pointer-events-auto -skew-x-6 border-2 border-black bg-[#ffb020] px-3 py-1 text-xs font-black uppercase hover:bg-[#ffc95e]"
      />
    </div>
  );
}

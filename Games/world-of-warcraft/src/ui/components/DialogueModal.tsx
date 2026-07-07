import { DialogueBox, resolveDialogueInvoke } from "@jgengine/react/components";
import { useGame } from "@jgengine/react/hooks";
import { dialogues } from "../../entities/npcs/dialogues";
import { closePanels, getOpenDialogueId } from "../uiController";
import { ModalBackdrop } from "./ModalBackdrop";

export function DialogueModal() {
  const { commands } = useGame();
  const dialogueId = getOpenDialogueId();
  const dialogue = dialogues.find((entry) => entry.id === dialogueId);
  if (dialogue === undefined) return null;

  return (
    <ModalBackdrop title="Marshal Redpath" onClose={closePanels} widthClassName="w-[36rem]">
      <DialogueBox
        dialogue={dialogue}
        className="flex flex-col gap-3"
        lineClassName="text-sm leading-relaxed text-stone-200"
        speakerClassName="mr-2 font-bold text-amber-200"
        choicesClassName="flex flex-col gap-2 border-t border-amber-800/40 pt-3"
        choiceClassName="pointer-events-auto flex flex-col items-start rounded border border-stone-700 bg-stone-900/80 px-3 py-2 text-left text-sm text-stone-100 transition hover:border-amber-400 hover:bg-stone-800"
        checkClassName="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-sky-300"
        onChoice={(choice, result) => {
          const invoke = resolveDialogueInvoke(choice, result);
          if (invoke !== null) commands.run(invoke.command, invoke.args);
          closePanels();
        }}
      />
    </ModalBackdrop>
  );
}

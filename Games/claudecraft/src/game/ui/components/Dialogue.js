import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { DialogueBox } from "@jgengine/react/components";
import { useGame, useGameStore, usePlayer } from "@jgengine/react/hooks";
import { useKeyedStore } from "@jgengine/react/store";
import { NPCS } from "../../entities/npcs/catalog";
import { DIALOGUES } from "../../entities/npcs/dialogues";
import { dialogueStore } from "../../session/stores";
import { CLOSE_BUTTON, PANEL, PANEL_TITLE } from "../theme";
function questArgs(choice) {
    if (choice.invoke === null)
        return null;
    const args = choice.invoke.args;
    if (args?.questId === undefined)
        return null;
    return { command: choice.invoke.command, questId: args.questId };
}
export function DialoguePanel() {
    const { commands } = useGame();
    const { userId } = usePlayer();
    const npcId = useKeyedStore(dialogueStore, userId);
    const filtered = useGameStore((ctx) => {
        if (npcId === null)
            return null;
        const npc = NPCS.find((entry) => entry.id === npcId);
        const dialogue = DIALOGUES.find((entry) => entry.id === npc?.dialogueId);
        if (npc === undefined || dialogue === undefined)
            return null;
        return {
            id: dialogue.id,
            lines: dialogue.lines
                .map((line) => {
                if (!("choices" in line))
                    return line;
                const choices = line.choices.filter((choice) => {
                    const quest = questArgs(choice);
                    if (quest === null)
                        return true;
                    if (quest.command === "quest.accept")
                        return ctx.game.quest.canAccept(userId, quest.questId) === null;
                    if (quest.command === "quest.turnIn")
                        return ctx.game.quest.canTurnIn(userId, quest.questId) === null;
                    return true;
                });
                return { choices };
            })
                .filter((line) => !("choices" in line) || line.choices.length > 0),
        };
    });
    if (npcId === null || filtered === null)
        return null;
    const npc = NPCS.find((entry) => entry.id === npcId);
    return (_jsxs("div", { className: `${PANEL} pointer-events-auto w-96`, children: [_jsxs("div", { className: PANEL_TITLE, children: [_jsx("span", { children: npc?.name ?? npcId }), _jsx("button", { type: "button", className: CLOSE_BUTTON, onClick: () => commands.run("dialogue.close", {}), children: "\u2715" })] }), _jsx(DialogueBox, { dialogue: filtered, className: "space-y-2 px-4 py-3", lineClassName: "text-sm leading-snug text-stone-200 [&>span:first-child]:mr-1.5 [&>span:first-child]:font-semibold [&>span:first-child]:text-amber-300", choicesClassName: "flex flex-col gap-1 pt-1", choiceClassName: "rounded border border-stone-700 bg-stone-900/80 px-3 py-1.5 text-left text-sm text-amber-100 hover:border-amber-500 hover:bg-stone-800", onChoice: (choice) => {
                    if (choice.invoke === null) {
                        commands.run("dialogue.close", {});
                        return;
                    }
                    commands.run(choice.invoke.command, choice.invoke.args ?? {});
                } })] }));
}

import type { DialogueDef } from "@jgengine/react/components";

export const marshal_town: DialogueDef = {
  id: "marshal_town",
  lines: [
    { speaker: "Marshal Redpath", text: "Hero, kobolds crawl through the forest north of town. Drive them out." },
    {
      choices: [
        {
          label: "Accept: Kobold Camp Cleanup",
          invoke: { command: "quest.accept", args: { questId: "quest_kobold_cleanup" } },
        },
        {
          label: "Turn in: Kobold Camp Cleanup",
          invoke: { command: "quest.turnIn", args: { questId: "quest_kobold_cleanup" } },
        },
        {
          label: "Turn in: The Taskmaster",
          invoke: { command: "quest.turnIn", args: { questId: "quest_kobold_elite" } },
        },
        {
          label: "Persuade him to raise the bounty (Persuasion)",
          invoke: null,
          check: { label: "Persuasion", modifier: 3, dc: 14 },
          onSuccess: { command: "npc.marshal.persuadeSuccess" },
          onFailure: { command: "npc.marshal.persuadeFailure" },
        },
        { label: "Leave", invoke: null },
      ],
    },
  ],
};

export const dialogues: DialogueDef[] = [marshal_town];

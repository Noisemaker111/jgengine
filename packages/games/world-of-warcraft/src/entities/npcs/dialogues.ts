export interface DialogueChoiceDef {
  label: string;
  invoke: { command: string; args?: unknown } | null;
}

export type DialogueLineDef =
  | { speaker: string; text: string }
  | { choices: DialogueChoiceDef[] };

export interface NpcDialogueDef {
  id: string;
  lines: DialogueLineDef[];
}

export const marshal_town: NpcDialogueDef = {
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
        { label: "Leave", invoke: null },
      ],
    },
  ],
};

export const dialogues: NpcDialogueDef[] = [marshal_town];

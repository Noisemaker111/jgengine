import type { DialogueDef } from "@jgengine/react/components";

export const DIALOGUES: Record<string, DialogueDef> = {
  dlg_marco: {
    id: "dlg_marco",
    lines: [
      { speaker: "Marco", text: "There you are. This town runs on two things: sunshine and dirty cash." },
      { speaker: "Marco", text: "The Carmine crew took my docks. Sweep them out and the money's yours." },
      {
        choices: [
          { label: "I'm on it.", invoke: { command: "dialogue.close", args: {} } },
          { label: "Not yet.", invoke: null },
        ],
      },
    ],
  },
};

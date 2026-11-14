import { mergeCredits } from "@jgengine/core/menu/credits";
import { lookCredits } from "../art/look";

/** Crumb Run ships original procedural geometry, canvas-painted surfaces and synthesized cues; the engine supplies the rest. */
export const CRUMB_RUN_CREDITS = mergeCredits({
  title: "CRUMB RUN",
  sections: [
    {
      heading: "Original Crumb Run artwork",
      entries: [{ label: "Crumb Run", detail: "Original giant-house rooms, the burrow, the Littles' finds, the Cat, the Roomba, the Kid, the Dog and the spider, canvas-painted surfaces and synthesized sound cues." }],
    },
    ...lookCredits(),
    {
      heading: "Technology",
      entries: [
        { label: "JGengine", detail: "Apache-2.0", href: "https://jgengine.com" },
        { label: "Rune", detail: "MIT" },
        { label: "Three.js", detail: "MIT" },
      ],
    },
  ],
  notice: "The burrow keeps its records in this browser. Nothing leaves this device.",
});

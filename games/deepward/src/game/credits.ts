import { mergeCredits } from "@jgengine/core/menu/credits";
import { lookCredits } from "../art/look";

/** Deepward ships original procedural geometry and synthesized cues; the engine supplies the rest. */
export const DEEPWARD_CREDITS = mergeCredits({
  title: "DEEPWARD",
  sections: [
    {
      heading: "Original Deepward artwork",
      entries: [
        {
          label: "Deepward",
          detail: "Original vault geometry, machinery, Fitter rig, signage, item art and synthesized mechanical sound cues.",
        },
      ],
    },
    {
      heading: "Surfaces",
      entries: [{ label: "ambientCG", detail: "CC0 PBR scans: PaintedMetal006, DiamondPlate005A, MetalPlates001, Rust007, Concrete025, Terrazzo005", href: "https://ambientcg.com" }],
    },
    ...lookCredits(),
    {
      heading: "Technology",
      entries: [
        { label: "JGengine", detail: "Apache-2.0", href: "https://jgengine.com" },
        { label: "React", detail: "MIT" },
        { label: "Three.js", detail: "MIT" },
      ],
    },
  ],
  notice: "Marrow keeps one record per browser profile. Nothing leaves this device.",
});

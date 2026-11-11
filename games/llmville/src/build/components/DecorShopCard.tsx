/** @jsxImportSource @jgengine/core/ui/jsx */
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";
import type { PlaceableBuildItemId } from "@llmville/game/build/catalog";
import { getWorldModelAsset } from "@llmville/game/world/worldModelCatalog";

import { C } from "../../ui/kit";

type DecorKind = "plant" | "seating" | "utility" | "workspace" | "neon" | "display";

/** Which family a decor item belongs to, for its tile colour. */
export function decorKind(itemId: PlaceableBuildItemId): DecorKind {
  if (itemId.includes("plant") || itemId.includes("tree") || itemId === "cable_tidy_bin") return "plant";
  if (itemId.includes("chair") || itemId.includes("beanbag") || itemId.includes("rug") || itemId.includes("yoga") || itemId === "server_plushie") return "seating";
  if (itemId.includes("coffee") || itemId.includes("fridge") || itemId.includes("drink") || itemId.includes("table")) return "utility";
  if (itemId.includes("board") || itemId.includes("shelf") || itemId.includes("monitor")) return "workspace";
  if (itemId.includes("neon") || itemId.includes("banner") || itemId.includes("clock")) return "neon";
  return "display";
}

const TILE: Record<DecorKind, [string, string]> = {
  plant: ["#2f6b4f", "#7bd389"],
  seating: ["#6b3f5a", "#f0a3c8"],
  utility: ["#5a4a2f", C.amber],
  workspace: ["#2f4a6b", "#8ec5ff"],
  neon: ["#4b2f6b", "#d79bff"],
  display: ["#3a4a48", C.teal],
};

/** A decor listing's tile: its family's colour, with a ring when it has a 3D model. */
export function DecorThumb({ itemId }: { itemId: PlaceableBuildItemId }) {
  const [base, light] = TILE[decorKind(itemId)];
  const modeled = getWorldModelAsset(itemId)?.modelPath != null;
  return <RuneView width={56} height={56} radius={10} fill={base}
    radial={{ center: [0.35, 0.3], radius: [0.8, 0.8], stops: [[0, `${light}aa`], [1, `${light}00`]] }}
    border={{ width: modeled ? 2 : 1, color: modeled ? light : "#ffffff22" }} />;
}

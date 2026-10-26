import type { ReactNode } from "react";

import { itemDef, itemLabel } from "../data/items";

/** Our own item tiles: a colour per kind and the item's initials (ARK's painted icons are theirs). */
const KIND_COLOR: Record<string, string> = {
  resource: "#8a6a3c",
  consumable: "#a33b4a",
  tool: "#5f6f7f",
  structure: "#a07a2c",
  armor: "#4f7a52",
  saddle: "#6f4a2f",
  ammo: "#555",
};

const RESOURCE_COLOR: Record<string, string> = {
  thatch: "#b49a4c",
  wood: "#7a5230",
  stone: "#8d8d88",
  flint: "#5d6670",
  fiber: "#7fa24a",
  hide: "#9b6e4e",
  mejoberry: "#5a4bb0",
  amarberry: "#c0392b",
  azulberry: "#2e6fd0",
  tintoberry: "#d4b21e",
  narcoberry: "#3b2b55",
  stimberry: "#9b2fae",
};

function initials(label: string): string {
  const words = label.split(" ");
  return words.length === 1 ? label.slice(0, 2) : words.map((word) => word[0]).join("").slice(0, 3);
}

export function ItemIcon({ itemId }: { itemId: string }): ReactNode {
  const def = itemDef(itemId);
  const color = RESOURCE_COLOR[itemId] ?? KIND_COLOR[def?.kind ?? "resource"] ?? "#666";
  return (
    <div
      title={itemLabel(itemId)}
      style={{
        width: "100%",
        height: "100%",
        display: "grid",
        placeItems: "center",
        borderRadius: 6,
        background: `radial-gradient(circle at 35% 30%, ${color}ee, ${color}88 70%)`,
        color: "#f4efe2",
        fontWeight: 800,
        fontSize: 13,
        letterSpacing: "0.02em",
        textShadow: "0 1px 2px #000a",
      }}
    >
      {initials(itemLabel(itemId))}
    </div>
  );
}

export const itemIcon = (itemId: string): ReactNode => <ItemIcon itemId={itemId} />;

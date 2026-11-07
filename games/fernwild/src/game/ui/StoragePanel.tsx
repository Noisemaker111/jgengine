import type { CSSProperties, ReactNode } from "react";
import { useGame, useGameStore } from "@jgengine/react/hooks";

import { storeView } from "../base";
import { itemLabel } from "../data/items";
import { ItemIcon } from "./ItemIcon";

const same = <T,>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);

const PANEL: CSSProperties = {
  background: "linear-gradient(180deg, #1d2a2fee, #121a1ef2)",
  border: "1px solid #6fb7c955",
  borderRadius: 6,
  padding: 12,
  color: "#e8f1f2",
  boxShadow: "0 8px 30px #000a",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  width: 340,
};
const HEADING: CSSProperties = { fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8fd3e2", fontWeight: 800 };
const BUTTON: CSSProperties = { background: "#1f3a40", color: "#e8f1f2", border: "1px solid #6fb7c966", borderRadius: 4, padding: "3px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" };

/** ARK's remote inventory for a storage container: what it holds, slots used of its total. Take puts a stack back in your bag. */
export function StoragePanel(): ReactNode {
  const game = useGame();
  const store = useGameStore(storeView, same);
  if (store === null) return null;
  const used = store.slots.filter((slot) => slot !== null).length;
  return (
    <div data-storage-panel={store.id} style={PANEL}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={HEADING}>{store.label}</span>
        <span style={{ fontSize: 12, opacity: 0.85, fontVariantNumeric: "tabular-nums" }}>
          {used} / {store.slots.length} slots
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: "52vh", overflowY: "auto" }}>
        {used === 0 ? <span style={{ fontSize: 12, opacity: 0.7 }}>Empty. Double-click your items to store them.</span> : null}
        {store.slots.map((slot, index) =>
          slot === null ? null : (
            <div key={index} data-storage-item={slot.itemId} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <div style={{ width: 28, height: 28 }}>
                <ItemIcon itemId={slot.itemId} />
              </div>
              <span style={{ flex: 1 }}>
                {itemLabel(slot.itemId)} × {slot.count}
              </span>
              <button style={BUTTON} onClick={() => void game.commands.run("storeTake", { slot: index })}>
                Take
              </button>
            </div>
          ),
        )}
      </div>
      <button style={{ ...BUTTON, alignSelf: "flex-end" }} onClick={() => void game.commands.run("closeStore", {})}>
        Close
      </button>
    </div>
  );
}

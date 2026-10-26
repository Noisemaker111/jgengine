import type { CSSProperties, ReactNode } from "react";
import { useGame, useGameStore } from "@jgengine/react/hooks";

import { creaturesView, type CreatureCard } from "../creatures";
import { itemLabel } from "../data/items";
import { ItemIcon } from "./ItemIcon";

const same = <T,>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);

/** The creature being looked at, inspected, and ridden, as the HUD and screens read them. */
export function useCreatures() {
  return useGameStore(creaturesView, same);
}

const NARCOTIC = new Set(["narcoberry", "narcotic", "stimberry", "stimulant"]);

export function Meter({ label, value, max, color, testId }: { label: string; value: number; max: number; color: string; testId?: string }): ReactNode {
  const fill = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div data-meter={testId} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.9 }}>
        <span>{label}</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {Math.floor(value)} / {Math.round(max)}
        </span>
      </div>
      <div style={{ height: 7, background: "#0009", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${fill * 100}%`, height: "100%", background: color }} />
      </div>
    </div>
  );
}

/** ARK's look-at readout over a creature: name and level, health, and while it is down its torpor and taming. */
export function CreatureReadout({ card }: { card: CreatureCard }): ReactNode {
  const taming = card.taming;
  return (
    <div data-creature-card={card.id} style={{ display: "flex", flexDirection: "column", gap: 4, width: 220 }}>
      <div style={{ fontWeight: 800, fontSize: 14 }}>
        {card.label} · Lvl {card.level}
        {card.dead ? " · Dead" : card.tamed ? " · Tamed" : taming?.unconscious === true ? " · Unconscious" : ""}
      </div>
      {card.dead ? null : <Meter label="Health" value={card.health.value} max={card.health.max} color="#d8483f" />}
      {taming !== null && (taming.unconscious || taming.torpor > 0) ? <Meter label="Torpor" value={taming.torpor} max={taming.maxTorpor} color="#a45fd6" testId="torpor" /> : null}
      {taming !== null && taming.unconscious ? (
        <>
          <Meter label="Taming" value={Math.round(taming.progress * 100)} max={100} color="#7ad06a" testId="taming" />
          <span style={{ fontSize: 11, opacity: 0.85 }}>Taming effectiveness {Math.round(taming.effectiveness * 100)}%</span>
        </>
      ) : null}
    </div>
  );
}

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
  width: 380,
};
const HEADING: CSSProperties = { fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8fd3e2", fontWeight: 800 };
const BUTTON: CSSProperties = { background: "#1f3a40", color: "#e8f1f2", border: "1px solid #6fb7c966", borderRadius: 4, padding: "3px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" };

/** ARK's remote inventory: the creature's own items, taming state, saddle and orders. Click an item to take it back. */
export function CreaturePanel(): ReactNode {
  const game = useGame();
  const { viewing: card } = useCreatures();
  if (card === null) return null;
  const taming = card.taming;
  return (
    <div data-creature-panel={card.id} style={PANEL}>
      <span style={HEADING}>{card.label} inventory</span>
      <CreatureReadout card={card} />
      {taming !== null ? (
        <div data-taming-food="" style={{ fontSize: 12, opacity: 0.9 }}>
          {taming.eating === null
            ? `Hungry — give it ${taming.foods.map(itemLabel).join(", ")}.`
            : `Eats ${itemLabel(taming.eating)} in ${taming.nextMeal}s.`}
          <div style={{ opacity: 0.75, marginTop: 2 }}>Keep its torpor up with Narcoberries or Narcotics: put them in, then Feed.</div>
        </div>
      ) : null}
      {card.saddle !== null && card.tamed ? (
        <div data-saddle={card.saddled ? "on" : "off"} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
          <span style={{ flex: 1 }}>Saddle: {card.saddled ? itemLabel(card.saddle) : `none — needs a ${itemLabel(card.saddle)}`}</span>
          {card.saddled ? (
            <button style={BUTTON} onClick={() => void game.commands.run("unsaddle", {})}>
              Remove
            </button>
          ) : null}
        </div>
      ) : null}
      {card.tamed ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
          <span style={{ flex: 1 }}>{card.order === "follow" ? "Following you" : "Staying put"}</span>
          <button style={BUTTON} onClick={() => void game.commands.run("whistleFollow", {})}>
            Follow (T)
          </button>
          <button style={BUTTON} onClick={() => void game.commands.run("whistleStay", {})}>
            Stay (U)
          </button>
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: "34vh", overflowY: "auto" }}>
        {card.inventory.every((slot) => slot === null) ? <span style={{ fontSize: 12, opacity: 0.7 }}>Empty. Double-click your items to give them.</span> : null}
        {card.inventory.map((slot, index) =>
          slot === null ? null : (
            <div key={index} data-creature-item={slot.itemId} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <div style={{ width: 28, height: 28 }}>
                <ItemIcon itemId={slot.itemId} />
              </div>
              <span style={{ flex: 1 }}>
                {itemLabel(slot.itemId)} × {slot.count}
              </span>
              {NARCOTIC.has(slot.itemId) && taming !== null ? (
                <button style={BUTTON} onClick={() => void game.commands.run("feedNarcotic", { itemId: slot.itemId })}>
                  Feed
                </button>
              ) : null}
              <button style={BUTTON} onClick={() => void game.commands.run("takeCreature", { slot: index })}>
                Take
              </button>
            </div>
          ),
        )}
      </div>
      <button style={{ ...BUTTON, alignSelf: "flex-end" }} onClick={() => void game.commands.run("closeCreature", {})}>
        Close
      </button>
    </div>
  );
}

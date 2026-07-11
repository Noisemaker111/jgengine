import { SUITS } from "../../freecell/cards";
import { freecellStore, type FreeCellSnapshot } from "../../freecell/store";
import { CARD_VARS, feltPanel } from "../theme";
import { CardFace, EmptySlot } from "./CardFace";

function isSelectedCascade(snapshot: FreeCellSnapshot, col: number, row: number): boolean {
  const sel = snapshot.selection;
  if (sel === null || sel.zone !== "cascade" || sel.index !== col) return false;
  return row >= snapshot.cascades[col]!.length - sel.count;
}

function FreeCell({ snapshot, index }: { snapshot: FreeCellSnapshot; index: number }) {
  const card = snapshot.free[index] ?? null;
  const selected = snapshot.selection?.zone === "free" && snapshot.selection.index === index;
  return (
    <button
      type="button"
      className="pointer-events-auto"
      aria-label={`free cell ${index + 1}`}
      onClick={() => freecellStore.onClick({ t: "freeCell", index })}
      onDoubleClick={() => freecellStore.smartMove({ t: "freeCell", index })}
    >
      {card !== null ? <CardFace card={card} selected={selected} /> : <EmptySlot label="cell" />}
    </button>
  );
}

function Foundation({ snapshot, index }: { snapshot: FreeCellSnapshot; index: number }) {
  const pile = snapshot.foundations[index]!;
  const top = pile[pile.length - 1] ?? null;
  return (
    <button
      type="button"
      className="pointer-events-auto"
      aria-label={`${SUITS[index]} foundation`}
      onClick={() => freecellStore.onClick({ t: "foundation", index })}
    >
      {top !== null ? <CardFace card={top} /> : <EmptySlot suit={SUITS[index]} />}
    </button>
  );
}

function Cascade({ snapshot, col }: { snapshot: FreeCellSnapshot; col: number }) {
  const cards = snapshot.cascades[col]!;
  if (cards.length === 0) {
    return (
      <button
        type="button"
        className="pointer-events-auto"
        style={{ height: "var(--card-h)", width: "var(--card-w)" }}
        aria-label={`column ${col + 1}`}
        onClick={() => freecellStore.onClick({ t: "cascadeEmpty", col })}
      >
        <EmptySlot />
      </button>
    );
  }
  const height =
    cards.length <= 1 ? "var(--card-h)" : `calc(var(--card-h) + ${cards.length - 1} * var(--fan))`;
  return (
    <div className="relative" style={{ height, width: "var(--card-w)" }}>
      {cards.map((card, row) => (
        <button
          key={card.id}
          type="button"
          className="pointer-events-auto absolute left-0 block"
          style={{ top: `calc(${row} * var(--fan))`, zIndex: row + 1 }}
          aria-label={`column ${col + 1} card ${row + 1}`}
          onClick={() => freecellStore.onClick({ t: "cascadeCard", col, row })}
          onDoubleClick={() => freecellStore.smartMove({ t: "cascadeCard", col, row })}
        >
          <CardFace card={card} selected={isSelectedCascade(snapshot, col, row)} />
        </button>
      ))}
    </div>
  );
}

export function Board({ snapshot }: { snapshot: FreeCellSnapshot }) {
  return (
    <div className={feltPanel} style={CARD_VARS}>
      <div className="mb-[calc(var(--card-w)*0.5)] flex items-start justify-between gap-[calc(var(--card-w)*0.4)]">
        <div className="flex gap-[calc(var(--card-w)*0.18)]">
          {[0, 1, 2, 3].map((i) => (
            <FreeCell key={i} snapshot={snapshot} index={i} />
          ))}
        </div>
        <div className="flex gap-[calc(var(--card-w)*0.18)]">
          {[0, 1, 2, 3].map((i) => (
            <Foundation key={i} snapshot={snapshot} index={i} />
          ))}
        </div>
      </div>
      <div className="flex items-start justify-center gap-[calc(var(--card-w)*0.18)]">
        {snapshot.cascades.map((_, col) => (
          <Cascade key={col} snapshot={snapshot} col={col} />
        ))}
      </div>
    </div>
  );
}

import {
  LOWER_CATEGORIES,
  UPPER_CATEGORIES,
  type Category,
} from "../../score/categories";
import { grandTotal, upperBonus } from "../../score/sheet";
import type { YachtState } from "../../state/game";
import { C, SANS, SERIF, pill, type Run } from "../theme";

const LABELS: Readonly<Record<Category, string>> = {
  ones: "Ones",
  twos: "Twos",
  threes: "Threes",
  fours: "Fours",
  fives: "Fives",
  sixes: "Sixes",
  threeKind: "Three of a Kind",
  fourKind: "Four of a Kind",
  fullHouse: "Full House",
  smallStraight: "Small Straight",
  largeStraight: "Large Straight",
  yacht: "Yacht",
  chance: "Chance",
};

function BestRow({ cat, state }: { cat: Category; state: YachtState }) {
  const mine = state.sheet.scores[cat] ?? 0;
  const best = state.categoryBests[cat] ?? mine;
  const tiedBest = mine >= best;
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: 10,
        padding: "4px 9px",
        borderRadius: 6,
        background: tiedBest ? "rgba(233,196,106,0.1)" : "transparent",
      }}
    >
      <span style={{ font: `600 12px/1.1 ${SANS}`, color: C.text }}>{LABELS[cat]}</span>
      <span style={{ display: "inline-flex", gap: 10, alignItems: "baseline" }}>
        <span style={{ font: `800 14px/1 ${SERIF}`, color: tiedBest ? C.goldSoft : C.text, minWidth: 26, textAlign: "right" }}>
          {mine}
        </span>
        <span style={{ font: `600 10px/1 ${SANS}`, color: C.textDim, minWidth: 46, textAlign: "right" }}>
          best {best}
        </span>
      </span>
    </div>
  );
}

export function Results({ state, run }: { state: YachtState; run: Run }) {
  const total = grandTotal(state.sheet);
  const bonus = upperBonus(state.sheet);
  const newBest = state.bestTotal !== null && total >= state.bestTotal;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, width: "100%" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ font: `800 12px/1 ${SANS}`, letterSpacing: "0.24em", color: C.gold }}>GAME COMPLETE</div>
        <div style={{ font: `800 52px/1 ${SERIF}`, color: C.goldSoft, margin: "8px 0 2px" }}>{total}</div>
        <div style={{ font: `600 11px/1 ${SANS}`, color: C.textDim }}>
          final score{bonus > 0 ? " · upper bonus +35" : ""}
          {state.sheet.yachtBonus > 0 ? ` · yacht bonus +${state.sheet.yachtBonus}` : ""}
        </div>
        <div style={{ marginTop: 10 }}>
          {newBest ? (
            <span
              style={{
                font: `800 11px/1 ${SANS}`,
                letterSpacing: "0.1em",
                color: C.ink,
                background: C.gold,
                padding: "6px 12px",
                borderRadius: 999,
              }}
            >
              ★ New personal best
            </span>
          ) : (
            <span style={{ font: `600 12px/1 ${SANS}`, color: C.textDim }}>
              Personal best {state.bestTotal ?? total}
            </span>
          )}
        </div>
      </div>

      <div style={{ width: "100%", borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
        <div style={{ font: `800 10px/1 ${SANS}`, letterSpacing: "0.18em", color: C.gold, marginBottom: 8, textAlign: "center" }}>
          PER-CATEGORY BESTS
        </div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", justifyContent: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 210 }}>
            {UPPER_CATEGORIES.map((cat) => (
              <BestRow key={cat} cat={cat} state={state} />
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 210 }}>
            {LOWER_CATEGORIES.map((cat) => (
              <BestRow key={cat} cat={cat} state={state} />
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" style={pill(false)} onClick={() => run("newGame")}>
          New Game
        </button>
        <button type="button" style={pill(false)} onClick={() => run("newGame", { daily: true })}>
          Daily Run
        </button>
      </div>
    </div>
  );
}

import { useState } from "react";

import {
  scoreCategory,
  type Category,
  type LowerCategory,
  type UpperCategory,
} from "../../score/categories";
import { upperSubtotal } from "../../score/sheet";
import type { YachtState } from "../../state/game";
import { C, SANS, SERIF, type Run } from "../theme";

interface RowMeta {
  cat: Category;
  label: string;
  note: string;
}

const UPPER_ROWS: readonly { cat: UpperCategory; label: string; note: string }[] = [
  { cat: "ones", label: "Ones", note: "sum of 1s" },
  { cat: "twos", label: "Twos", note: "sum of 2s" },
  { cat: "threes", label: "Threes", note: "sum of 3s" },
  { cat: "fours", label: "Fours", note: "sum of 4s" },
  { cat: "fives", label: "Fives", note: "sum of 5s" },
  { cat: "sixes", label: "Sixes", note: "sum of 6s" },
];

const LOWER_ROWS: readonly { cat: LowerCategory; label: string; note: string }[] = [
  { cat: "threeKind", label: "Three of a Kind", note: "sum of all dice" },
  { cat: "fourKind", label: "Four of a Kind", note: "sum of all dice" },
  { cat: "fullHouse", label: "Full House", note: "25 points" },
  { cat: "smallStraight", label: "Small Straight", note: "30 · four in a row" },
  { cat: "largeStraight", label: "Large Straight", note: "40 · five in a row" },
  { cat: "yacht", label: "Yacht", note: "50 · five alike" },
  { cat: "chance", label: "Chance", note: "sum of all dice" },
];

function ScoreRow({ meta, state, run }: { meta: RowMeta; state: YachtState; run: Run }) {
  const [hover, setHover] = useState(false);
  const banked = state.sheet.scores[meta.cat] !== undefined;
  const canBank = state.hasRolled && !banked && state.phase === "playing";
  const potential = state.hasRolled ? scoreCategory(meta.cat, state.dice) : null;
  const value = banked ? (state.sheet.scores[meta.cat] ?? 0) : potential;

  const background = banked
    ? C.rowBank
    : canBank && hover
      ? "rgba(233,196,106,0.16)"
      : "transparent";
  const border = banked
    ? "1px solid rgba(233,196,106,0.3)"
    : canBank
      ? `1px dashed ${hover ? C.gold : "rgba(240,222,176,0.32)"}`
      : "1px solid transparent";

  return (
    <div
      role={canBank ? "button" : undefined}
      aria-label={canBank ? `Score ${meta.label} for ${value}` : `${meta.label} ${banked ? value : ""}`}
      onClick={canBank ? () => run("bank", { category: meta.cat }) : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        pointerEvents: "auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "6px 10px",
        borderRadius: 8,
        background,
        border,
        cursor: canBank ? "pointer" : "default",
        transition: "background .12s ease, border-color .12s ease",
      }}
    >
      <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
        <span style={{ font: `700 13px/1.1 ${SANS}`, color: banked ? C.goldSoft : C.text }}>
          {meta.label}
        </span>
        <span style={{ font: `500 9.5px/1.1 ${SANS}`, letterSpacing: "0.03em", color: C.textDim }}>
          {meta.note}
        </span>
      </span>
      <span
        key={banked ? `b${value}` : "open"}
        style={{
          font: `800 16px/1 ${SERIF}`,
          minWidth: 34,
          textAlign: "right",
          color: banked ? C.goldSoft : canBank ? (value === 0 ? C.textDim : C.text) : C.ghost,
          opacity: !banked && !canBank ? 0.7 : 1,
          animation: banked ? "yd-pop .28s ease-out both" : undefined,
        }}
      >
        {value === null ? "–" : value}
        {banked ? <span style={{ color: C.ok, font: `700 11px/1 ${SANS}`, marginLeft: 4 }}>✓</span> : null}
      </span>
    </div>
  );
}

function SectionHead({ title }: { title: string }) {
  return (
    <div
      style={{
        font: `800 10px/1 ${SANS}`,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: C.gold,
        padding: "2px 10px 6px",
        borderBottom: `1px solid ${C.line}`,
      }}
    >
      {title}
    </div>
  );
}

export function ScoreSheet({
  state,
  run,
  compact,
}: {
  state: YachtState;
  run: Run;
  compact: boolean;
}) {
  const upper = upperSubtotal(state.sheet);
  const columnStyle = { display: "flex", flexDirection: "column" as const, gap: 3, flex: 1, minWidth: 220 };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: compact ? "column" : "row",
        gap: compact ? 10 : 22,
        alignItems: "stretch",
      }}
    >
      <div style={columnStyle}>
        <SectionHead title="Upper Section" />
        {UPPER_ROWS.map((meta) => (
          <ScoreRow key={meta.cat} meta={meta} state={state} run={run} />
        ))}
        <div
          style={{
            font: `600 11px/1 ${SANS}`,
            color: upper >= 63 ? C.ok : C.textDim,
            padding: "6px 10px 0",
            textAlign: "right",
          }}
        >
          Upper subtotal {upper} / 63
        </div>
      </div>

      <div style={columnStyle}>
        <SectionHead title="Lower Section" />
        {LOWER_ROWS.map((meta) => (
          <ScoreRow key={meta.cat} meta={meta} state={state} run={run} />
        ))}
        <div
          style={{
            font: `500 10px/1.4 ${SANS}`,
            color: state.sheet.yachtBonus > 0 ? C.ok : C.textDim,
            padding: "6px 10px 0",
          }}
        >
          Extra Yacht +100 each — additional yacht while the Yacht box holds 50
          {state.sheet.yachtBonus > 0 ? ` · earned +${state.sheet.yachtBonus}` : ""}
        </div>
      </div>
    </div>
  );
}

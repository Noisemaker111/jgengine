import { useState } from "react";

import { withSeedParam } from "@jgengine/core/random/seedLink";

import { UPPER_BONUS_THRESHOLD, grandTotal, upperSubtotal } from "../../score/sheet";
import type { YachtState } from "../../state/game";
import { C, SANS, SERIF, pill, type Run } from "../theme";

export function Header({ state, run }: { state: YachtState; run: Run }) {
  const [copied, setCopied] = useState(false);
  const total = grandTotal(state.sheet);
  const upper = upperSubtotal(state.sheet);
  const pct = Math.max(0, Math.min(100, (upper / UPPER_BONUS_THRESHOLD) * 100));
  const bonusDone = upper >= UPPER_BONUS_THRESHOLD;

  const share = () => {
    if (typeof navigator === "undefined" || typeof window === "undefined") return;
    const clip = navigator.clipboard;
    if (clip === undefined) return;
    clip
      .writeText(withSeedParam(window.location.href, state.seed))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      })
      .catch(() => {});
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ font: `800 26px/1 ${SERIF}`, letterSpacing: "0.02em", color: C.text }}>
            Yacht <span style={{ color: C.gold }}>Dice</span>
          </div>
          <div style={{ font: `600 10.5px/1.3 ${SANS}`, letterSpacing: "0.06em", color: C.textDim, marginTop: 4 }}>
            Roll five · up to three throws · bank all thirteen boxes
          </div>
        </div>
        <div style={{ textAlign: "right", lineHeight: 1 }}>
          <div style={{ font: `800 34px/1 ${SERIF}`, color: C.goldSoft }}>{total}</div>
          <div style={{ font: `700 9px/1 ${SANS}`, letterSpacing: "0.22em", color: C.textDim, marginTop: 3 }}>
            TOTAL
          </div>
          {state.bestTotal !== null ? (
            <div style={{ font: `600 10px/1 ${SANS}`, color: C.textDim, marginTop: 6 }}>
              Best {state.bestTotal}
            </div>
          ) : null}
        </div>
      </div>

      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            font: `600 10px/1 ${SANS}`,
            letterSpacing: "0.04em",
            marginBottom: 5,
          }}
        >
          <span style={{ color: C.textDim }}>Upper bonus</span>
          <span style={{ color: bonusDone ? C.ok : C.textDim }}>
            {upper} / {UPPER_BONUS_THRESHOLD} {bonusDone ? "· +35 ✓" : "· +35"}
          </span>
        </div>
        <div style={{ height: 7, borderRadius: 999, background: "rgba(0,0,0,0.35)", overflow: "hidden" }}>
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              borderRadius: 999,
              background: bonusDone ? C.ok : "linear-gradient(90deg,#e3b652,#f2dd97)",
              transition: "width .3s ease",
            }}
          />
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <button type="button" style={pill(false)} onClick={() => run("newGame")}>
          New Game
        </button>
        <button type="button" style={pill(state.daily)} onClick={() => run("newGame", { daily: true })}>
          Daily Run
        </button>
        <button type="button" style={pill(false)} onClick={share}>
          {copied ? "Link copied" : "Share seed"}
        </button>
        <span
          style={{
            font: `600 10px/1 ${SANS}`,
            letterSpacing: "0.04em",
            color: C.textDim,
            marginLeft: "auto",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {state.daily ? (
            <span
              style={{
                font: `800 8px/1 ${SANS}`,
                letterSpacing: "0.12em",
                color: C.ink,
                background: C.gold,
                padding: "3px 6px",
                borderRadius: 999,
              }}
            >
              DAILY
            </span>
          ) : null}
          seed {state.seed}
        </span>
      </div>
    </div>
  );
}

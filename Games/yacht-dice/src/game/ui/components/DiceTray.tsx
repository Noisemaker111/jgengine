import { MAX_ROLLS, type YachtState } from "../../state/game";
import { C, SANS, type Run } from "../theme";
import { Die } from "./Die";

export function DiceTray({
  state,
  dieSize,
  run,
}: {
  state: YachtState;
  dieSize: number;
  run: Run;
}) {
  const over = state.phase === "over";
  const canHold = state.hasRolled && state.rollsLeft > 0 && !over;
  const canRoll = state.rollsLeft > 0 && !over;
  const rollLabel = !state.hasRolled
    ? "Roll Dice"
    : state.rollsLeft > 0
      ? `Reroll · ${state.rollsLeft} left`
      : "Out of rolls — score a box";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
      <div style={{ display: "flex", gap: Math.round(dieSize * 0.26) }}>
        {state.dice.map((value, index) => (
          <Die
            key={`${index}:${state.spins[index]}`}
            value={value}
            held={state.held[index]}
            spin={state.spins[index]}
            size={dieSize}
            blank={!state.hasRolled}
            disabled={!canHold}
            onClick={() => run(`hold${index + 1}`)}
          />
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ display: "flex", gap: 6 }} aria-label={`${state.rollsLeft} of ${MAX_ROLLS} rolls left`}>
          {Array.from({ length: MAX_ROLLS }, (_, i) => (
            <span
              key={i}
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: i < state.rollsLeft ? C.gold : "transparent",
                border: `1px solid ${i < state.rollsLeft ? C.gold : "rgba(240,222,176,0.35)"}`,
              }}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={canRoll ? () => run("roll") : undefined}
          disabled={!canRoll}
          style={{
            pointerEvents: "auto",
            cursor: canRoll ? "pointer" : "default",
            font: `800 15px/1 ${SANS}`,
            letterSpacing: "0.04em",
            color: canRoll ? C.ink : C.textDim,
            background: canRoll ? "linear-gradient(180deg,#f2dd97,#e3b652)" : "rgba(255,255,255,0.05)",
            border: `1px solid ${canRoll ? C.goldSoft : "rgba(240,222,176,0.2)"}`,
            padding: "12px 22px",
            borderRadius: 12,
            animation: canRoll ? "yd-glow 2.4s ease-in-out infinite" : undefined,
          }}
        >
          {rollLabel}
        </button>
      </div>

      <div style={{ font: `600 11px/1.4 ${SANS}`, letterSpacing: "0.05em", color: C.textDim, textAlign: "center" }}>
        R roll · 1–5 hold a die · click a box to score
      </div>
    </div>
  );
}

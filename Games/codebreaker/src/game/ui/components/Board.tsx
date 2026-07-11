import type { ReactNode } from "react";

import { CODE_LENGTH, MAX_ROWS, type Feedback, type Round } from "../../codebreaker";
import { SECRET_STYLE } from "../theme";
import { KeyCluster, Peg, ShieldPeg } from "./widgets";

const EMPTY_FEEDBACK: Feedback = { black: 0, white: 0 };

function GuessRow({
  pegs,
  feedback,
  index,
  size,
  variant,
}: {
  pegs: readonly number[];
  feedback: Feedback;
  index: number;
  size: number;
  variant: "done" | "active" | "empty";
}): ReactNode {
  const slots = Array.from({ length: CODE_LENGTH }, (_, i) => (i < pegs.length ? pegs[i] : null));
  const shell =
    variant === "active"
      ? "ring-2 ring-amber-300/50 bg-amber-100/5"
      : variant === "empty"
        ? "opacity-60"
        : "";
  return (
    <div className={`flex items-center gap-2.5 rounded-lg px-2 py-1 ${shell}`}>
      <span className="w-4 text-right text-[10px] font-bold tabular-nums text-amber-200/40">{index}</span>
      <div className="flex gap-2">
        {slots.map((color, i) => (
          <Peg key={i} color={color} size={size} />
        ))}
      </div>
      <KeyCluster feedback={feedback} size={size} />
    </div>
  );
}

export function Board({ round, pegSize }: { round: Round; pegSize: number }): ReactNode {
  const shieldAnim = round.status === "lost" ? "cb-shake" : round.status === "won" ? "cb-win" : "";
  const activeIndex = round.guesses.length;
  const rows: ReactNode[] = [];
  for (let r = 0; r < MAX_ROWS; r += 1) {
    const guess = round.guesses[r];
    if (guess !== undefined) {
      rows.push(
        <GuessRow key={r} pegs={guess.pegs} feedback={guess.feedback} index={r + 1} size={pegSize} variant="done" />,
      );
    } else if (r === activeIndex && round.status === "playing") {
      rows.push(
        <GuessRow key={r} pegs={round.active} feedback={EMPTY_FEEDBACK} index={r + 1} size={pegSize} variant="active" />,
      );
    } else {
      rows.push(<GuessRow key={r} pegs={[]} feedback={EMPTY_FEEDBACK} index={r + 1} size={pegSize} variant="empty" />);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={`mb-1 flex items-center justify-between gap-3 rounded-lg px-3 py-2 ${shieldAnim}`}
        style={SECRET_STYLE}
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-950/70">Secret</span>
        <div className="flex gap-2">
          {round.secret.map((color, i) =>
            round.revealed ? <Peg key={i} color={color} size={pegSize} /> : <ShieldPeg key={i} size={pegSize} />,
          )}
        </div>
      </div>
      {rows}
    </div>
  );
}

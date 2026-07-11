import { GameIcon } from "@jgengine/react/gameIcons";

import { BOARD_SIZES, BOARD_SIZE_ORDER } from "../../match/catalog";
import { movesFieldOf, timeFieldOf } from "../../match/records";
import type { RoundState } from "../../match/round";
import { formatSeconds } from "../format";

export function WinPanel({
  round,
  copied,
  onPlayAgain,
  onReplaySeed,
  onSwitchSize,
  onCopyLink,
}: {
  round: RoundState;
  copied: boolean;
  onPlayAgain: () => void;
  onReplaySeed: () => void;
  onSwitchSize: (sizeId: string) => void;
  onCopyLink: () => void;
}) {
  const elapsed = round.endedAt !== null && round.startedAt !== null ? round.endedAt - round.startedAt : 0;
  const improved = round.bests?.improved ?? [];
  const bestMoves = improved.includes(movesFieldOf(round.sizeId));
  const bestTime = improved.includes(timeFieldOf(round.sizeId));
  const otherSize = BOARD_SIZE_ORDER.find((id) => id !== round.sizeId);

  return (
    <div className="mm-pop w-[min(92vw,26rem)] rounded-2xl border border-[#c9a557]/60 bg-gradient-to-b from-[#f6efdf] to-[#eadfc4] px-6 py-7 text-center shadow-[0_18px_50px_rgba(0,0,0,0.6)]">
      <div className="mb-1 flex items-center justify-center gap-2 text-[#c9a557]">
        <span className="mm-pop" style={{ animationDelay: "120ms" }}>
          <GameIcon name="star" size={18} />
        </span>
        <span className="mm-pop" style={{ animationDelay: "40ms" }}>
          <GameIcon name="star" size={26} />
        </span>
        <span className="mm-pop" style={{ animationDelay: "200ms" }}>
          <GameIcon name="star" size={18} />
        </span>
      </div>
      <h2 className="mm-serif text-2xl font-bold tracking-wide text-[#22375c]">Board Cleared!</h2>
      <p className="mt-1 text-xs uppercase tracking-[0.2em] text-[#8a7a54]">
        {BOARD_SIZES[round.sizeId].label} · seed {round.seed}
      </p>

      <div className="mt-5 flex items-stretch justify-center gap-3">
        <div className="flex-1 rounded-xl border border-[#c9a557]/50 bg-[#fbf7ec] px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-[0.16em] text-[#8a7a54]">Moves</p>
          <p className="text-xl font-bold tabular-nums text-[#22375c]">{round.match.moves}</p>
          {bestMoves ? (
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-[#a8842e]">New best!</p>
          ) : null}
        </div>
        <div className="flex-1 rounded-xl border border-[#c9a557]/50 bg-[#fbf7ec] px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-[0.16em] text-[#8a7a54]">Time</p>
          <p className="text-xl font-bold tabular-nums text-[#22375c]">{formatSeconds(elapsed)}</p>
          {bestTime ? (
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-[#a8842e]">New best!</p>
          ) : null}
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2">
        <button
          type="button"
          onClick={onPlayAgain}
          className="cursor-pointer rounded-lg bg-[#c9a557] px-4 py-2.5 text-sm font-bold uppercase tracking-wider text-[#16223c] transition hover:bg-[#e3c883]"
        >
          Shuffle &amp; Deal Again
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onReplaySeed}
            className="flex-1 cursor-pointer rounded-lg border border-[#22375c]/40 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[#22375c] transition hover:bg-[#22375c]/10"
          >
            Replay This Deal
          </button>
          {otherSize !== undefined ? (
            <button
              type="button"
              onClick={() => onSwitchSize(otherSize)}
              className="flex-1 cursor-pointer rounded-lg border border-[#22375c]/40 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[#22375c] transition hover:bg-[#22375c]/10"
            >
              Try {BOARD_SIZES[otherSize].label}
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onCopyLink}
          className="cursor-pointer rounded-lg border border-[#a8842e]/50 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[#a8842e] transition hover:bg-[#a8842e]/10"
        >
          {copied ? "Link Copied!" : "Copy Challenge Link"}
        </button>
      </div>
    </div>
  );
}

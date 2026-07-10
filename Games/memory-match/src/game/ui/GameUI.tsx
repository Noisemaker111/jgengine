import { useEffect, useState } from "react";

import { actionLabel } from "@jgengine/core/input/actionBindings";
import { withSeedParam } from "@jgengine/core/random/seedLink";
import { useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { GameIcon } from "@jgengine/react/gameIcons";

import { keybinds } from "../keybinds";
import { BOARD_SIZES, BOARD_SIZE_ORDER, isBoardSizeId, type BoardSizeId } from "../match/catalog";
import { canFlip } from "../match/machine";
import { movesFieldOf, records, timeFieldOf } from "../match/records";
import { getRound, type RoundState } from "../match/round";
import { formatSeconds } from "./format";
import { CardTile } from "./components/CardTile";
import { StatChip } from "./components/StatChip";
import { WinPanel } from "./components/WinPanel";

function useGameNow(running: boolean): number {
  const ctx = useGameContext();
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setTick((tick) => tick + 1), 200);
    return () => window.clearInterval(id);
  }, [running]);
  return ctx.time.now();
}

function challengeLink(seed: string): string {
  return withSeedParam(window.location.href, seed);
}

export function GameUI() {
  const ctx = useGameContext();
  const round = useGameStore((current) => getRound(current));
  const [copied, setCopied] = useState<"footer" | "win" | null>(null);
  const running = round !== null && round.startedAt !== null && round.endedAt === null;
  const now = useGameNow(running);

  useEffect(() => {
    if (copied === null) return;
    const id = window.setTimeout(() => setCopied(null), 1600);
    return () => window.clearTimeout(id);
  }, [copied]);

  if (round === null) return null;

  const { match, board } = round;
  const size = BOARD_SIZES[round.sizeId];
  const elapsed =
    round.startedAt === null ? 0 : (round.endedAt ?? (running ? now : round.startedAt)) - round.startedAt;
  const bestMoves = records.bestOf(movesFieldOf(round.sizeId));
  const bestTime = records.bestOf(timeFieldOf(round.sizeId));
  const dealKey = actionLabel(keybinds, "newGame");
  const boardRatio = (board.cols * 3) / (board.rows * 4);

  const runCommand = (name: string, input: Record<string, unknown>) => {
    ctx.game.commands.run(name, input);
  };
  const flip = (index: number) => runCommand("flipCard", { index });
  const deal = (sizeId: BoardSizeId, seed?: string) =>
    runCommand("newGame", seed === undefined ? { sizeId } : { sizeId, seed });
  const copyLink = (where: "footer" | "win") => {
    const link = challengeLink(round.seed);
    void navigator.clipboard
      ?.writeText(link)
      .then(() => setCopied(where))
      .catch(() => setCopied(null));
  };

  return (
    <div className="mm-felt absolute inset-0 flex select-none flex-col text-[#f4ecd9]">
      <header className="flex flex-col items-center gap-1.5 px-3 pt-3 sm:gap-2.5 sm:pt-5">
        <div className="flex items-baseline gap-3">
          <h1 className="mm-serif text-lg font-bold tracking-[0.08em] text-[#e3c883] sm:text-2xl">Memory Match</h1>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2.5">
          <StatChip icon="hand" label="Moves">
            {match.moves}
          </StatChip>
          <StatChip icon="hourglass" label="Time">
            {formatSeconds(elapsed)}
          </StatChip>
          <StatChip icon="check" label="Pairs">
            {match.matchedPairs}/{match.pairCount}
          </StatChip>
          <StatChip icon="star" label="Best">
            {bestMoves === null ? "—" : `${bestMoves} mv`}
            {bestTime === null ? "" : ` · ${formatSeconds(bestTime)}`}
          </StatChip>
        </div>
      </header>

      <main className="mm-stage min-h-0 flex-1 px-3 py-2 sm:px-6 sm:py-3">
        <div className="flex h-full w-full items-center justify-center">
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${board.cols}, 1fr)`,
              gap: "clamp(4px, 1.2cqw, 10px)",
              width: `min(100cqw, calc(100cqh * ${boardRatio}))`,
              aspectRatio: `${board.cols * 3} / ${board.rows * 4}`,
            }}
          >
            {board.cards.map((card, index) => (
              <CardTile
                key={index}
                index={index}
                glyph={card.glyph}
                face={match.faces[index] ?? "down"}
                shaking={match.phase === "resolving" && (index === match.firstUp || index === match.secondUp)}
                disabled={!canFlip(match, index)}
                onFlip={flip}
              />
            ))}
          </div>
        </div>
      </main>

      <footer className="flex flex-col items-center gap-1.5 px-3 pb-2.5 sm:gap-2 sm:pb-4">
        <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2.5">
          <div className="flex overflow-hidden rounded-full border border-[#c9a557]/45">
            {BOARD_SIZE_ORDER.map((sizeId) => (
              <button
                key={sizeId}
                type="button"
                onClick={() => deal(sizeId)}
                className={`cursor-pointer px-3 py-1.5 text-xs font-bold tracking-wider transition sm:px-4 ${
                  sizeId === round.sizeId
                    ? "bg-[#c9a557] text-[#16223c]"
                    : "bg-transparent text-[#c9a557] hover:bg-[#c9a557]/15"
                }`}
              >
                {BOARD_SIZES[sizeId].label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => deal(round.sizeId)}
            className="flex cursor-pointer items-center gap-2 rounded-full bg-[#c9a557] px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-[#16223c] transition hover:bg-[#e3c883] sm:px-5"
          >
            Shuffle &amp; Deal
            <span className="rounded border border-[#16223c]/40 px-1 text-[10px] font-bold">{dealKey}</span>
          </button>
          <button
            type="button"
            onClick={() => copyLink("footer")}
            aria-label="Copy challenge link for this deal"
            className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[#c9a557]/45 px-3 py-1.5 text-xs text-[#c9a557] transition hover:bg-[#c9a557]/15"
          >
            <GameIcon name="pin" size={12} />
            <span className="tabular-nums">{copied === "footer" ? "Copied!" : `seed ${round.seed}`}</span>
          </button>
        </div>
        <p className="text-[10px] tracking-[0.14em] text-[#5f6f92]">Traditional Concentration / Pelmanism</p>
      </footer>

      {match.phase === "won" ? (
        <div className="mm-fade absolute inset-0 z-10 flex items-center justify-center bg-[#060b16]/70 backdrop-blur-[2px]">
          <WinPanel
            round={round}
            copied={copied === "win"}
            onPlayAgain={() => deal(round.sizeId)}
            onReplaySeed={() => deal(round.sizeId, round.seed)}
            onSwitchSize={(sizeId) => {
              if (isBoardSizeId(sizeId)) deal(sizeId);
            }}
            onCopyLink={() => copyLink("win")}
          />
        </div>
      ) : null}
    </div>
  );
}

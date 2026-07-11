import type { Board, Player } from "../../logic/board";
import type { Mode } from "../../state";
import { isAiMode, HUMAN_PLAYER } from "../../state";
import type { RecordsView } from "../../records";
import { DISCS } from "../theme";

const MODE_LABEL: Record<Mode, string> = {
  easy: "AI · Easy",
  medium: "AI · Medium",
  hard: "AI · Hard",
  hotseat: "Hotseat",
};

function seatLabel(player: Player, mode: Mode): string {
  if (!isAiMode(mode)) return DISCS[player].name;
  return player === HUMAN_PLAYER ? `${DISCS[player].name} · You` : `${DISCS[player].name} · ${MODE_LABEL[mode]}`;
}

function PlayerChip({
  player,
  mode,
  active,
  thinking,
}: {
  player: Player;
  mode: Mode;
  active: boolean;
  thinking: boolean;
}) {
  const theme = DISCS[player];
  return (
    <div
      className="flex flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 transition-all"
      style={{
        background: active ? `${theme.chip}22` : "rgba(148,163,184,0.08)",
        boxShadow: active ? `inset 0 0 0 1.5px ${theme.chip}` : "inset 0 0 0 1px rgba(148,163,184,0.18)",
      }}
    >
      <span
        className="h-4 w-4 shrink-0 rounded-full"
        style={{ background: `radial-gradient(circle at 35% 30%, #ffffff88, ${theme.fill} 55%, ${theme.edge})` }}
      />
      <span className="truncate text-xs font-bold" style={{ color: active ? "#f8fafc" : "#94a3b8" }}>
        {seatLabel(player, mode)}
      </span>
      {active && thinking ? <span className="ml-auto text-[10px] font-semibold text-slate-400">thinking…</span> : null}
    </div>
  );
}

export function Scoreboard({
  board,
  mode,
  aiThinking,
  records,
}: {
  board: Board;
  mode: Mode;
  aiThinking: boolean;
  records: RecordsView;
}) {
  const playing = board.status === "playing";
  const tally = isAiMode(mode) ? records.tallies[mode] : null;
  const best = isAiMode(mode) ? records.bestStreak[mode] ?? 0 : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <PlayerChip player={1} mode={mode} active={playing && board.current === 1} thinking={aiThinking} />
        <PlayerChip player={2} mode={mode} active={playing && board.current === 2} thinking={aiThinking} />
      </div>
      {tally !== null ? (
        <div className="flex items-center justify-between rounded-lg bg-slate-950/50 px-3 py-1.5 text-[11px] font-semibold text-slate-300">
          <span>
            <span className="text-emerald-300">{tally.win}W</span> · <span className="text-rose-300">{tally.loss}L</span>{" "}
            · <span className="text-slate-400">{tally.draw}D</span>
          </span>
          <span className="text-amber-300">Best streak {best}</span>
        </div>
      ) : null}
    </div>
  );
}

import type { Move } from "../../logic/board";
import { DISCS } from "../theme";

export function MoveHistory({ moves }: { moves: readonly Move[] }) {
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-500">Moves</span>
      <div className="flex min-h-[24px] flex-1 items-center gap-1 overflow-x-auto">
        {moves.length === 0 ? (
          <span className="text-[11px] italic text-slate-500">—</span>
        ) : (
          moves.map((move, i) => {
            const theme = DISCS[move.player];
            const last = i === moves.length - 1;
            return (
              <span
                key={i}
                className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
                style={{
                  background: last ? `${theme.chip}33` : "rgba(148,163,184,0.12)",
                  color: "#cbd5e1",
                  boxShadow: last ? `inset 0 0 0 1px ${theme.chip}` : "none",
                }}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: theme.fill }} />
                {move.col + 1}
              </span>
            );
          })
        )}
      </div>
    </div>
  );
}

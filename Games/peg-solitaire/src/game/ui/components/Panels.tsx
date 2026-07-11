import { actionLabel } from "@jgengine/core/input/actionBindings";

import { keybinds } from "../../keybinds";
import { BOARD_IDS, type BoardId } from "../../peg/logic";
import type { PegSnapshot } from "../../peg/store";
import { badgeClass, COLORS, labelClass, panelClass, SERIF } from "../theme";

const BOARD_META: Readonly<Record<BoardId, { name: string; holes: number; action: string }>> = {
  english: { name: "English cross", holes: 33, action: "selectEnglish" },
  european: { name: "European", holes: 37, action: "selectEuropean" },
};

function StatTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center px-4">
      <span className={labelClass}>{label}</span>
      <span
        className="text-3xl font-black tabular-nums"
        style={{ fontFamily: SERIF, color: accent ? COLORS.brassBright : COLORS.ivory }}
      >
        {value}
      </span>
    </div>
  );
}

export function Brand({ snapshot }: { snapshot: PegSnapshot }) {
  return (
    <div className={`${panelClass} px-4 py-2.5`}>
      <div className="text-sm font-black uppercase tracking-[0.24em]" style={{ fontFamily: SERIF, color: COLORS.brassBright }}>
        Peg Solitaire
      </div>
      <div className="text-[10px] uppercase tracking-[0.2em] text-[#b39a76]">
        {snapshot.boardName} · {snapshot.holes.length} holes
      </div>
    </div>
  );
}

export function Stats({ snapshot }: { snapshot: PegSnapshot }) {
  const stateLabel = snapshot.status === "over" ? "Over" : snapshot.moves === 0 ? "Ready" : "Playing";
  return (
    <div className={`${panelClass} flex items-stretch divide-x divide-[#4a3620] px-1 py-2`}>
      <StatTile label="Pegs left" value={String(snapshot.pegsLeft)} accent={snapshot.pegsLeft <= 1} />
      <StatTile label="Moves" value={String(snapshot.moves)} />
      <div className="flex flex-col items-center justify-center px-4">
        <span className={labelClass}>State</span>
        <span className="text-sm font-bold" style={{ color: snapshot.status === "over" ? COLORS.brassBright : COLORS.ivory }}>
          {stateLabel}
        </span>
      </div>
    </div>
  );
}

function RecordRow({ label, value, fresh }: { label: string; value: string; fresh: boolean }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span className={labelClass}>{label}</span>
      <span
        className="text-base font-bold tabular-nums"
        style={{ fontFamily: SERIF, color: fresh ? COLORS.brassBright : COLORS.ivory }}
      >
        {value}
      </span>
    </div>
  );
}

export function Records({ snapshot }: { snapshot: PegSnapshot }) {
  return (
    <div className={`${panelClass} min-w-[10rem] px-4 py-3`}>
      <div className="mb-1.5 text-xs font-bold uppercase tracking-[0.2em]" style={{ color: COLORS.brassBright }}>
        Best · {snapshot.boardName}
      </div>
      <div className="flex flex-col gap-1">
        <RecordRow
          label="Fewest pegs"
          value={snapshot.bestPegs === null ? "—" : String(snapshot.bestPegs)}
          fresh={snapshot.newRecord}
        />
        <RecordRow
          label="In moves"
          value={snapshot.bestMoves === null ? "—" : String(snapshot.bestMoves)}
          fresh={snapshot.newRecord}
        />
      </div>
    </div>
  );
}

export function BoardSelector({ snapshot, onBoard }: { snapshot: PegSnapshot; onBoard: (id: BoardId) => void }) {
  return (
    <div className={`${panelClass} px-3 py-2.5`}>
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#b39a76]">Board</div>
      <div className="flex gap-1.5">
        {BOARD_IDS.map((id) => {
          const meta = BOARD_META[id];
          const active = snapshot.boardId === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onBoard(id)}
              className="flex min-h-[48px] min-w-[92px] flex-col items-center justify-center gap-1 rounded-lg px-2 py-1 font-bold transition"
              style={{
                fontFamily: SERIF,
                background: active ? COLORS.brass : "#100b06",
                color: active ? "#241704" : COLORS.ivory,
                border: `1px solid ${active ? COLORS.brassBright : "#4a3620"}`,
                boxShadow: active ? "0 0 12px rgba(239,212,137,0.4)" : "none",
              }}
            >
              <span className="text-sm leading-none">{meta.name}</span>
              <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide">
                {meta.holes} holes
                <span className={badgeClass(active)}>{actionLabel(keybinds, meta.action)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PillButton({
  onClick,
  children,
  badge,
  primary,
  disabled,
}: {
  onClick: () => void;
  children: string;
  badge?: string | null;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-[48px] items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold uppercase tracking-wide transition disabled:cursor-not-allowed"
      style={{
        background: primary ? COLORS.brass : "#26201790",
        color: primary ? "#241704" : COLORS.ivory,
        border: `1px solid ${primary ? COLORS.brassBright : "#4a3620"}`,
        opacity: disabled ? 0.42 : 1,
      }}
    >
      <span>{children}</span>
      {badge != null && badge !== "" ? <span className={badgeClass(Boolean(primary))}>{badge}</span> : null}
    </button>
  );
}

export function Controls({
  snapshot,
  onUndo,
  onHint,
  onRestart,
  showKeyHint,
}: {
  snapshot: PegSnapshot;
  onUndo: () => void;
  onHint: () => void;
  onRestart: () => void;
  showKeyHint: boolean;
}) {
  return (
    <div className={`${panelClass} flex flex-col items-center gap-2 px-4 py-3`}>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <PillButton onClick={onHint} badge={actionLabel(keybinds, "showHint")} primary>
          Hint
        </PillButton>
        <PillButton onClick={onUndo} badge={actionLabel(keybinds, "undoMove")} disabled={!snapshot.canUndo}>
          Undo
        </PillButton>
        <PillButton onClick={onRestart} badge={actionLabel(keybinds, "restartBoard")}>
          Restart
        </PillButton>
      </div>
      {showKeyHint ? (
        <div className="text-[11px] text-[#b39a76]">Click a peg to see its jumps, then click a glowing hole — or drag it across.</div>
      ) : (
        <div className="text-[11px] text-[#b39a76]">Tap a peg, then a glowing hole — or drag it across.</div>
      )}
    </div>
  );
}

export function Credit() {
  return (
    <div className="max-w-[16rem] text-right text-[11px] leading-snug text-[#b39a76]">
      Peg solitaire — traditional, first recorded at the court of Louis XIV (1697)
    </div>
  );
}

const TIER_COPY = {
  brilliant: { title: "Brilliant!", sub: "One peg — and it finished dead centre." },
  solved: { title: "Solved!", sub: "Down to a single peg." },
  stuck: { title: "No moves left", sub: "" },
} as const;

export function OverBanner({ snapshot, onRestart }: { snapshot: PegSnapshot; onRestart: () => void }) {
  const outcome = snapshot.outcome;
  if (outcome === null) return null;
  const copy = TIER_COPY[outcome.tier];
  const sub = outcome.tier === "stuck" ? `${outcome.pegsLeft} pegs remaining.` : copy.sub;
  return (
    <div
      className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center px-4"
      style={{
        background: "radial-gradient(circle at center, rgba(18,15,10,0.74), rgba(6,4,2,0.92))",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + var(--jg-hud-dock-clearance, 0px))",
      }}
    >
      <div className={`${panelClass} flex flex-col items-center gap-3 px-8 py-7 text-center`}>
        <div
          className="text-3xl font-black uppercase tracking-[0.16em]"
          style={{ fontFamily: SERIF, color: COLORS.brassBright, textShadow: "0 0 20px rgba(239,212,137,0.5)" }}
        >
          {copy.title}
        </div>
        <div className="text-sm text-[#c3b490]">{sub}</div>
        <div className="flex items-center gap-6" style={{ fontFamily: SERIF }}>
          <div className="flex flex-col">
            <span className={labelClass}>Pegs left</span>
            <span className="text-2xl font-bold tabular-nums text-[#efe6d2]">{outcome.pegsLeft}</span>
          </div>
          <div className="flex flex-col">
            <span className={labelClass}>Moves</span>
            <span className="text-2xl font-bold tabular-nums text-[#efe6d2]">{snapshot.moves}</span>
          </div>
        </div>
        {snapshot.newRecord ? (
          <div className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: COLORS.brassBright }}>
            New best for {snapshot.boardName}!
          </div>
        ) : null}
        <button
          type="button"
          onClick={onRestart}
          className="mt-1 inline-flex min-h-[48px] items-center rounded-lg px-6 py-2 text-sm font-bold uppercase tracking-wide"
          style={{ background: COLORS.brass, color: "#241704", border: `1px solid ${COLORS.brassBright}` }}
        >
          Play again
        </button>
      </div>
    </div>
  );
}

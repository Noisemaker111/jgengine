import { useState } from "react";

import { actionLabel } from "@jgengine/core/input/actionBindings";

import { keybinds } from "../../keybinds";
import { BOARD_SIZES, type BoardSize, type PuzzleSnapshot } from "../../puzzle/store";
import { badgeClass, COLORS, formatClock, labelClass, NUMERAL_FONT, panelClass } from "../theme";

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center px-4">
      <span className={labelClass}>{label}</span>
      <span
        className="text-3xl font-black tabular-nums text-[#ece0c8]"
        style={{ fontFamily: NUMERAL_FONT }}
      >
        {value}
      </span>
    </div>
  );
}

export function Brand({ size }: { size: BoardSize }) {
  return (
    <div className={`${panelClass} px-4 py-2.5`}>
      <div
        className="text-sm font-black uppercase tracking-[0.24em] text-[#e9c86a]"
        style={{ fontFamily: NUMERAL_FONT }}
      >
        The 15 Puzzle
      </div>
      <div className="text-[10px] uppercase tracking-[0.2em] text-[#a5906f]">
        Sliding Tiles · {size}×{size}
      </div>
    </div>
  );
}

export function Stats({ snapshot }: { snapshot: PuzzleSnapshot }) {
  const statusLabel =
    snapshot.status === "solved" ? "Solved" : snapshot.status === "playing" ? "Playing" : "Ready";
  return (
    <div className={`${panelClass} flex items-stretch divide-x divide-[#3a3024] px-1 py-2`}>
      <StatTile label="Moves" value={String(snapshot.moves)} />
      <StatTile label="Time" value={formatClock(snapshot.status === "ready" ? 0 : snapshot.elapsedMs)} />
      <div className="flex flex-col items-center justify-center px-4">
        <span className={labelClass}>State</span>
        <span
          className="text-sm font-bold"
          style={{ color: snapshot.status === "solved" ? COLORS.brassBright : COLORS.ivory }}
        >
          {statusLabel}
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
        style={{ fontFamily: NUMERAL_FONT, color: fresh ? COLORS.brassBright : COLORS.ivory }}
      >
        {value}
      </span>
    </div>
  );
}

export function Records({ snapshot }: { snapshot: PuzzleSnapshot }) {
  return (
    <div className={`${panelClass} min-w-[9.5rem] px-4 py-3`}>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#e9c86a]">
          Best · {snapshot.size}×{snapshot.size}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <RecordRow label="Time" value={formatClock(snapshot.bestTimeMs)} fresh={snapshot.newTimeRecord} />
        <RecordRow
          label="Moves"
          value={snapshot.bestMoves === null ? "—" : String(snapshot.bestMoves)}
          fresh={snapshot.newMovesRecord}
        />
      </div>
    </div>
  );
}

export function SizeSelector({
  snapshot,
  onSize,
}: {
  snapshot: PuzzleSnapshot;
  onSize: (size: BoardSize) => void;
}) {
  return (
    <div className={`${panelClass} px-3 py-2.5`}>
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a5906f]">
        Board
      </div>
      <div className="flex gap-1.5">
        {BOARD_SIZES.map((size) => {
          const active = snapshot.size === size;
          return (
            <button
              key={size}
              type="button"
              onClick={() => onSize(size)}
              className="flex min-h-[48px] min-w-[52px] flex-col items-center justify-center gap-1 rounded-lg px-2 py-1 text-sm font-bold transition"
              style={{
                fontFamily: NUMERAL_FONT,
                background: active ? COLORS.brass : "#0f0c08",
                color: active ? "#221a0e" : COLORS.ivory,
                border: `1px solid ${active ? COLORS.brassBright : "#3a3024"}`,
                boxShadow: active ? "0 0 12px rgba(216,178,74,0.4)" : "none",
              }}
            >
              <span className="text-base leading-none">
                {size}×{size}
              </span>
              <span className={badgeClass(active)}>{actionLabel(keybinds, `size${size}`)}</span>
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
}: {
  onClick: () => void;
  children: string;
  badge?: string | null;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-[48px] items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold uppercase tracking-wide transition"
      style={{
        background: primary ? COLORS.brass : "#26201790",
        color: primary ? "#221a0e" : COLORS.ivory,
        border: `1px solid ${primary ? COLORS.brassBright : "#3a3024"}`,
      }}
    >
      <span>{children}</span>
      {badge != null && badge !== "" ? (
        <span className={badgeClass(Boolean(primary))}>{badge}</span>
      ) : null}
    </button>
  );
}

export function Controls({
  snapshot,
  onNew,
  onRestart,
  showKeyHint,
}: {
  snapshot: PuzzleSnapshot;
  onNew: () => void;
  onRestart: () => void;
  showKeyHint: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copyLink = () => {
    const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    clipboard?.writeText(snapshot.shareUrl).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      },
      () => undefined,
    );
  };
  return (
    <div className={`${panelClass} flex flex-col items-center gap-2 px-4 py-3`}>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <PillButton onClick={onNew} badge={actionLabel(keybinds, "newShuffle")} primary>
          New Shuffle
        </PillButton>
        <PillButton onClick={onRestart} badge={actionLabel(keybinds, "restart")}>
          Restart
        </PillButton>
        <button
          type="button"
          onClick={copyLink}
          className="inline-flex min-h-[48px] items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold uppercase tracking-wide transition"
          style={{ background: "#26201790", color: COLORS.ivory, border: "1px solid #3a3024" }}
        >
          {copied ? "Copied!" : "Copy Link"}
        </button>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-[#a5906f]">
        <span className="rounded bg-[#0f0c08] px-2 py-0.5 font-mono tracking-wide text-[#c9b280]">
          seed · {snapshot.seed}
        </span>
        {showKeyHint ? <span>Arrow keys or tap a tile to slide</span> : null}
      </div>
    </div>
  );
}

export function Credit() {
  return (
    <div className="max-w-[15rem] text-right text-[11px] leading-snug text-[#a5906f]">
      The 15 Puzzle — 1870s America, popularized by Noyes Chapman
    </div>
  );
}

export function SolvedOverlay({ snapshot, onNew }: { snapshot: PuzzleSnapshot; onNew: () => void }) {
  return (
    <div
      className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center px-4"
      style={{
        background: "radial-gradient(circle at center, rgba(20,16,10,0.72), rgba(8,6,4,0.9))",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + var(--jg-hud-dock-clearance, 0px))",
      }}
    >
      <div className={`${panelClass} flex flex-col items-center gap-3 px-8 py-7 text-center`}>
        <div
          className="text-3xl font-black uppercase tracking-[0.18em] text-[#f2d886]"
          style={{ fontFamily: NUMERAL_FONT, textShadow: "0 0 20px rgba(216,178,74,0.5)" }}
        >
          Solved!
        </div>
        <div className="flex items-center gap-5" style={{ fontFamily: NUMERAL_FONT }}>
          <div className="flex flex-col">
            <span className={labelClass}>Time</span>
            <span className="text-2xl font-bold tabular-nums text-[#ece0c8]">
              {formatClock(snapshot.elapsedMs)}
            </span>
          </div>
          <div className="flex flex-col">
            <span className={labelClass}>Moves</span>
            <span className="text-2xl font-bold tabular-nums text-[#ece0c8]">{snapshot.moves}</span>
          </div>
        </div>
        {snapshot.newTimeRecord || snapshot.newMovesRecord ? (
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#f2d886]">
            {snapshot.newTimeRecord && snapshot.newMovesRecord
              ? "New best time & moves!"
              : snapshot.newTimeRecord
                ? "New best time!"
                : "New best moves!"}
          </div>
        ) : (
          <div className="text-xs uppercase tracking-[0.2em] text-[#a5906f]">{snapshot.size}×{snapshot.size} cleared</div>
        )}
        <button
          type="button"
          onClick={onNew}
          className="mt-1 inline-flex min-h-[48px] items-center rounded-lg px-6 py-2 text-sm font-bold uppercase tracking-wide"
          style={{ background: COLORS.brass, color: "#221a0e", border: `1px solid ${COLORS.brassBright}` }}
        >
          New Shuffle
        </button>
      </div>
    </div>
  );
}

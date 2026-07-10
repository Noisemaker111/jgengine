import type { WinView } from "../../store";
import { Stars } from "./Stars";

const BLURB: Record<1 | 2 | 3, string> = {
  3: "Perfect run — par met.",
  2: "Well kept.",
  1: "Crates delivered.",
};

export function WinBanner({
  win,
  onNext,
  onRetry,
  onMenu,
}: {
  win: WinView;
  onNext: () => void;
  onRetry: () => void;
  onMenu: () => void;
}) {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-black/65 p-4 backdrop-blur-sm">
      <div
        className="w-full max-w-sm rounded-2xl border border-amber-600/40 bg-gradient-to-b from-[#2a2318] to-[#191309] p-6 text-center shadow-2xl"
        style={{ animation: "ck-rise 260ms ease-out" }}
      >
        <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-amber-300/70">
          {win.hasNext ? "Bay Cleared" : "Warehouse Complete"}
        </div>
        <h2 className="mt-1 text-2xl font-black text-amber-50">{win.name}</h2>
        <div className="my-4 grid place-items-center" style={{ animation: "ck-pop 340ms ease-out" }}>
          <Stars earned={win.stars} size={38} gap={6} />
        </div>
        <p className="text-sm text-amber-100/70">{BLURB[win.stars]}</p>

        <div className="mt-4 flex justify-center gap-2 text-sm">
          <span className="rounded-lg bg-black/30 px-3 py-1.5 font-semibold text-amber-100/90 ring-1 ring-amber-900/40">
            Moves <b className="tabular-nums text-amber-50">{win.moves}</b>{" "}
            <span className="text-amber-300/50">/ par {win.par}</span>
          </span>
          <span className="rounded-lg bg-black/30 px-3 py-1.5 font-semibold text-amber-100/90 ring-1 ring-amber-900/40">
            Pushes <b className="tabular-nums text-amber-50">{win.pushes}</b>
          </span>
        </div>
        {win.improvedMoves ? (
          <div className="mt-3 inline-block rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-200 ring-1 ring-amber-400/40">
            ★ New best
          </div>
        ) : null}

        <div className="mt-5 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="rounded-xl bg-black/30 px-4 py-2.5 text-sm font-bold text-amber-100/80 ring-1 ring-amber-900/40 transition hover:bg-black/45"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={onMenu}
            className="rounded-xl bg-black/30 px-4 py-2.5 text-sm font-bold text-amber-100/80 ring-1 ring-amber-900/40 transition hover:bg-black/45"
          >
            Levels
          </button>
          {win.hasNext ? (
            <button
              type="button"
              onClick={onNext}
              className="rounded-xl bg-gradient-to-b from-amber-500 to-amber-700 px-5 py-2.5 text-sm font-black text-amber-950 shadow-lg ring-1 ring-amber-300/50 transition hover:from-amber-400 active:scale-95"
            >
              Next ›
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

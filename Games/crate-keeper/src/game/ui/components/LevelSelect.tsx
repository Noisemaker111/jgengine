import { SettingsTrigger } from "@jgengine/react";

import type { KeeperSnapshot, LevelCard } from "../../store";
import { Stars } from "./Stars";

function Card({ card, onSelect }: { card: LevelCard; onSelect: (index: number) => void }) {
  if (!card.unlocked) {
    return (
      <div className="flex aspect-square flex-col items-center justify-center rounded-xl border border-white/5 bg-black/30 opacity-60">
        <span className="text-xl text-amber-200/25" aria-hidden>
          🔒
        </span>
        <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-amber-200/25">
          {String(card.index + 1).padStart(2, "0")}
        </span>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onSelect(card.index)}
      className={`group flex aspect-square flex-col items-center justify-between rounded-xl border p-2 text-center transition active:scale-95 ${
        card.completed
          ? "border-amber-600/40 bg-gradient-to-b from-[#33291b] to-[#211a10] hover:border-amber-500/70"
          : "border-amber-400/30 bg-gradient-to-b from-[#3a2f1d] to-[#241c11] shadow-[0_0_16px_rgba(245,178,60,0.12)] hover:border-amber-300/70"
      }`}
    >
      <span className="text-lg font-black tabular-nums text-amber-50">{String(card.index + 1).padStart(2, "0")}</span>
      <span className="line-clamp-1 w-full text-[10px] font-medium text-amber-100/60">{card.name}</span>
      {card.completed ? (
        <Stars earned={card.stars} size={13} />
      ) : (
        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300/70">Play</span>
      )}
    </button>
  );
}

export function LevelSelect({
  snapshot,
  onSelect,
  onContinue,
}: {
  snapshot: KeeperSnapshot;
  onSelect: (index: number) => void;
  onContinue: () => void;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center overflow-y-auto px-4 py-5">
      <div className="w-full max-w-xl">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-amber-50">
              Crate <span className="text-amber-400">Keeper</span>
            </h1>
            <p className="mt-0.5 text-sm text-amber-200/50">Push every crate onto its lamp.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-xl bg-black/30 px-3 py-2 ring-1 ring-amber-900/40">
              <Stars earned={3} size={15} />
              <span className="text-sm font-bold tabular-nums text-amber-100">
                {snapshot.totalStars}
                <span className="text-amber-300/40"> / {snapshot.maxStars}</span>
              </span>
            </div>
            <SettingsTrigger className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/30 text-amber-100/80 ring-1 ring-amber-900/40 transition hover:bg-black/40" />
          </div>
        </div>

        {snapshot.campaignComplete ? (
          <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-center text-sm font-semibold text-amber-100">
            🏆 All 20 bays kept. Chase par on every level for a perfect 60 stars.
          </div>
        ) : (
          <button
            type="button"
            onClick={onContinue}
            className="mt-4 w-full rounded-xl bg-gradient-to-b from-amber-500 to-amber-700 px-5 py-3 text-base font-black text-amber-950 shadow-lg ring-1 ring-amber-300/50 transition hover:from-amber-400 active:scale-[0.98]"
          >
            {snapshot.completedCount === 0 ? "Start Shift" : `Continue · Level ${snapshot.frontier + 1}`}
          </button>
        )}

        <div className="mt-5 grid grid-cols-4 gap-2.5 sm:grid-cols-5">
          {snapshot.levels.map((card) => (
            <Card key={card.id} card={card} onSelect={onSelect} />
          ))}
        </div>
      </div>
    </div>
  );
}

import { LEVEL_COUNT, parForLevel, starsFor } from "../../logic/campaign";
import type { AppSnapshot } from "../../state";
import { consolePanelStyle, ghostButtonClass, labelClass, primaryButtonClass } from "../theme";
import { Stars } from "./Stars";

export function LevelSelect({
  snapshot,
  onLevel,
  onRandom,
}: {
  snapshot: AppSnapshot;
  onLevel: (level: number) => void;
  onRandom: () => void;
}) {
  const cleared = snapshot.levelBests.filter((best) => best !== null).length;
  const totalStars = snapshot.levelBests.reduce<number>(
    (sum, best, level) => (best === null ? sum : sum + starsFor(best, parForLevel(level))),
    0,
  );
  const levels = [];
  for (let level = 0; level < LEVEL_COUNT; level += 1) {
    const best = snapshot.levelBests[level] ?? null;
    const stars = best === null ? 0 : starsFor(best, parForLevel(level));
    levels.push(
      <button
        key={level}
        type="button"
        onClick={() => onLevel(level)}
        className="flex flex-col items-center gap-1 rounded-lg border border-[#4a4030] bg-[#221b12] py-2 transition hover:border-[#7a5a2e] hover:bg-[#2b2216] active:translate-y-[1px]"
      >
        <span className="text-[15px] font-bold text-[#ece0c8] tabular-nums">{level + 1}</span>
        <Stars value={stars} size={0.62} />
        <span className="text-[9px] font-mono text-[#8b7a5b]">{best === null ? "—" : `${best}`}</span>
      </button>,
    );
  }
  return (
    <div className="flex w-full max-w-md flex-col gap-3 rounded-2xl p-4" style={consolePanelStyle}>
      <div className="flex items-end justify-between">
        <div>
          <div
            className="text-[22px] font-black uppercase tracking-[0.3em] text-[#ffbb3c]"
            style={{ textShadow: "0 0 16px rgba(255,170,45,0.5)" }}
          >
            Lights Out
          </div>
          <div className={labelClass}>
            {cleared} / {LEVEL_COUNT} cleared · {totalStars}★
          </div>
        </div>
        <button type="button" className={primaryButtonClass} onClick={onRandom}>
          Random
        </button>
      </div>
      <div className="grid grid-cols-6 gap-2">{levels}</div>
      <div className="text-center text-[10px] text-[#6f6047]">
        Toggle a cell and its neighbors — clear the board in as few presses as par.
      </div>
    </div>
  );
}

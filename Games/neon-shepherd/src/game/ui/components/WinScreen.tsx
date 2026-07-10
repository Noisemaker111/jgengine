import type { Medal } from "../../session/runState";

const MEDAL_COPY: Record<Exclude<Medal, null>, { label: string; color: string }> = {
  gold: { label: "Gold — every light came home", color: "#f5c56b" },
  silver: { label: "Silver — the herd is safe", color: "#c8d0dd" },
  bronze: { label: "Bronze — a hard-won crossing", color: "#c98a5b" },
};

function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function WinScreen({
  saved,
  medal,
  elapsed,
  onRestart,
}: {
  saved: number;
  medal: Medal;
  elapsed: number;
  onRestart: () => void;
}): React.ReactNode {
  const copy = medal !== null ? MEDAL_COPY[medal] : MEDAL_COPY.bronze;
  return (
    <div className="pointer-events-auto flex h-full w-full flex-col items-center justify-center gap-5 bg-[#101318]/92 text-center backdrop-blur-md">
      <span className="text-xs uppercase tracking-widest text-[#7ef9c8]">The sanctuary opens its gate</span>
      <h1 className="text-4xl font-semibold text-[#eef4f0]">{saved} lights reached the garden</h1>
      <span className="text-lg font-medium" style={{ color: copy.color }}>
        {copy.label}
      </span>
      <span className="text-sm text-[#eef4f0]/70">Run time {formatClock(elapsed)}</span>
      <button
        type="button"
        onClick={onRestart}
        className="rounded-full bg-[#7ef9c8] px-8 py-3 text-sm font-semibold uppercase tracking-widest text-[#101318] shadow-[0_0_20px_rgba(126,249,200,0.5)] transition-transform hover:scale-105"
      >
        Shepherd again · R
      </button>
    </div>
  );
}

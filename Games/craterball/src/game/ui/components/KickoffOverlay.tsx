export function KickoffOverlay({ kickoffTimer, kickoffCount }: { kickoffTimer: number; kickoffCount: number }) {
  const count = Math.ceil(kickoffTimer);
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs font-bold uppercase tracking-[0.3em] text-[#cdb891]/70">
        {kickoffCount > 1 ? "Kickoff" : "Match Start"}
      </span>
      <span
        key={count}
        className="text-6xl font-black text-[#ff6b35] drop-shadow-[0_0_18px_rgba(255,107,53,0.65)] [animation:craterballPulse_0.5s_ease-out]"
      >
        {count > 0 ? count : "GO"}
      </span>
    </div>
  );
}

export function ScarsTicker({ craterScars, craterCount }: { craterScars: number; craterCount: number }) {
  return (
    <div className="flex flex-col items-end rounded-lg border border-[#cdb891]/25 bg-[#160f0c]/80 px-3 py-1.5 text-right shadow-lg shadow-black/40 backdrop-blur-sm">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-[#cdb891]/60">Pitch Scars</span>
      <span className="text-lg font-black text-[#ff6b35]">{craterScars}</span>
      {craterCount >= 40 ? <span className="text-[9px] font-semibold text-[#d94a8c]">MAP FULL — OLDEST FADING</span> : null}
    </div>
  );
}

const CHIP_STYLE: Record<number, string> = {
  5: "bg-[#b06a3f] border-[#e0a877]",
  25: "bg-[#5b7f5b] border-[#9dc79d]",
  100: "bg-[#3a3a44] border-[#8a8a99]",
  500: "bg-[#6b4a7a] border-[#b592c6]",
};

export function Chip({ value, disabled, onClick }: { value: number; disabled: boolean; onClick: () => void }) {
  const style = CHIP_STYLE[value] ?? "bg-[#b06a3f] border-[#e0a877]";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={`Add ${value} chips`}
      className={[
        "flex h-14 w-14 items-center justify-center rounded-full border-4 border-dotted text-sm font-black tabular-nums text-amber-50 shadow-[0_5px_10px_rgba(0,0,0,0.4)] transition-transform",
        style,
        disabled ? "cursor-not-allowed opacity-30" : "cursor-pointer hover:-translate-y-1 active:translate-y-0",
      ].join(" ")}
    >
      {value}
    </button>
  );
}

export function BetCircle({ bet }: { bet: number }) {
  return (
    <div className="flex h-16 w-16 flex-col items-center justify-center rounded-full border-2 border-dashed border-amber-200/50 bg-emerald-950/40">
      <span className="text-[10px] uppercase tracking-wide text-emerald-100/60">Bet</span>
      <span className="text-lg font-black tabular-nums text-amber-100">{bet}</span>
    </div>
  );
}

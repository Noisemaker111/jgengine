export function TouchControls({ onFire }: { onFire: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-1">
      <span className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Drag playfield to move</span>
      <button
        type="button"
        onPointerDown={(event) => {
          event.preventDefault();
          onFire();
        }}
        className="rounded-full border border-emerald-400/60 bg-emerald-500/20 px-8 py-3 text-sm font-black uppercase tracking-[0.2em] text-emerald-100 shadow-[0_0_18px_rgba(84,255,159,0.35)] active:bg-emerald-500/40"
      >
        Fire
      </button>
    </div>
  );
}

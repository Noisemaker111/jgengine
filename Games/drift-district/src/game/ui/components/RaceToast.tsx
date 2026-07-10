import type { RaceToast } from "../../race/session";

export function RaceToastLayer({ toast }: { toast: RaceToast | null }) {
  if (toast === null) return null;
  return (
    <div className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2">
      <span className="animate-pulse rounded-full border border-[#ff2d78]/60 bg-[#15151d]/90 px-5 py-2 text-sm font-black uppercase tracking-[0.3em] text-[#ff2d78] shadow-[0_0_28px_rgba(255,45,120,0.45)]">
        {toast.message}
      </span>
    </div>
  );
}

import type { ReactNode } from "react";
import { HudButton } from "@jgengine/react/hudButton";
import { HudSurface } from "@jgengine/react/hudSurface";

/** The dimmed modal sheet every Scrap Signal terminal (vendors, travel, exchange, talents) opens in. */
export function ScrapPanel({ title, aside, closeLabel = "Close", onClose, wide = false, children }: { title: ReactNode; aside?: ReactNode; closeLabel?: string; onClose: () => void; wide?: boolean; children: ReactNode }) {
  return (
    <div className={`pointer-events-auto absolute inset-0 z-50 flex items-center justify-center ${wide ? "bg-black/70" : "bg-black/60"}`}>
      <HudSurface role="dialog" aria-modal="true" elevation="modal" padding={16} className={`scrap-panel signal-scroll ${wide ? "w-[46rem] max-w-[95vw]" : "w-[26rem] max-w-[92vw]"}`}>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <span className="text-lg font-black uppercase tracking-widest text-amber-300">{title}</span>
            {aside}
          </div>
          <HudButton onClick={onClose} className="scrap-close">{closeLabel}</HudButton>
        </div>
        {children}
      </HudSurface>
    </div>
  );
}

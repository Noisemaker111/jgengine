import type { ReactNode } from "react";

import { MenuList, type MenuEntry } from "@/components/ui/menu-list";

const OVERLAY_BACKGROUND = "radial-gradient(circle, transparent 0%, rgba(0,0,0,0.78) 100%), rgba(0,0,0,0.45)";

function AccentRule({ width = 120 }: { width?: number | string }) {
  return (
    <span
      className="block h-0.5"
      style={{
        width,
        background:
          "linear-gradient(90deg, transparent 0%, var(--jg-accent) 18%, var(--jg-accent) 82%, transparent 100%)",
        boxShadow: "0 0 8px var(--jg-accent-glow)",
      }}
    />
  );
}

export function TitleScreen({
  title,
  subtitle,
  entries,
  selectedId,
  onSelect,
  onActivate,
  version,
  backdrop,
  className,
}: {
  title: string;
  subtitle?: string;
  entries: readonly MenuEntry[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  onActivate?: (id: string) => void;
  version?: string;
  backdrop?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`pointer-events-auto absolute inset-0 z-50 overflow-hidden ${className ?? ""}`} data-jg="title-screen">
      {backdrop !== undefined && <div className="absolute inset-0">{backdrop}</div>}
      <div aria-hidden className="absolute inset-0" style={{ background: OVERLAY_BACKGROUND }} />
      <div className="relative h-full w-full">
        <div className="absolute inset-x-0 top-[14%] flex flex-col items-center gap-10">
          <div className="flex flex-col items-center gap-4">
            <h1
              className="m-0 max-w-[90vw] px-4 text-center text-[clamp(24px,6vw,52px)] font-extrabold uppercase tracking-[0.18em] [overflow-wrap:anywhere]"
              style={{
                fontFamily: "var(--jg-font-display)",
                color: "var(--jg-text)",
                textShadow: "0 4px 0 var(--jg-accent-deep), 0 8px 22px rgba(0,0,0,0.9), 0 0 32px var(--jg-accent-glow)",
              }}
            >
              {title}
            </h1>
            <AccentRule width={300} />
            {subtitle !== undefined && (
              <span className="text-[13px] uppercase tracking-[0.3em]" style={{ color: "var(--jg-text-dim)" }}>
                {subtitle}
              </span>
            )}
          </div>
          <MenuList entries={entries} selectedId={selectedId} onSelect={onSelect} onActivate={onActivate} />
        </div>
        {version !== undefined && (
          <span
            className="absolute bottom-4 right-5 font-mono text-[10px]"
            style={{ color: "var(--jg-text-dim)" }}
          >
            {version}
          </span>
        )}
      </div>
    </div>
  );
}

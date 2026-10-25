import { Fragment } from "react";

import { MenuList, type MenuEntry } from "@/components/ui/menu-list";

const OVERLAY_BACKGROUND = "radial-gradient(circle, transparent 0%, rgba(0,0,0,0.78) 100%), rgba(0,0,0,0.45)";
const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

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

export interface ResultLine {
  label: string;
  value: string | number;
  accent?: boolean;
}

export function ResultsScreen({
  outcome,
  title,
  lines,
  entries,
  selectedId,
  onSelect,
  onActivate,
  className,
}: {
  outcome: "victory" | "defeat" | "draw";
  title?: string;
  lines?: readonly ResultLine[];
  entries?: readonly MenuEntry[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  onActivate?: (id: string) => void;
  className?: string;
}) {
  const outcomeColor =
    outcome === "victory" ? "var(--jg-accent)" : outcome === "defeat" ? "var(--jg-danger)" : "var(--jg-text-dim)";
  const defaultTitle = outcome === "victory" ? "Victory" : outcome === "defeat" ? "Defeat" : "Draw";
  return (
    <div
      className={`pointer-events-auto absolute inset-0 overflow-hidden ${className ?? ""}`}
      data-jg="results-screen"
    >
      <div aria-hidden className="absolute inset-0" style={{ background: OVERLAY_BACKGROUND }} />
      <div className="relative flex h-full w-full flex-col items-center justify-center gap-7">
        <h1
          className="m-0 text-[44px] font-extrabold uppercase tracking-[0.32em]"
          style={{
            fontFamily: "var(--jg-font-display)",
            color: outcomeColor,
            textShadow: HUD_TEXT_SHADOW,
            animation: "jg-slide-down 0.5s ease-out",
          }}
        >
          {title ?? defaultTitle}
        </h1>
        <AccentRule width={320} />
        {lines !== undefined && lines.length > 0 && (
          <div className="grid gap-x-10 gap-y-2.5" style={{ gridTemplateColumns: "1fr auto" }}>
            {lines.map((line, index) => {
              const color = line.accent === true ? "var(--jg-accent)" : "var(--jg-text)";
              const delay = `${index * 90}ms`;
              return (
                <Fragment key={`${line.label}-${index}`}>
                  <span
                    className="text-[10px] font-bold uppercase tracking-[0.24em]"
                    style={{
                      fontFamily: "var(--jg-font-display)",
                      color: "var(--jg-text-dim)",
                      textShadow: HUD_TEXT_SHADOW,
                      animation: "jg-slide-up 0.4s ease-out",
                      animationDelay: delay,
                      animationFillMode: "backwards",
                    }}
                  >
                    {line.label}
                  </span>
                  <span
                    className="text-right font-mono text-[16px] font-bold"
                    style={{
                      color,
                      animation: "jg-slide-up 0.4s ease-out",
                      animationDelay: delay,
                      animationFillMode: "backwards",
                    }}
                  >
                    {line.value}
                  </span>
                </Fragment>
              );
            })}
          </div>
        )}
        {entries !== undefined && (
          <MenuList entries={entries} selectedId={selectedId} onSelect={onSelect} onActivate={onActivate} />
        )}
      </div>
    </div>
  );
}

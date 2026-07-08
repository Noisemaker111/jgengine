import type { ReactNode } from "react";

const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

function HudLabel({ children }: { children: ReactNode }) {
  return (
    <span
      className="text-[10px] font-bold uppercase tracking-[0.24em]"
      style={{ fontFamily: "var(--jg-font-display)", color: "var(--jg-text-dim)", textShadow: HUD_TEXT_SHADOW }}
    >
      {children}
    </span>
  );
}

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

export function SettingsGroup({
  title,
  children,
  width,
  className,
}: {
  title: string;
  children?: ReactNode;
  width?: number | string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-3 ${className ?? ""}`} data-jg="settings-group" style={{ width }}>
      <div className="flex flex-col gap-1.5">
        <HudLabel>{title}</HudLabel>
        <AccentRule width={60} />
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

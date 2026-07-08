import type { CSSProperties, ReactNode } from "react";

const SURFACE_TEXTURE =
  "repeating-linear-gradient(135deg, rgba(255,255,255,0.016) 0px, rgba(255,255,255,0.016) 1px, transparent 1px, transparent 7px), linear-gradient(180deg, var(--jg-surface) 0%, var(--jg-surface-deep) 100%)";

const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

function CornerBracket({ corner }: { corner: "tl" | "tr" | "bl" | "br" }) {
  const edgeStyle: CSSProperties =
    corner === "tl"
      ? { top: -1, left: -1, borderTop: "2px solid var(--jg-accent)", borderLeft: "2px solid var(--jg-accent)" }
      : corner === "tr"
        ? { top: -1, right: -1, borderTop: "2px solid var(--jg-accent)", borderRight: "2px solid var(--jg-accent)" }
        : corner === "bl"
          ? { bottom: -1, left: -1, borderBottom: "2px solid var(--jg-accent)", borderLeft: "2px solid var(--jg-accent)" }
          : { bottom: -1, right: -1, borderBottom: "2px solid var(--jg-accent)", borderRight: "2px solid var(--jg-accent)" };
  return <span aria-hidden className="pointer-events-none absolute h-3.5 w-3.5" style={edgeStyle} />;
}

export function HudPanel({
  title,
  actions,
  width,
  className,
  style,
  children,
}: {
  title?: string;
  actions?: ReactNode;
  width?: number | string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <section
      className={`relative pointer-events-auto ${className ?? ""}`}
      data-jg="panel"
      style={{
        width,
        background: SURFACE_TEXTURE,
        border: "1px solid var(--jg-edge)",
        boxShadow: "0 10px 30px rgba(0,0,0,0.65), inset 0 0 40px rgba(0,0,0,0.45)",
        color: "var(--jg-text)",
        fontFamily: "var(--jg-font-body)",
        ...style,
      }}
    >
      <CornerBracket corner="tl" />
      <CornerBracket corner="tr" />
      <CornerBracket corner="bl" />
      <CornerBracket corner="br" />
      {title !== undefined && (
        <header
          className="flex items-center justify-between gap-3 px-3.5 py-2"
          style={{
            background: "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0.25) 100%)",
            borderBottom: "1px solid var(--jg-edge)",
          }}
        >
          <h2
            className="m-0 text-[13px] font-bold uppercase tracking-[0.22em]"
            style={{
              fontFamily: "var(--jg-font-display)",
              color: "var(--jg-accent)",
              textShadow: HUD_TEXT_SHADOW,
            }}
          >
            {title}
          </h2>
          {actions}
        </header>
      )}
      <div className="p-3">{children}</div>
    </section>
  );
}

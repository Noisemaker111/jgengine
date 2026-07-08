import { useInsertionEffect, type CSSProperties, type ReactNode } from "react";
import { useGameUiTheme, type GameUiTheme } from "./theme";

const KEYFRAMES_ID = "jgui-keyframes";

const KEYFRAMES_CSS = `
@keyframes jgui-float-up { from { transform: translateY(0); opacity: 1; } to { transform: translateY(-46px); opacity: 0; } }
@keyframes jgui-pop { 0% { transform: scale(0.4); opacity: 0; } 60% { transform: scale(1.18); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
@keyframes jgui-flash { 0% { opacity: 0.9; } 100% { opacity: 0; } }
@keyframes jgui-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
@keyframes jgui-sheen { from { background-position: -160px 0; } to { background-position: 260px 0; } }
@keyframes jgui-shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-3px); } 40% { transform: translateX(3px); } 60% { transform: translateX(-2px); } 80% { transform: translateX(2px); } }
@keyframes jgui-slide-down { from { transform: translateY(-18px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes jgui-slide-up { from { transform: translateY(14px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes jgui-widen { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes jgui-ready-glow { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.45); } }
@keyframes jgui-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`;

let keyframesInjected = false;

export function useGameUiKeyframes(): void {
  useInsertionEffect(() => {
    if (keyframesInjected || typeof document === "undefined") return;
    if (document.getElementById(KEYFRAMES_ID) !== null) {
      keyframesInjected = true;
      return;
    }
    const style = document.createElement("style");
    style.id = KEYFRAMES_ID;
    style.textContent = KEYFRAMES_CSS;
    document.head.appendChild(style);
    keyframesInjected = true;
  }, []);
}

export function chamfer(cut: number): string {
  return `polygon(${cut}px 0, calc(100% - ${cut}px) 0, 100% ${cut}px, 100% calc(100% - ${cut}px), calc(100% - ${cut}px) 100%, ${cut}px 100%, 0 calc(100% - ${cut}px), 0 ${cut}px)`;
}

export function slantBar(lean: number): string {
  return `polygon(${lean}px 0, 100% 0, calc(100% - ${lean}px) 100%, 0 100%)`;
}

export function edgeNotch(cut: number): string {
  return `polygon(0 0, calc(100% - ${cut}px) 0, 100% ${cut}px, 100% 100%, ${cut}px 100%, 0 calc(100% - ${cut}px))`;
}

export function bevelShadow(): string {
  return "inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -2px 3px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.6)";
}

export function surfaceTexture(theme: GameUiTheme): string {
  return `repeating-linear-gradient(135deg, rgba(255,255,255,0.016) 0px, rgba(255,255,255,0.016) 1px, transparent 1px, transparent 7px), linear-gradient(180deg, ${theme.surface} 0%, ${theme.surfaceDeep} 100%)`;
}

export function hudTextShadow(): string {
  return "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";
}

export function formatTimer(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function padScore(value: number, digits = 6): string {
  return String(Math.max(0, Math.floor(value))).padStart(digits, "0");
}

export function clampFraction(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function CornerBracket({ corner, color }: { corner: "tl" | "tr" | "bl" | "br"; color: string }) {
  const size = 14;
  const thickness = 2;
  const base: CSSProperties = { position: "absolute", width: size, height: size, pointerEvents: "none" };
  const edges: CSSProperties =
    corner === "tl"
      ? { top: -1, left: -1, borderTop: `${thickness}px solid ${color}`, borderLeft: `${thickness}px solid ${color}` }
      : corner === "tr"
        ? { top: -1, right: -1, borderTop: `${thickness}px solid ${color}`, borderRight: `${thickness}px solid ${color}` }
        : corner === "bl"
          ? { bottom: -1, left: -1, borderBottom: `${thickness}px solid ${color}`, borderLeft: `${thickness}px solid ${color}` }
          : { bottom: -1, right: -1, borderBottom: `${thickness}px solid ${color}`, borderRight: `${thickness}px solid ${color}` };
  return <span style={{ ...base, ...edges }} />;
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
  const theme = useGameUiTheme();
  return (
    <section
      className={className}
      data-jgui="panel"
      style={{
        position: "relative",
        width,
        background: surfaceTexture(theme),
        border: `1px solid ${theme.edge}`,
        boxShadow: "0 10px 30px rgba(0,0,0,0.65), inset 0 0 40px rgba(0,0,0,0.45)",
        color: theme.textPrimary,
        fontFamily: theme.fontBody,
        pointerEvents: "auto",
        ...style,
      }}
    >
      <CornerBracket corner="tl" color={theme.accent} />
      <CornerBracket corner="tr" color={theme.accent} />
      <CornerBracket corner="bl" color={theme.accent} />
      <CornerBracket corner="br" color={theme.accent} />
      {title !== undefined && (
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "8px 14px",
            background: `linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0.25) 100%)`,
            borderBottom: `1px solid ${theme.edge}`,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily: theme.fontDisplay,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: theme.accent,
              textShadow: hudTextShadow(),
            }}
          >
            {title}
          </h2>
          {actions}
        </header>
      )}
      <div style={{ padding: 12 }}>{children}</div>
    </section>
  );
}

export function KeybindBadge({ label, size = "md", className }: { label: string; size?: "sm" | "md"; className?: string }) {
  const theme = useGameUiTheme();
  const dims = size === "sm" ? { minWidth: 15, height: 15, fontSize: 9, padding: "0 3px" } : { minWidth: 20, height: 20, fontSize: 11, padding: "0 5px" };
  return (
    <kbd
      className={className}
      data-jgui="keybind"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        ...dims,
        fontFamily: theme.fontNumeric,
        fontWeight: 700,
        textTransform: "uppercase",
        color: theme.textPrimary,
        background: `linear-gradient(180deg, ${theme.edgeBright} 0%, ${theme.edge} 8%, ${theme.surface} 90%)`,
        border: `1px solid ${theme.edgeBright}`,
        borderBottomWidth: 2,
        clipPath: chamfer(3),
        lineHeight: 1,
      }}
    >
      {label}
    </kbd>
  );
}

export function HudLabel({ children, className }: { children: ReactNode; className?: string }) {
  const theme = useGameUiTheme();
  return (
    <span
      className={className}
      style={{
        fontFamily: theme.fontDisplay,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.24em",
        textTransform: "uppercase",
        color: theme.textDim,
        textShadow: hudTextShadow(),
      }}
    >
      {children}
    </span>
  );
}

export function AccentRule({ width = 120, className }: { width?: number | string; className?: string }) {
  const theme = useGameUiTheme();
  return (
    <span
      className={className}
      style={{
        display: "block",
        width,
        height: 2,
        background: `linear-gradient(90deg, transparent 0%, ${theme.accent} 18%, ${theme.accent} 82%, transparent 100%)`,
        boxShadow: `0 0 8px ${theme.accentGlow}`,
      }}
    />
  );
}

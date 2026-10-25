import { forwardRef, type CSSProperties, type HTMLAttributes, type ReactNode, type Ref } from "react";
import { GameFrame, gameCutPath, type GameCut, type GameFrameProps } from "@jgengine/react/gameFrame";

/**
 * Scrap Signal's salvaged hardware: carbon and riveted hull housings with welded rims, CRT screens
 * with phosphor text, segmented pip gauges and stamped labels. Every piece is drawn in code from the
 * engine's generated materials; nothing is a web card.
 */

/** Menu-nav item props re-typed against this game's React types (the engine package resolves its own copy). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function navItem<P extends { ref: unknown }>(props: P): Omit<P, "ref"> & { ref: Ref<any> } {
  return props as never;
}

/** Phosphor and hazard colours of a reclaimer's kit. */
export const SIGNAL = {
  phosphor: "#9ff5d6",
  phosphorDim: "#4f8f7c",
  amber: "#ffb400",
  red: "#ff4a3a",
  shield: "#4cc3ff",
  xp: "#8ee43e",
  rim: "#6f5a3c",
  rimHot: "#ffb400",
} as const;

type PlateProps = Omit<GameFrameProps, "material" | "edge" | "edgeWidth" | "shadow" | "glow"> & {
  material?: "carbon" | "hull" | "steel";
  /** Welded rim colour, drawn as a backing plate under the cut (no filter). */
  rim?: string;
  rimWidth?: number;
};

/**
 * A salvaged housing: a generated carbon or hull plate cut to shape, sitting on a welded rim. The rim
 * is a backing plate clipped to the same cut, never GameFrame's drop-shadow filter: a filter is
 * re-rasterised every time a readout changes, and these readouts change every shot over a live scene.
 */
export const Plate = forwardRef<HTMLElement, PlateProps>(function Plate(
  { material = "carbon", cut = "chamfer", depth = 10, rim = SIGNAL.rim, rimWidth = 2, className, style, ...rest },
  ref,
) {
  return (
    <GameFrame
      ref={ref}
      {...rest}
      material={material}
      cut={cut}
      depth={depth}
      edge="none"
      edgeWidth={0}
      shadow={false}
      className={`ss-plate ${className ?? ""}`}
      style={{ "--ss-cut": gameCutPath(cut as GameCut, depth), "--ss-rim": rim, "--ss-rim-w": `${rimWidth}px`, ...style } as CSSProperties}
    />
  );
});

/** A CRT screen set into a housing: phosphor glass, scanlines and a dark bezel lip. */
export function Crt({ children, className, tint, style, ...rest }: { children?: ReactNode; className?: string; tint?: string; style?: CSSProperties } & Omit<HTMLAttributes<HTMLDivElement>, "style">) {
  return (
    <div {...rest} className={`ss-crt ${className ?? ""}`} style={{ ...(tint === undefined ? {} : { "--ss-crt-tint": tint }), ...style } as CSSProperties}>
      {children}
    </div>
  );
}

/**
 * A segmented gauge: `count` pips, lit in proportion to `value / max`. Any value above zero lights at
 * least one pip, so a last sliver of health still shows.
 */
export function Pips({ value, max, count = 12, color, low = false, className }: { value: number; max: number; count?: number; color: string; low?: boolean; className?: string }) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const lit = value > 0 ? Math.max(1, Math.ceil(ratio * count - 0.001)) : 0;
  return (
    <span className={`ss-pips ${low ? "low" : ""} ${className ?? ""}`} style={{ "--ss-pip": color } as CSSProperties} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => <i key={i} data-lit={i < lit ? "" : undefined} />)}
    </span>
  );
}

/** A stamped label plate, like the stencilled tags riveted to salvage. */
export function Stamp({ children, tone = "amber", className }: { children: ReactNode; tone?: "amber" | "phosphor" | "red" | "dim"; className?: string }) {
  return <span className={`ss-stamp ss-stamp-${tone} ${className ?? ""}`}>{children}</span>;
}

/** A keycap glyph for control legends. */
export function Key({ children }: { children: ReactNode }) {
  return <kbd className="ss-key">{children}</kbd>;
}

/** Four signal-strength bars; `strength` 0-4. */
export function SignalBars({ strength, color = SIGNAL.phosphor }: { strength: number; color?: string }) {
  return (
    <svg className="ss-bars" width="22" height="16" viewBox="0 0 22 16" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={i * 5.5} y={12 - i * 4} width="4" height={4 + i * 4} fill={i < strength ? color : "rgba(255,255,255,0.14)"} />
      ))}
    </svg>
  );
}

/** A short burst of static drawn as an oscilloscope trace, for transmissions. */
export function Waveform({ color = SIGNAL.phosphor, seed = 3 }: { color?: string; seed?: number }) {
  const points = Array.from({ length: 24 }, (_, i) => {
    const y = 8 + Math.sin(i * 1.7 + seed) * (2 + ((i * seed) % 5));
    return `${i * 3},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg className="ss-wave" width="72" height="16" viewBox="0 0 72 16" aria-hidden="true">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

/** The broadcast wordmark: Russo One split across the red and cyan guns of a bad tube. */
export function SignalWordmark({ className }: { className?: string }) {
  return (
    <span className={`ss-wordmark ${className ?? ""}`} data-text="SCRAP SIGNAL">
      SCRAP SIGNAL
    </span>
  );
}

import { forwardRef, type CSSProperties, type ReactNode, type Ref } from "react";
import { GameFrame, type GameFrameProps } from "@jgengine/react/gameFrame";
import type { GameIconName } from "@jgengine/react/gameIcons";
import type { NeedId } from "../../needs/needs";
import { NEED_COLORS } from "../../palette";

/** Menu-nav item props re-typed against this game's React types (the engine package resolves its own copy). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function navItem<P extends { ref: unknown }>(props: P): Omit<P, "ref"> & { ref: Ref<any> } {
  return props as never;
}

/**
 * Odd Orbit's household objects: rounded enamel fridge magnets and appliance plates, pinned paper
 * notes, and the habitat's 24-hour wall clock. Everything is a generated material from the engine's
 * `GameFrame`, never a web card.
 */

/** Plum ink: what a pastel magnet or a paper note is written in. */
export const ORBIT_INK = "#3a2140";

/** The household's enamel colours, sampled from the dusk habitat. */
export const ENAMEL = {
  cream: "#fff0d6",
  pink: "#f6a6cf",
  mint: "#9fe0c4",
  butter: "#ffd98a",
  sky: "#a9cdf5",
  lilac: "#c9b0f2",
  coral: "#ff9e8c",
  plum: "#5b3a6e",
} as const;
export type EnamelTone = keyof typeof ENAMEL;

/** The game icon for each need, used on magnets, rings and the furnishing catalogue. */
export const NEED_ICON: Record<NeedId, GameIconName> = { hunger: "apple", energy: "feather", social: "heart", fun: "star" };

type EnamelProps = Omit<GameFrameProps, "material" | "cut" | "tint"> & {
  tone?: EnamelTone;
  /** A colour outside the household set (a member's own hue). */
  tint?: string;
  /** Corner roundness in px. A magnet is rounder than a plate. */
  radius?: number;
  /** Ink colour; plum on pastels, cream on plum. */
  ink?: string;
};

/** A rounded enamel magnet or plate. `as="button"` makes it a pressable household control. */
export const Enamel = forwardRef<HTMLElement, EnamelProps>(function Enamel(
  { tone = "cream", tint, radius = 18, ink, edge = "#2a1733", edgeWidth = 2, glow, className, style, ...rest },
  ref,
) {
  const color = tint ?? ENAMEL[tone];
  const text = ink ?? (tone === "plum" ? "#fff0d6" : ORBIT_INK);
  // The rim, lip and cast shadow are a CSS border and box shadows on the rounded face (style.css), not
  // GameFrame's filter rim: a filter is re-rasterised whenever a magnet's number changes, and the HUD
  // magnets change every second over a live 3D scene.
  return (
    <GameFrame
      ref={ref}
      {...rest}
      material="enamel"
      cut="box"
      tint={color}
      edge="none"
      edgeWidth={0}
      shadow={false}
      className={`orbit-round ${glow !== undefined ? "orbit-glow" : ""} ${className ?? ""}`}
      style={{ "--orbit-r": `${radius}px`, "--orbit-rim": edge, "--orbit-rim-w": `${edgeWidth}px`, "--orbit-glow": glow, "--jg-gf-ink": text, color: text, ...style } as CSSProperties}
    />
  );
});

/** A paper note held to the habitat wall with a pushpin. */
export function PaperNote({ children, className, style, tilt = 0, pin = "#f6a6cf", torn = false, padding, ...rest }: {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  tilt?: number;
  pin?: string | null;
  torn?: boolean;
  padding?: CSSProperties["padding"];
} & Omit<GameFrameProps, "material" | "cut" | "children" | "padding">) {
  return (
    <div className={`orbit-note ${className ?? ""}`} style={{ rotate: `${tilt}deg`, ...style }}>
      <GameFrame material="paper" cut={torn ? "torn" : "box"} depth={12} edge="#6b4c3a" edgeWidth={1} padding={padding ?? "22px 22px 26px"} {...rest} className="orbit-note-paper">
        {children}
      </GameFrame>
      {pin !== null && <Pushpin color={pin} />}
    </div>
  );
}

/** A round plastic pushpin, drawn. */
export function Pushpin({ color = "#f6a6cf" }: { color?: string }) {
  return (
    <svg className="orbit-pin" width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <ellipse cx="14" cy="17" rx="8" ry="4" fill="rgba(0,0,0,0.25)" />
      <circle cx="13" cy="12" r="9" fill={color} stroke="#2a1733" strokeWidth="1.5" />
      <circle cx="10" cy="9" r="3" fill="rgba(255,255,255,0.65)" />
    </svg>
  );
}

/** Four arcs around a portrait, one per need: the household's mood ring. */
export function NeedRing({ needs, size = 52, children }: { needs: Readonly<Record<NeedId, number>>; size?: number; children?: ReactNode }) {
  const r = size / 2 - 3;
  const c = size / 2;
  const order: NeedId[] = ["hunger", "energy", "social", "fun"];
  const arc = (start: number, sweep: number) => {
    const a0 = ((start - 90) * Math.PI) / 180;
    const a1 = ((start + sweep - 90) * Math.PI) / 180;
    const large = sweep > 180 ? 1 : 0;
    return `M ${c + r * Math.cos(a0)} ${c + r * Math.sin(a0)} A ${r} ${r} 0 ${large} 1 ${c + r * Math.cos(a1)} ${c + r * Math.sin(a1)}`;
  };
  return (
    <span className="orbit-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        {order.map((need, i) => {
          // Stepped to 5% so the ring redraws a few times a minute, not every frame under its enamel rim.
          const value = Math.round(Math.max(0, Math.min(100, needs[need] ?? 0)) / 5) * 5;
          const start = i * 90 + 6;
          return (
            <g key={need}>
              <path d={arc(start, 78)} stroke="rgba(42,23,51,0.28)" strokeWidth="4" fill="none" strokeLinecap="round" />
              {value > 1 && <path d={arc(start, (78 * value) / 100)} stroke={value < 30 ? "#ff6b7d" : NEED_COLORS[need]} strokeWidth="4" fill="none" strokeLinecap="round" />}
            </g>
          );
        })}
      </svg>
      <span className="orbit-ring-face">{children}</span>
    </span>
  );
}

/** The day's rhythm on a 24-hour dial: torpor, Yield, Bloom and bonding hours. */
const DIAL_PHASES: readonly { from: number; to: number; color: string }[] = [
  { from: 22, to: 32, color: "#5b4a7a" },
  { from: 8, to: 14, color: "#ffc76e" },
  { from: 14, to: 18, color: "#8fdcb8" },
  { from: 18, to: 22, color: "#f6a6cf" },
];

/** The habitat's wall clock: a 24-hour enamel dial with one hand and the shift hours painted on. */
export function WallClock({ hour, minute, size = 76 }: { hour: number; minute: number; size?: number }) {
  const c = 50;
  // Midnight at the foot, noon at the crown; hours run clockwise.
  const at = (h: number, r: number): [number, number] => {
    const theta = ((h / 24) * 360 + 180) * (Math.PI / 180);
    return [c + r * Math.sin(theta), c - r * Math.cos(theta)];
  };
  const wedge = (from: number, to: number, r: number) => {
    const [x0, y0] = at(from, r);
    const [x1, y1] = at(to, r);
    return `M ${c} ${c} L ${x0} ${y0} A ${r} ${r} 0 ${to - from > 12 ? 1 : 0} 1 ${x1} ${y1} Z`;
  };
  const angle = ((hour + minute / 60) / 24) * 360 + 180;
  return (
    <svg className="orbit-clock-face" width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`}>
      <circle cx="50" cy="52" r="47" fill="rgba(0,0,0,0.3)" />
      <circle cx="50" cy="50" r="47" fill="#fff0d6" stroke="#2a1733" strokeWidth="3" />
      {DIAL_PHASES.map((phase) => <path key={phase.from} d={wedge(phase.from, phase.to, 38)} fill={phase.color} opacity="0.85" />)}
      <circle cx="50" cy="50" r="26" fill="#fff0d6" />
      {Array.from({ length: 24 }, (_, i) => {
        const long = i % 6 === 0;
        const [x1, y1] = at(i, 44);
        const [x2, y2] = at(i, long ? 37 : 41);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#2a1733" strokeWidth={long ? 2.6 : 1.2} strokeLinecap="round" />;
      })}
      <path d="M 50 50 L 50 14" stroke="#2a1733" strokeWidth="4" strokeLinecap="round" transform={`rotate(${angle} 50 50)`} />
      <circle cx="50" cy="50" r="5" fill="#f6a6cf" stroke="#2a1733" strokeWidth="2" />
      <path d="M 22 18 A 40 40 0 0 1 60 10" stroke="rgba(255,255,255,0.7)" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** The household's moving-in sign: the game's wordmark with a little planet in orbit. */
export function OrbitWordmark({ size = 1 }: { size?: number }) {
  return (
    <span className="orbit-wordmark" style={size === 1 ? undefined : { fontSize: `${size}em` }}>
      <svg className="orbit-wordmark-ring" viewBox="0 0 200 60" aria-hidden="true">
        <ellipse cx="100" cy="30" rx="96" ry="22" fill="none" stroke="#f6a6cf" strokeWidth="3" strokeDasharray="6 7" transform="rotate(-8 100 30)" />
        <circle cx="186" cy="16" r="7" fill="#ffd98a" stroke="#2a1733" strokeWidth="2" />
      </svg>
      <span>Odd</span><span>Orbit</span>
    </span>
  );
}

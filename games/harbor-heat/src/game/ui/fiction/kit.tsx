import { useEffect, useRef, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { useDisplayProfile } from "@jgengine/react/display";
import { createGameMenuSound, type GameMenuSound } from "@jgengine/react/gameMenuSound";
import { useGameContext } from "@jgengine/react/provider";
import { activeTouchControlsMode, setTouchControlsMode } from "@jgengine/core/input/touchControlsMode";

/**
 * Mainsail's street hardware, drawn in code: the amber-backlit LCD of a burner phone and a courier
 * pager, green enamel street signs, a roadside neon sign and its marquee letter board, keycaps.
 * Nothing here is a web card; each piece is something a courier in the harbor town holds or passes.
 */

/** Mainsail at sundown: harbor-night teal, cream card stock, amber backlight, coral neon. */
export const HH = {
  night: "#071d25",
  ink: "#0e2c38",
  teal: "#155462",
  mint: "#76d4c3",
  cream: "#fff0d2",
  amber: "#ffb020",
  coral: "#ef5a3c",
  lcdInk: "#2a1704",
  sign: "#0f6a43",
  hhpd: "#4f7de8",
  siren: "#e8343b",
  cash: "#8fe39a",
} as const;

/**
 * Menu-nav item props with the ref loosened: the engine package resolves its own copy of React's
 * types, so its ref type and the game's are nominally different even though they are the same ref.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function navItem<P extends { ref: unknown }>(props: P): Omit<P, "ref"> & { ref: any } {
  return props as never;
}

/**
 * The click generator for one mounted Harbor menu. It opens its audio context on first play and
 * closes it when the menu unmounts, so nothing outlives the screen that owns it.
 */
export function useMenuSound(): Pick<GameMenuSound, "play"> {
  const player = useRef<GameMenuSound | null>(null);
  useEffect(() => () => {
    player.current?.dispose();
    player.current = null;
  }, []);
  const api = useRef<Pick<GameMenuSound, "play"> | null>(null);
  api.current ??= {
    play: (kind) => {
      player.current ??= createGameMenuSound({ volume: 0.04 });
      player.current.play(kind);
    },
  };
  return api.current;
}

/** Ticks once each time the highlighted item changes (not on mount). */
export function useMoveTick(activeId: string | null, enabled = true): void {
  const last = useRef(activeId);
  const sound = useMenuSound();
  useEffect(() => {
    if (last.current !== activeId && enabled && activeId !== null) sound.play("move");
    last.current = activeId;
  }, [activeId, enabled, sound]);
}

const PORTRAIT = "(orientation: portrait)";
function subscribePortrait(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
  const query = window.matchMedia(PORTRAIT);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const portraitNow = (): boolean => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(PORTRAIT).matches;

/**
 * How much room the screen has: "wide" for a desk or TV, "short" for a phone held sideways (or any
 * squat window), "stacked" for a phone held upright, where everything goes in one column.
 */
export function useRoom(): "wide" | "short" | "stacked" {
  const compact = useDisplayProfile().compact;
  const portrait = useSyncExternalStore(subscribePortrait, portraitNow, () => false);
  return !compact ? "wide" : portrait ? "stacked" : "short";
}

/** A printed key on a keyboard or keypad. */
export function KeyCap({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <kbd className={`hh-keycap ${wide ? "wide" : ""}`}>{children}</kbd>;
}

/** A row of keycaps with a short caption, for control legends. */
export function KeyLegend({ items }: { items: readonly { keys: readonly string[]; label: string }[] }) {
  return (
    <span className="hh-legend">
      {items.map((item) => (
        <span key={item.label}>
          {item.keys.map((key) => <KeyCap key={key} wide={key.length > 2}>{key}</KeyCap>)}
          <small>{item.label}</small>
        </span>
      ))}
    </span>
  );
}

/** The amber-backlit LCD of a phone or pager: pixel grid, edge shading and a coral alarm backlight. */
export function Lcd({ children, alarm = false, className, style }: { children?: ReactNode; alarm?: boolean; className?: string; style?: CSSProperties }) {
  return (
    <div className={`hh-lcd ${className ?? ""}`} data-alarm={alarm ? "" : undefined} style={style}>
      {children}
    </div>
  );
}

/** Four signal bars, lit to `strength` (0-4). */
export function SignalBars({ strength = 3 }: { strength?: number }) {
  return (
    <svg className="hh-bars" width="18" height="12" viewBox="0 0 18 12" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => <rect key={i} x={i * 4.6} y={9 - i * 3} width="3.4" height={3 + i * 3} opacity={i < strength ? 1 : 0.22} />)}
    </svg>
  );
}

/** A battery glyph with `level` bars of three. */
export function Battery({ level = 3 }: { level?: number }) {
  return (
    <span className="hh-battery" aria-hidden="true">
      {[0, 1, 2].map((i) => <i key={i} data-on={i < level ? "" : undefined} />)}
    </span>
  );
}

/** A green enamel street-name sign, white-rimmed, as bolted to every Mainsail corner. */
export function StreetSign({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={`hh-street ${className ?? ""}`}>
      <b>{children}</b>
    </span>
  );
}

/** Two-digit game clock from the world calendar. */
export function clockText(hour: number, minute: number): string {
  return `${String(Math.floor(hour)).padStart(2, "0")}:${String(Math.floor(minute)).padStart(2, "0")}`;
}

/** Signed thousands with a dollar sign: 1420 → "$1,420". */
export const money = (amount: number): string => `$${Math.round(amount).toLocaleString("en-US")}`;

/**
 * While a full-screen moment (a counter, a talk, a receipt) is up, the touch stick and verb buttons
 * step aside so they never sit on its buttons; the mode that was active comes back when it closes.
 */
export function useScreenTouch(active = true): void {
  const ctx = useGameContext();
  useEffect(() => {
    if (!active) return;
    const before = activeTouchControlsMode(ctx);
    setTouchControlsMode(ctx, "screen");
    return () => {
      if (activeTouchControlsMode(ctx) === "screen") setTouchControlsMode(ctx, before);
    };
  }, [ctx, active]);
}

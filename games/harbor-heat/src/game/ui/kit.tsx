/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useMemo, useRef, type ReactNode } from "@jgengine/core/ui/jsx";
import { RuneAction, RuneLabel, RuneView, type RuneActionProps, type RuneViewProps } from "@jgengine/core/ui/rune/primitives.view";
import { bind } from "@jgengine/core/ui/rune/primitives";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import type { RuneElementProps } from "@jgengine/core/ui/rune/element";
import { readLive, type Live, type LiveValue } from "@jgengine/core/ui/liveValue";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { createGameMenuSound, type GameMenuSound } from "@jgengine/core/menu/gameMenuSound.view";
import { useGameContext } from "@jgengine/ui/provider";
import { activeTouchControlsMode, setTouchControlsMode } from "@jgengine/core/input/touchControlsMode";
import { harborTheme, HH } from "./theme";

/**
 * Mainsail's street hardware as Rune compositions: the amber LCD of a burner phone and a courier
 * pager, enamel stamp buttons, keycaps, card stock. Each piece is something a courier holds.
 */

type TextProps = Omit<RuneElementProps, "text"> & { text?: Live<string> };
export function Text({ text, ...props }: TextProps) {
  return <RuneLabel {...props} {...(text === undefined ? {} : { value: text })} />;
}
export function Label(props: TextProps) { return <Text {...harborTheme.text.label} {...props} />; }
export function Display(props: TextProps) { return <Text {...harborTheme.text.display} {...props} />; }
export function Heading(props: TextProps) { return <Text {...harborTheme.text.heading} {...props} />; }
export function LcdText(props: TextProps) { return <Text {...harborTheme.text.lcd} {...props} />; }
export function Row(props: RuneViewProps) { return <RuneView layout="row" gap={8} items="center" {...props} />; }

export type Tone = "amber" | "ink" | "coral";
const TONE_VARIANT: Record<Tone, string> = { amber: "action", ink: "quiet", coral: "danger" };
const TONE_TEXT: Record<Tone, string> = { amber: HH.night, ink: HH.cream, coral: HH.night };

/** An enamel stamp button; its text colour follows the enamel. */
export function Button({ tone = "amber", onPress, children, ...props }: RuneActionProps & { tone?: Tone; onPress?: () => void }) {
  const sound = useMenuSound();
  return (
    <RuneAction variant={TONE_VARIANT[tone]} family={harborTheme.text.heading.family} size={18} tracking={0.8} color={TONE_TEXT[tone]}
      {...props} {...(onPress === undefined ? {} : { run: () => { sound.play("confirm"); onPress(); } })}>{children}</RuneAction>
  );
}

/** A printed key on a keyboard or keypad. */
export function KeyCap({ children }: { children: string }) {
  return <RuneView variant="key"><Text mono size={12} weight={700} color={HH.night} text={children} /></RuneView>;
}

/** A row of keycaps with a caption, for the control legends under a menu. */
export function KeyLegend({ items }: { items: readonly { keys: readonly string[]; label: string }[] }) {
  return (
    <Row gap={14}>
      {items.map((item) => <Row key={item.label} gap={4}>{item.keys.map((key) => <KeyCap key={key}>{key}</KeyCap>)}<Label text={item.label} /></Row>)}
    </Row>
  );
}

/** The amber-backlit LCD of a phone or pager; the backlight turns coral on an alarm. */
export function Lcd({ alarm, children, ...props }: RuneViewProps & { alarm?: Live<boolean> }) {
  const fill = alarm === undefined ? HH.lcd : bind(() => (readLive(alarm) ? HH.lcdAlarm : HH.lcd));
  return <RuneView variant="lcd" fill={fill} color={HH.lcdInk} {...props}>{children}</RuneView>;
}

/** A green enamel street-name sign. */
export function StreetSign({ text }: { text: Live<string> }) {
  return (
    <RuneView fill={HH.sign} border={{ width: 2, color: HH.cream }} radius={4} padding={[3, 10, 2, 10]} items="center">
      <Text family={harborTheme.text.heading.family} size={15} tracking={1} color={HH.cream} text={text} />
    </RuneView>
  );
}

/** A full-screen dim over the city that takes the input; Escape or B runs `back`. */
export function Scrim({ back, children, ...props }: RuneViewProps & { back?: (() => void) | undefined }) {
  return <RuneView anchor="fill" fill={HH.scrim} modal {...(back === undefined ? {} : { onBack: back })} justify="center" items="center" {...props}>{children}</RuneView>;
}

/** Desk, phone held sideways, or phone held upright. */
export function useRoom(): "wide" | "short" | "stacked" {
  const { width, height } = useRuneViewport();
  if (width >= 900 && height >= 560) return "wide";
  return height > width ? "stacked" : "short";
}

/** Two-digit game clock from the world calendar. */
export function clockText(hour: number, minute: number): string {
  return `${String(Math.floor(hour)).padStart(2, "0")}:${String(Math.floor(minute)).padStart(2, "0")}`;
}

/** Whole dollars with thousands: 1420 → "$1,420". */
export const money = (amount: number): string => `$${Math.round(amount).toLocaleString("en-US")}`;

/** `m:ss` for a countdown in seconds. */
export function formatCountdown(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** Calm, warn past half, urgent in the last quarter (or ten seconds). */
export function deadlineStage(deadline: { remaining: number; total: number }): "calm" | "warn" | "urgent" {
  if (deadline.remaining <= Math.max(10, deadline.total * 0.25)) return "urgent";
  if (deadline.remaining <= deadline.total / 2) return "warn";
  return "calm";
}

/** One read per store version, shared by every bound leaf that reads it in a frame. */
export function useVersioned<T>(read: (ctx: GameContext) => T): () => T {
  const ctx = useGameContext();
  return useMemo(() => {
    let version = -1;
    let value: T | undefined;
    return () => {
      const now = ctx.version();
      if (version !== now) { version = now; value = read(ctx); }
      return value as T;
    };
  }, [ctx]);
}

/** A bound opacity that dims to `dimTo` once `watch` has not changed for `idleMs`, and stays lit while `hold`. */
export function useIdleFade(watch: () => string, idleMs: number, dimTo: number, hold: () => boolean = () => false): LiveValue<number> {
  return useMemo(() => {
    let last = "";
    let changed = 0;
    return bind(() => {
      const now = performance.now();
      const next = watch();
      if (next !== last) { last = next; changed = now; }
      return hold() || now - changed < idleMs ? 1 : dimTo;
    });
  }, []);
}

/** The click generator for one mounted Harbor menu; its audio closes with the menu. */
export function useMenuSound(): Pick<GameMenuSound, "play"> {
  const player = useRef<GameMenuSound | null>(null);
  useEffect(() => () => { player.current?.dispose(); player.current = null; }, []);
  const api = useRef<Pick<GameMenuSound, "play"> | null>(null);
  api.current ??= { play: (kind) => { player.current ??= createGameMenuSound({ volume: 0.04 }); player.current.play(kind); } };
  return api.current;
}

/** While a counter, a talk or a receipt owns the screen, the touch stick and verbs step aside. */
export function useScreenTouch(active = true): void {
  const ctx = useGameContext();
  useEffect(() => {
    if (!active) return;
    const before = activeTouchControlsMode(ctx);
    setTouchControlsMode(ctx, "screen");
    return () => { if (activeTouchControlsMode(ctx) === "screen") setTouchControlsMode(ctx, before); };
  }, [ctx, active]);
}

/** A labelled pair on a card: small caption over a bold value. */
export function Field({ label, value, ink = HH.night }: { label: string; value: Live<string>; ink?: string }) {
  return <RuneView gap={1}><Label text={label} color={ink} /><Text weight={700} color={ink} text={value} /></RuneView>;
}

export type { ReactNode };

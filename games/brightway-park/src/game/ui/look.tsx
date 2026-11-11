/** @jsxImportSource @jgengine/core/ui/jsx */
import { createContext, useContext, type ReactNode } from "@jgengine/core/ui/jsx";
import { RuneAction, RuneLabel, RuneView, type RuneViewProps } from "@jgengine/core/ui/rune/primitives.view";
import { bind, type RuneTheme } from "@jgengine/core/ui/rune/primitives";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import type { RuneElementProps } from "@jgengine/core/ui/rune/element";
import type { Live } from "@jgengine/core/ui/liveValue";

import { hintRing, useHintTarget } from "./hintRing";

/** Brightway's fair-day palette, recut from the park sign: cream ticket stock, teal sign plates, gold rims, coral awnings. */
export const INK = "#21424a", PAPER = "#fff4da", CREAM = "#fff1cf", SAND = "#f2dfb2", TEAL = "#24535b", DEEP = "#1c3940";
export const GOLD = "#edbc5c", CORAL = "#ef7059", GOOD = "#2f8f68", BAD = "#c4462f", WARN = "#c98a22", PENCIL = "#587779", RING = "#ff5a3c";
export const FULL = { fraction: 1 } as const;
export const DISPLAY = "Lilita One", BODY = "Nunito";

export const parkTheme = {
  colors: { ink: INK, paper: PAPER, cream: CREAM, sand: SAND, teal: TEAL, deep: DEEP, gold: GOLD, coral: CORAL, good: GOOD, bad: BAD, warn: WARN, pencil: PENCIL, track: "#e3d3ab" },
  text: {
    body: { family: BODY, size: 14, color: INK },
    label: { family: BODY, size: 11, weight: 800, tracking: 1.1, color: PENCIL },
    heading: { family: DISPLAY, size: 22, color: INK },
    figure: { family: DISPLAY, size: 26, color: INK },
    title: { family: DISPLAY, size: 64, color: CREAM },
  },
  variants: {
    card: { padding: 14, gap: 8, fill: PAPER, radius: 14, border: { width: 2, color: GOLD }, shadow: { y: 3, blur: 10, color: "#14323855" } },
    board: { padding: 20, gap: 12, fill: "#1c3940f2", radius: 18, border: { width: 3, color: GOLD } },
    ticket: { minHeight: 38, padding: [7, 12, 7, 12], gap: 2, fill: CREAM, radius: 10, border: { width: 2, color: INK }, hover: "#21424a14", press: "#21424a2a", justify: "center", items: "center" },
    primary: { minHeight: 38, padding: [7, 12, 7, 12], gap: 2, fill: GOLD, radius: 10, border: { width: 2, color: INK }, hover: "#ffffff30", press: "#21424a2a", justify: "center", items: "center" },
    ghost: { minHeight: 34, padding: [6, 10, 6, 10], gap: 2, radius: 10, hover: "#21424a14", press: "#21424a2a", justify: "center", items: "center" },
    danger: { minHeight: 38, padding: [7, 12, 7, 12], gap: 2, fill: "#f6d2c6", radius: 10, border: { width: 2, color: BAD }, hover: "#ffffff30", press: "#21424a2a", justify: "center", items: "center" },
  },
  motion: { duration: 180, distance: 10, bounce: 0.1 },
} satisfies RuneTheme;

/** The same look with its motion stilled, for the Reduce motion setting. */
export const stillTheme = { ...parkTheme, motion: { duration: 0, distance: 0, bounce: 0 } } satisfies RuneTheme;

export function Text({ text, ...props }: Omit<RuneElementProps, "text"> & { text?: Live<string> }) { return <RuneLabel {...props} {...(text === undefined ? {} : { value: text })} />; }
export function Tag(props: Omit<RuneElementProps, "text"> & { text?: Live<string> }) { return <Text {...parkTheme.text.label} {...props} />; }
export function Heading(props: Omit<RuneElementProps, "text"> & { text?: Live<string> }) { return <Text {...parkTheme.text.heading} {...props} />; }
export function Row(props: RuneViewProps) { return <RuneView layout="row" gap={8} items="center" {...props} />; }
export function Card(props: RuneViewProps) { return <RuneView variant="card" {...props} />; }

export type Tone = "ticket" | "primary" | "ghost" | "danger";
/**
 * A fair ticket: the park's one button. `pressed` lights it gold; `hint` names it for the first
 * scenario's ring, which a bound border draws without re-rendering the HUD.
 */
export function Button({ tone = "ticket", pressed, hint, onPress, glyph, tooltip, children, ...props }: Omit<RuneViewProps, "tooltip"> & { tone?: Tone; pressed?: boolean; hint?: string; onPress?: () => void; glyph?: ReactNode; tooltip?: string | undefined }) {
  useHintTarget(hint);
  const variant = pressed === true ? "primary" : tone;
  const base = parkTheme.variants[variant] as { border?: { width: number; color: string } };
  const ring = hint === undefined ? {} : { border: bind(() => hintRing.pointed === hint ? { width: 3, color: RING } : base.border ?? { width: 0, color: "#00000000" }) };
  return <RuneAction variant={variant} {...ring} {...props} {...(tooltip === undefined ? {} : { tooltip })} {...(onPress === undefined ? {} : { run: onPress })}>
    {typeof children === "string" || typeof children === "number" ? <Text weight={800} align="center">{String(children)}</Text> : children}{glyph}
  </RuneAction>;
}

/** Label/value lines, shared by the inspector, the guest window and the park books. */
export function Rows({ rows }: { rows: readonly (readonly [string, string])[] }) {
  return <RuneView gap={3}>{rows.map(([label, value]) => <Row key={label} justify="between" gap={12}><Text size={13} color={PENCIL} shrink grow={1}>{label}</Text><Text size={13} weight={800} align="right">{value}</Text></Row>)}</RuneView>;
}

/** A labelled bar whose fill and readout follow `read` at the leaf. */
export function Meter({ label, read, max, readout, color }: { label: Live<string>; read: () => number; max: () => number; readout: (value: number) => string; color: Live<string> }) {
  return <RuneView gap={3} grow={1}>
    <Row justify="between"><Tag text={label} /><RuneLabel value={bind(read)} format={readout} size={12} weight={800} color={INK} /></Row>
    <RuneView height={7} width={FULL} fill="#e3d3ab" radius={4} clip><RuneView height={7} radius={4} fill={color} width={bind(() => ({ fraction: Math.max(0, Math.min(1, read() / Math.max(1e-6, max()))) }))} /></RuneView>
  </RuneView>;
}

/** − value + on one line. */
export function Stepper({ label, value, down, up, downLabel, upLabel, downDisabled, upDisabled }: { label: string; value: string; down: () => void; up: () => void; downLabel: string; upLabel: string; downDisabled?: boolean; upDisabled?: boolean }) {
  return <Row justify="between"><Text grow={1} shrink>{label}</Text><Row gap={4}>
    <Button tone="ticket" label={downLabel} minHeight={30} width={34} padding={2} disabled={downDisabled === true} onPress={down}>−</Button>
    <Text weight={800} minWidth={44} align="center">{value}</Text>
    <Button tone="ticket" label={upLabel} minHeight={30} width={34} padding={2} disabled={upDisabled === true} onPress={up}>+</Button>
  </Row></Row>;
}

/** A card with an eyebrow, a title and a close mark: the inspector, the books, the lab. */
/** The height the HUD leaves a side window: it shrinks above an open build palette. */
export const WindowRoom = createContext<number>(480);
export function Window({ eyebrow, title, close, closeLabel, children, footer }: { eyebrow: string; title: string; close: () => void; closeLabel: string; children?: ReactNode; footer?: ReactNode }) {
  const { width } = useRuneViewport(), phone = width < 600, room = useContext(WindowRoom);
  return <Card width={phone ? width - 24 : 320} maxHeight={room} label={title} gap={6}>
    <Row justify="between" items="start"><RuneView gap={1} grow={1} shrink><Tag>{eyebrow.toUpperCase()}</Tag><Heading>{title}</Heading></RuneView><Button tone="ghost" label={closeLabel} onPress={close}>×</Button></Row>
    <RuneView scroll gap={8} maxHeight={room - (footer === undefined ? 70 : 120)}>{children}</RuneView>
    {footer === undefined ? null : <Row gap={6} justify="start">{footer}</Row>}
  </Card>;
}

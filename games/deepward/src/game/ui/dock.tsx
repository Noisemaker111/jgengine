/** @jsxImportSource @jgengine/core/ui/jsx */
import type { ReactNode } from "@jgengine/core/ui/jsx";
import { RuneAction, RuneLabel, RuneView, type RuneViewProps } from "@jgengine/core/ui/rune/primitives.view";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import type { RuneTheme } from "@jgengine/core/ui/rune/primitives";
import type { RuneElementProps } from "@jgengine/core/ui/rune/element";

/** Candle gold on cocoa: the burrow's colours, readable over a dark house. */
export const GOLD = "#f2c46d", CREAM = "#fff3e0", MUTED = "#cdb79a", RED = "#ff7a5c", GREEN = "#9fe0a0", SKY = "#9fd3ff", COCOA = "#2a1d15";
export const FULL = { fraction: 1 };
export const crumbTheme = {
  colors: { accent: GOLD, signal: SKY, danger: RED, ink: CREAM, muted: MUTED, track: "#4a3628" },
  text: { body: { family: "Nunito", size: 16, color: CREAM }, label: { family: "Nunito", size: 12, weight: 700, tracking: 1.1, color: MUTED }, heading: { family: "Fredoka", size: 28, weight: 600, color: CREAM } },
  variants: {
    surface: { padding: 18, gap: 10, fill: "#2a1d15ee", border: { width: 2, color: "#7a5a3c" }, radius: 14 },
    action: { minHeight: 42, padding: [10, 16, 10, 16], fill: GOLD, border: { width: 2, color: "#ffe2a8" }, hover: "#ffffff30", press: "#00000025", radius: 12 },
  }, motion: { duration: 180, distance: 10, bounce: 0.15 },
} satisfies RuneTheme;
export function Text({ text, ...props }: RuneElementProps) { return <RuneLabel {...props} {...(text === undefined ? {} : { value: text })} />; }
export function Tag(props: RuneElementProps) { return <Text {...crumbTheme.text.label} {...props} />; }
export function Heading(props: RuneElementProps) { return <Text {...crumbTheme.text.heading} {...props} />; }
export function Section(props: RuneViewProps) { return <RuneView gap={8} padding={[10, 0, 10, 0]} {...props} />; }
export function Row(props: RuneViewProps) { return <RuneView layout="row" gap={10} items="center" {...props} />; }
export function Button({ onPress, ...props }: RuneViewProps) { return <RuneAction variant="action" color={COCOA} {...props} {...(onPress === undefined ? {} : { run: onPress })} />; }
export function Frame(props: RuneViewProps) { return <RuneView variant="surface" {...props} />; }
export function Meter({ value, color, height = 6 }: { value: NonNullable<RuneViewProps["width"]>; color: NonNullable<RuneViewProps["fill"]>; height?: number }) {
  return <RuneView height={height} fill="#4a3628" width={FULL} radius={height / 2}><RuneView height={height} width={value} fill={color} radius={height / 2} /></RuneView>;
}
export function Sheet({ children, title, close, label }: { children: ReactNode; title: string; close?: (() => void) | undefined; label?: string }) {
  const { width, height } = useRuneViewport();
  return <RuneView anchor="fill" fill="#120b07d8" modal {...(close === undefined ? {} : { onBack: close })}>
    <RuneView anchor="center" variant="surface" width={Math.min(720, width - 32)} maxHeight={height - 32} label={label ?? title} role="dialog">
      <Row justify="between" items="start"><Heading grow={1} shrink>{title}</Heading>{close === undefined ? null : <Button onPress={close}>Close ×</Button>}</Row>
      <RuneView scroll maxHeight={height - 140} gap={10}>{children}</RuneView>
    </RuneView>
  </RuneView>;
}

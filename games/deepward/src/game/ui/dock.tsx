/** @jsxImportSource @jgengine/core/ui/jsx */
import type { ReactNode } from "@jgengine/core/ui/jsx";
import { RuneAction, RuneLabel, RuneView, type RuneViewProps } from "@jgengine/core/ui/rune/primitives.view";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import type { RuneTheme } from "@jgengine/core/ui/rune/primitives";
import type { RuneElementProps } from "@jgengine/core/ui/rune/element";

export const TEAL = "#9cddd1", AMBER = "#e2bd6e", RED = "#ff6a52", INK = "#e8fbf5", DIM = "#91afa9";
export const FULL = { fraction: 1 }, ALL = [0,0,0,0] as const;
export const deepwardTheme = {
  colors: { accent: TEAL, signal: AMBER, danger: RED, ink: INK, muted: DIM, track: "#30494c" },
  text: { body: { family: "Rajdhani", size: 16, color: INK }, label: { family: "Share Tech Mono", size: 12, tracking: 1.2, color: DIM }, heading: { family: "Rajdhani", size: 28, weight: 650, color: INK } },
  variants: {
    surface: { padding: 18, gap: 10, fill: "#12272bed", border: { width: 1, color: "#486561" }, radius: 2 },
    action: { minHeight: 42, padding: [10,14,10,14], fill: "#d7b774", border: { width: 1, color: "#ecd3a1" }, hover: "#ffffff25", press: "#00000025", radius: 2 },
  }, motion: { duration: 160, distance: 12, bounce: 0 },
} satisfies RuneTheme;
export function Text({ text, ...props }: RuneElementProps) { return <RuneLabel {...props} {...(text === undefined ? {} : { value: text })} />; }
export function Tag(props: RuneElementProps) { return <Text {...deepwardTheme.text.label} {...props} />; }
export function Heading(props: RuneElementProps) { return <Text {...deepwardTheme.text.heading} {...props} />; }
export function Section(props: RuneViewProps) { return <RuneView gap={9} padding={[12,0,12,0]} {...props} />; }
export function Row(props: RuneViewProps) { return <RuneView layout="row" gap={10} items="center" {...props} />; }
export function Button({ onPress, ...props }: RuneViewProps) { return <RuneAction variant="action" color="#172529" {...props} {...(onPress === undefined ? {} : { run: onPress })} />; }
export function Frame({ paper: _paper, ...props }: RuneViewProps & { paper?: boolean }) { return <RuneView variant="surface" {...props} />; }
export function Sheet({ children, title, close, label }: { children: ReactNode; title: string; close?: (() => void) | undefined; label?: string }) {
  const { width, height } = useRuneViewport();
  return <RuneView anchor="fill" fill="#030d12dc" modal {...(close === undefined ? {} : { onBack: close })}>
    <RuneView anchor="center" variant="surface" width={Math.min(680,width - 32)} maxHeight={height - 32} label={label ?? title} role="dialog">
      <Row justify="between"><Heading>{title}</Heading>{close === undefined ? null : <Button onPress={close}>Close ×</Button>}</Row>
      <RuneView scroll maxHeight={height - 140} gap={10}>{children}</RuneView>
    </RuneView>
  </RuneView>;
}

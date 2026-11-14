/** @jsxImportSource @jgengine/core/ui/jsx */
import type { ReactNode } from "@jgengine/core/ui/jsx";
import { RuneAction, RuneGlyph, RuneLabel, RuneView, type RuneViewProps } from "@jgengine/core/ui/rune/primitives.view";
import type { RuneTheme } from "@jgengine/core/ui/rune/primitives";
import type { RuneElementProps } from "@jgengine/core/ui/rune/element";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import type { MedalId } from "../events/catalog";
import { medalArtwork } from "./artwork";

/*
 * The customer-service desk: store-blue plates, sale-tag yellow, wet-floor stripes, chunky signage
 * numbers, and every pane printed on receipt paper clipped to the blue counter.
 */
export const YELLOW = "#ffd21e", TEAL = "#5de0ce", RED = "#ff3b4a", INK = "#fbf7ee", DIM = "#c6cbe0";
export const STEEL = "#2f5fc4", GUNMETAL = "#14234a", PAPER = "#fbf8f0", PEN = "#1f2430", ORANGE = "#e8303a", HARDBOARD = "#2f6fd6";
export const STENCIL = "Lilita One", BODY = "Nunito";
export const FULL = { fraction: 1 } as const;

export const pitTheme = {
  colors: { accent: YELLOW, launch: TEAL, danger: RED, ink: INK, muted: DIM, steel: STEEL, gunmetal: GUNMETAL, paper: PAPER, pen: PEN, stamp: ORANGE },
  text: {
    body: { family: BODY, size: 17, color: INK },
    label: { family: BODY, size: 13, tracking: 1.6, color: DIM },
    display: { family: STENCIL, size: 30, tracking: 1, color: INK },
    numeric: { family: STENCIL, size: 22, color: INK },
  },
  variants: {
    /** A HUD plate: a navy shelf-edge price strip. */
    hud: { fill: "#14234ae8", border: { width: 2, color: "#0b1530" }, padding: [8, 10, 8, 10], gap: 6, radius: 6 },
    /** A store-blue aisle sign as a menu plate; the yellow one is where you are. */
    plate: { fill: STEEL, gradient: { angle: 90, stops: [[0, "#3f74de"], [0.35, "#2f5fc4"], [1, "#24499a"]] }, border: { width: 2, color: "#0b1530" }, padding: [6, 16, 6, 14], minHeight: 50, gap: 14, hover: "#ffffff1c", press: "#00000030", radius: 6 },
    /** A sale-tag yellow button. */
    action: { fill: YELLOW, border: { width: 2, color: "#0b1530" }, padding: [8, 14, 8, 14], minHeight: 42, hover: "#ffffff30", press: "#00000025", items: "center", justify: "center", radius: 6 },
    /** A blue button on blue. */
    quiet: { fill: STEEL, border: { width: 2, color: "#0b1530" }, padding: [8, 14, 8, 14], minHeight: 42, hover: "#ffffff1c", press: "#00000030", items: "center", justify: "center", radius: 6 },
    /** The receipt: till-roll paper on the blue customer-service counter. */
    sheet: { fill: PAPER, border: { width: 8, color: HARDBOARD }, padding: [16, 18, 16, 18], gap: 10, shadow: { y: 14, blur: 32, color: "#00000066" }, radius: 8 },
    /** An ink stamp printed on the receipt. */
    stamp: { fill: PEN, border: { width: 1, color: PEN }, padding: [6, 12, 6, 12], minHeight: 36, hover: "#ffffff22", press: "#00000030", items: "center", justify: "center" },
  },
  motion: { duration: 140, distance: 10, bounce: 0 },
} satisfies RuneTheme;

export function Text({ text, ...props }: RuneElementProps) { return <RuneLabel {...props} {...(text === undefined ? {} : { value: text })} />; }
export function Label(props: RuneElementProps) { return <Text {...pitTheme.text.label} {...props} />; }
export function Stencil(props: RuneElementProps) { return <Text {...pitTheme.text.display} {...props} />; }
export function Row(props: RuneViewProps) { return <RuneView layout="row" gap={10} items="center" {...props} />; }
export function Button({ onPress, quiet, ...props }: RuneViewProps & { quiet?: boolean }) {
  return <RuneAction variant={quiet === true ? "quiet" : "action"} color={quiet === true ? INK : "#141414"} {...props} {...(onPress === undefined ? {} : { run: onPress })} />;
}
export function Stamp({ onPress, ...props }: RuneViewProps) { return <RuneAction variant="stamp" color={PAPER} {...props} {...(onPress === undefined ? {} : { run: onPress })} />; }

/** A wet-floor band: black and yellow blocks across the full width. */
export function HazardBand({ height = 8, blocks = 18 }: { height?: number; blocks?: number }) {
  return <RuneView layout="row" height={height} width={FULL} clip>{Array.from({ length: blocks }, (_, i) => <RuneView key={i} grow={1} height={height} fill={i % 2 === 0 ? "#141414" : YELLOW} />)}</RuneView>;
}

/** The store's hanging department sign: big signage letters between two wet-floor bands. */
export function GateSign({ lines, sub, size = 56 }: { lines: readonly string[]; sub: string; size?: number }) {
  return <RuneView variant="hud" padding={0} gap={0} fill="#2f6fd6">
    <HazardBand />
    <RuneView padding={[10, 18, 10, 18]} gap={2}>
      {lines.map(line => <Stencil key={line} size={size} tracking={size / 14}>{line}</Stencil>)}
      <Label color={YELLOW}>{sub}</Label>
    </RuneView>
    <HazardBand />
  </RuneView>;
}

/** A receipt heading in signage letters, with its tag on the right. */
export function SheetHead({ title, tag }: { title: string; tag?: ReactNode }) {
  return <Row justify="between" width={FULL}><Stencil size={24} color={ORANGE}>{title}</Stencil>{tag === undefined ? null : typeof tag === "string" ? <Label color={PEN}>{tag}</Label> : tag}</Row>;
}

/** Bronze, silver and gold in a row, lit up to the medal held. */
export function MedalRow({ held, size = 22 }: { held: MedalId | null; size?: number }) {
  const order: readonly MedalId[] = ["bronze", "silver", "gold"];
  const rank = held === null ? -1 : order.indexOf(held);
  return <Row gap={3}>{order.map((medal, index) => <RuneGlyph key={medal} artwork={medalArtwork(medal, index <= rank)} width={size} height={size} label={`${medal}${index <= rank ? "" : " not earned"}`} />)}</Row>;
}

/** A modal receipt over the store, scrolled when it outgrows the screen. */
export function Sheet({ children, label, back, width = 640 }: { children: ReactNode; label: string; back?: () => void; width?: number }) {
  const { width: w, height } = useRuneViewport();
  return <RuneView anchor="fill" fill="#0a0908c8" modal {...(back === undefined ? {} : { onBack: back })}>
    <RuneView anchor="center" variant="sheet" color={PEN} width={Math.min(width, w - 24)} maxHeight={height - 24} label={label} role="dialog">
      <RuneView scroll maxHeight={height - 60} gap={10}>{children}</RuneView>
    </RuneView>
  </RuneView>;
}

/** Label and value on one printed line of the receipt. */
export function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return <Row justify="between" width={FULL} padding={[3, 0, 3, 0]} border={{ width: 0, color: PEN }}>
    <Label color={PEN}>{label.toUpperCase()}</Label><Text family={STENCIL} size={18} color={warn === true ? ORANGE : PEN}>{value}</Text>
  </Row>;
}

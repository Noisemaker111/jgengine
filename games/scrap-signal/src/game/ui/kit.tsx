/** @jsxImportSource @jgengine/core/ui/jsx */
import type { ReactNode } from "@jgengine/core/ui/jsx";
import { RuneAction, RuneGlyph, RuneLabel, RuneView, type RuneViewProps } from "@jgengine/core/ui/rune/primitives.view";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import { live, type LiveValue } from "@jgengine/core/ui/liveValue";
import type { RuneTheme } from "@jgengine/core/ui/rune/primitives";
import type { RuneElementProps } from "@jgengine/core/ui/rune/element";

/**
 * Scrap Signal's salvaged hardware on Rune: carbon housings on welded rims, phosphor tubes,
 * segmented pip gauges and stamped labels. Russo One over Chakra Petch.
 */
export const C = {
  ink: "#f5f5f4", dim: "#a8a29e", faint: "#78716c",
  amber: "#ffb400", phosphor: "#9ff5d6", phosphorDim: "#4f8f7c",
  red: "#ff4a3a", shield: "#4cc3ff", xp: "#8ee43e", cores: "#e879f9", cyan: "#72dfdf",
  rim: "#6f5a3c", off: "#ffffff22",
} as const;
export const FULL = { fraction: 1 } as const;

export const scrapTheme = {
  colors: { accent: C.amber, ink: C.ink, muted: C.dim, danger: C.red, shield: C.shield, xp: C.xp, phosphor: C.phosphor, track: C.off },
  text: {
    body: { family: "Chakra Petch", size: 15, color: C.ink },
    label: { family: "Chakra Petch", size: 11, tracking: 1.6, color: C.amber },
    heading: { family: "Russo One", size: 22, tracking: 1, color: C.ink },
    display: { family: "Russo One", size: 64, tracking: 4, color: C.ink },
  },
  variants: {
    plate: { padding: 10, gap: 6, fill: "#110e0bf0", border: { width: 2, color: "#4a3b29" }, radius: 2 },
    hull: { padding: 10, gap: 6, fill: "#1b2225f2", border: { width: 2, color: "#34444a" }, radius: 2 },
    tube: { padding: 8, gap: 4, radius: 4, border: { width: 1, color: "#0b2a22" }, gradient: { angle: 1.57, stops: [[0, "#0a1d17"], [1, "#04100c"]] } },
    action: { minHeight: 40, padding: [8, 12, 8, 12], gap: 2, justify: "center", fill: "#2a2118", border: { width: 2, color: "#ffb40099" }, hover: "#ffb40033", press: "#00000044", radius: 2 },
    sheet: { padding: 16, gap: 10, fill: "#0c0a09f4", border: { width: 2, color: "#f59e0bcc" }, shadow: { y: 8, blur: 40, color: "#000000e6" } },
  },
  motion: { duration: 140, distance: 10, bounce: 0 },
} satisfies RuneTheme;

type Tone = "amber" | "phosphor" | "red" | "dim";
const TONE: Record<Tone, string> = { amber: C.amber, phosphor: C.phosphor, red: C.red, dim: C.dim };

export function Text({ text, ...props }: RuneElementProps) { return <RuneLabel {...props} {...(text === undefined ? {} : { value: text })} />; }
export function Label(props: RuneElementProps) { return <Text {...scrapTheme.text.label} {...props} />; }
export function Heading(props: RuneElementProps) { return <Text {...scrapTheme.text.heading} {...props} />; }
export function Small(props: RuneElementProps) { return <Text size={12} color={C.dim} {...props} />; }
/** A stamped label plate, like the stencilled tags riveted to salvage. */
export function Stamp({ tone = "amber", children, text }: { tone?: Tone; children?: ReactNode; text?: RuneElementProps["text"] }) {
  return <RuneView layout="row" padding={[2, 6, 2, 6]} border={{ width: 1, color: `${TONE[tone]}88` }} fill="#00000055">
    <Label color={TONE[tone]} {...(text === undefined ? {} : { text })}>{children}</Label>
  </RuneView>;
}
export function Row(props: RuneViewProps) { return <RuneView layout="row" gap={8} items="center" {...props} />; }
export function Plate(props: RuneViewProps) { return <RuneView variant="plate" {...props} />; }
export function Hull(props: RuneViewProps) { return <RuneView variant="hull" {...props} />; }
/** A CRT screen set into a housing. */
export function Tube(props: RuneViewProps) { return <RuneView variant="tube" {...props} />; }
export function Button({ onPress, ...props }: RuneViewProps & { onPress?: () => void }) {
  return <RuneAction variant="action" color={C.ink} {...props} {...(onPress === undefined ? {} : { run: onPress })} />;
}
/** A full-width action row: title and detail on the left, a price or verb on the right. */
export function RowButton({ title, detail, value, valueColor = C.amber, titleColor = C.ink, disabled, onPress }: {
  title: string; detail?: string; value?: string; valueColor?: string; titleColor?: string; disabled?: boolean; onPress: () => void;
}) {
  return <Button layout="row" items="center" gap={10} width={FULL} disabled={disabled === true} label={title} onPress={onPress} {...(disabled === true ? { fill: "#15120f", border: { width: 1, color: "#44403c" } } : {})}>
    <RuneView grow={1} shrink gap={2}><Text size={14} color={titleColor}>{title.toUpperCase()}</Text>{detail === undefined ? null : <Small>{detail}</Small>}</RuneView>
    {value === undefined ? null : <Text size={14} color={valueColor}>{value}</Text>}
  </Button>;
}

/**
 * A segmented gauge: `count` pips lit in proportion to `value / max`, bound at each pip. Any value
 * above zero lights at least one pip, so a last sliver of health still shows.
 */
export function litPips(value: number, max: number, count: number): number {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return value > 0 ? Math.max(1, Math.ceil(ratio * count - 0.001)) : 0;
}
export function Pips({ value, max, count = 12, color, width = 8, height = 10 }: { value: () => number; max: () => number; count?: number; color: string | (() => string); width?: number; height?: number }) {
  const tint = typeof color === "string" ? () => color : color;
  return <RuneView layout="row" gap={2}>
    {Array.from({ length: count }, (_, i) => <RuneView key={i} width={width} height={height} fill={live(() => i < litPips(value(), max(), count) ? tint() : C.off)} />)}
  </RuneView>;
}

/**
 * Opacity that dims a readout after `idleMs` without a change in `watch`, and holds full strength
 * while `hold` is true. Bound at the panel; it never renders a component.
 */
export function idleFade(watch: () => string, hold: () => boolean, dimTo: number, idleMs: number, now: () => number = () => performance.now()): LiveValue<number> {
  let last = "", changed = now();
  return live(() => {
    const key = watch(), time = now();
    if (key !== last) { last = key; changed = time; }
    if (hold()) { changed = time; return 1; }
    const idle = time - changed - idleMs;
    return idle <= 0 ? 1 : Math.max(dimTo, 1 - (idle / 600) * (1 - dimTo));
  });
}

/** Phones in either orientation: a narrow or a short screen gets the folded rig. */
export function useCompact(): { compact: boolean; portrait: boolean } {
  const { width, height } = useRuneViewport();
  return { compact: width < 600 || height < 500, portrait: width < 600 };
}

/** The dimmed modal sheet every Scrap Signal terminal (vendors, travel, exchange, talents) opens in. */
export function Sheet({ title, aside, close, closeLabel = "Close", wide = false, modal = true, children }: {
  title: string; aside?: ReactNode; close: () => void; closeLabel?: string; wide?: boolean; modal?: boolean; children: ReactNode;
}) {
  const { width, height } = useRuneViewport();
  return <RuneView anchor="fill" fill={wide ? "#000000b3" : "#00000099"} {...(modal ? { modal: true, onBack: close } : {})}>
    <RuneView anchor="center" variant="sheet" width={Math.min(wide ? 736 : 420, width - 24)} maxHeight={height - 24} role="dialog" label={title}>
      <Row justify="between" items="start">
        <RuneView grow={1} shrink gap={2}><Heading size={18} color={C.amber}>{title.toUpperCase()}</Heading>{aside}</RuneView>
        <Button onPress={close}>{closeLabel}</Button>
      </Row>
      <RuneView scroll maxHeight={height - 120} gap={8}>{children}</RuneView>
    </RuneView>
  </RuneView>;
}

const icon = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#ffffff">${body}</svg>`;
/** Game-owned glyph artwork; native icons tint it with `color`. */
export const ICONS = {
  coin: icon(`<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="6" fill="#00000055"/><rect x="11" y="7" width="2" height="10"/>`),
  gem: icon(`<polygon points="12,3 20,9 12,21 4,9"/><polygon points="12,3 16,9 12,21 8,9" fill="#00000033"/>`),
  star: icon(`<polygon points="12,2 14.9,8.6 22,9.3 16.6,14 18.2,21 12,17.3 5.8,21 7.4,14 2,9.3 9.1,8.6"/>`),
  bomb: icon(`<circle cx="11" cy="14" r="7"/><rect x="13" y="4" width="3" height="5" transform="rotate(35 14 6)"/><circle cx="18" cy="4" r="1.6"/>`),
  pause: icon(`<rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/>`),
} as const;
export function Icon({ name, color, size = 15 }: { name: keyof typeof ICONS; color: string; size?: number }) {
  return <RuneGlyph artwork={ICONS[name]} color={color} size={size} />;
}

/** Four signal-strength bars; `strength` 0-4. */
export function SignalBars({ strength, color = C.phosphor }: { strength: number; color?: string }) {
  return <Row gap={2} items="end">{[0, 1, 2, 3].map(i => <RuneView key={i} width={4} height={4 + i * 4} fill={i < strength ? color : C.off} />)}</Row>;
}

/** Authored vector portraits of reclaimed machines; silhouettes mirror each build's role. */
export function portraitArtwork(id: string, color: string): string {
  const heavy = id === "gunk", scout = id === "cipher";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120">
    <path d="M8 100H232M24 8V108M216 8V108" stroke="${color}" stroke-opacity=".18" fill="none"/>
    <circle cx="120" cy="55" r="43" stroke="${color}" stroke-dasharray="4 8" fill="none" stroke-opacity=".5"/>
    <path d="${heavy ? "M47 118L55 83L85 70H155L185 83L193 118Z" : "M65 118L75 87L98 75H142L165 87L175 118Z"}" fill="#293940" stroke="${color}" stroke-width="2"/>
    <path d="M99 83L108 96H132L141 83M87 108H153" fill="none" stroke="#b48a5e" stroke-width="4"/>
    <path d="${scout ? "M97 23L129 17L149 44L139 73L110 79L93 59Z" : heavy ? "M86 31L101 17H139L154 31V66L138 80H102L86 66Z" : "M94 29L110 16H134L148 33L140 70L120 81L100 69Z"}" fill="#c09b75" stroke="#ebcdaa" stroke-width="2"/>
    <path d="${scout ? "M94 43L145 34L147 49L100 59Z" : "M90 39L150 39L145 57H95Z"}" fill="#101c22"/>
    ${scout ? `<circle cx="128" cy="45" r="7" fill="${color}"/>` : `<path d="M100 45H116V51H100ZM124 45H140V51H124Z" fill="${color}"/>`}
    <path d="M108 66H132M117 60V72" stroke="#314047" stroke-width="3"/>
    <path d="${heavy ? "M66 95H80M160 95H174M61 104H80M160 104H179" : "M82 97L87 113M158 97L153 113"}" stroke="${color}" stroke-width="5"/>
    ${id === "nyx" ? `<path d="M83 57L71 26M157 57L169 26" stroke="${color}" stroke-width="3"/><circle cx="71" cy="23" r="4" fill="${color}"/><circle cx="169" cy="23" r="4" fill="${color}"/>` : ""}
  </svg>`;
}
/** A reclaimer's portrait on a phosphor tube. */
export function Portrait({ id, color, size }: { id: string; color: string; size: number }) {
  return <Tube padding={2} items="center" border={{ width: 1, color: `${color}88` }}><RuneGlyph artwork={portraitArtwork(id, color)} size={size} /></Tube>;
}

/** Keycap glyph for control legends. */
export function Key({ children }: { children: string }) {
  return <RuneView padding={[1, 5, 1, 5]} border={{ width: 1, color: "#57534e" }} fill="#1c1917"><Text size={11} color={C.ink}>{children}</Text></RuneView>;
}
/** The controls, printed on the terminal's lower keys. */
export function ControlKeys() {
  const groups: [string[], string][] = [[["W", "A", "S", "D", "Shift"], "move / sprint"], [["LMB", "RMB"], "fire / aim"], [["E", "R"], "use / reload"], [["Q", "G", "K"], "heal / grenade / talents"]];
  return <RuneView layout="row" gap={12} label="Controls" responsive={{ phone: { layout: "grid", columns: 1, gap: 4 } }}>
    {groups.map(([keys, note]) => <Row key={note} gap={3}>{keys.map(k => <Key key={k}>{k}</Key>)}<Small size={11}>{note}</Small></Row>)}
  </RuneView>;
}

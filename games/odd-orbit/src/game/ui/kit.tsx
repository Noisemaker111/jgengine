/** @jsxImportSource @jgengine/core/ui/jsx */
import { createElement, type ReactNode } from "@jgengine/core/ui/jsx";
import { renderToStaticMarkup } from "@jgengine/core/ui/jsx/markup";
import { RuneAction, RuneGlyph, RuneLabel, RuneView, type RuneViewProps } from "@jgengine/core/ui/rune/primitives.view";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import { bind, type RuneTheme } from "@jgengine/core/ui/rune/primitives";
import type { RuneElementProps } from "@jgengine/core/ui/rune/element";
import { GameIcon, type GameIconName } from "@jgengine/core/ui/icons/gameIcons.view";
import type { Live } from "@jgengine/core/ui/liveValue";

import type { AlienBodyPlan } from "../creatures/bodyPlan";
import type { NeedId } from "../needs/needs";

/** Plum ink: what a pastel magnet or a paper note is written in. */
export const INK = "#3a2140";
export const RIM = "#2a1733";
export const CREAM_TEXT = "#fff0d5";
export const DIM = "#6b4f73";
export const NIGHT_DIM = "#c9b6ce";
export const WARN = "#c2402f";
export const FULL = { fraction: 1 } as const;

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

export const NEED_COLORS: Record<NeedId, string> = { hunger: "#ffb347", energy: "#7ec8ff", social: "#ff8fb0", fun: "#b98cff" };
export const MOOD_COLORS: Record<string, string> = { radiant: "#2f9a62", content: "#4f8a2a", fine: "#9a7a12", glum: "#b0582a", low: "#c2402f" };
/** The game icon for each need, used on magnets, rings and the furnishing catalogue. */
export const NEED_ICON: Record<NeedId, GameIconName> = { hunger: "apple", energy: "feather", social: "heart", fun: "star" };

/** Odd Orbit's one Rune theme: dusk-lilac habitat, pastel enamel, Comfortaa over Quicksand. */
export const orbitTheme = {
  colors: { ink: INK, rim: RIM, paper: "#fff6e4", night: "#2a1f3d", ...ENAMEL, text: CREAM_TEXT, dim: DIM, warn: WARN },
  text: {
    body: { family: "Quicksand", size: 15, weight: 600, color: INK },
    fine: { family: "Quicksand", size: 13, weight: 600, color: DIM },
    label: { family: "Quicksand", size: 11, weight: 700, tracking: 1.2, color: DIM },
    heading: { family: "Comfortaa", size: 20, weight: 700, color: INK },
    display: { family: "Comfortaa", size: 58, weight: 700, color: INK },
  },
  variants: {
    paper: { padding: 14, gap: 8, fill: "#fff6e4", radius: 14, border: { width: 2, color: RIM }, shadow: { y: 6, blur: 16, color: "#170d2866" } },
    night: { padding: 12, gap: 8, fill: "#2a1f3dee", radius: 18, border: { width: 1, color: "#765778" } },
    plate: { minHeight: 40, padding: [8, 14, 8, 14], gap: 8, fill: ENAMEL.cream, radius: 16, border: { width: 2, color: RIM }, hover: "#ffffff38", press: "#00000022", shadow: { y: 3, blur: 0, color: "#2a173366" } },
  },
  motion: { duration: 160, distance: 10, bounce: 0.1 },
} satisfies RuneTheme;

/** The player's interface preferences applied to the one theme: calm stills motion, bolder darkens fine print and rims. */
export function orbitThemeFor(prefs: { calm: boolean; contrast: boolean }): RuneTheme {
  const text = prefs.contrast ? { ...orbitTheme.text, fine: { ...orbitTheme.text.fine, color: INK }, label: { ...orbitTheme.text.label, color: INK } } : orbitTheme.text;
  const variants = prefs.contrast ? { ...orbitTheme.variants, paper: { ...orbitTheme.variants.paper, border: { width: 3, color: RIM } } } : orbitTheme.variants;
  return { ...orbitTheme, text, variants, motion: prefs.calm ? { duration: 0, distance: 0, bounce: 0 } : orbitTheme.motion };
}

type TextProps = RuneElementProps & { textStyle?: string };
export function Text({ text, ...props }: TextProps) { return <RuneLabel textStyle="body" {...props} {...(text === undefined ? {} : { value: text })} />; }
export function Fine(props: TextProps) { return <Text textStyle="fine" {...props} />; }
export function Tag(props: TextProps) { return <Text textStyle="label" {...props} />; }
export function Heading(props: TextProps) { return <Text textStyle="heading" {...props} />; }
export function Row(props: RuneViewProps) { return <RuneView layout="row" gap={8} items="center" {...props} />; }
export function Paper({ tint, ...props }: RuneViewProps & { tint?: string }) { return <RuneView variant="paper" {...(tint === undefined ? {} : { fill: tint })} {...props} />; }

/** A rounded enamel plate: the household's pressable control. `on` marks the chosen one of a set. */
export function Plate({ tone = "cream", tint, on = false, disabled, onPress, children, ...props }: RuneViewProps & { tone?: EnamelTone; tint?: string; on?: boolean; onPress?: () => void }) {
  const fill = tint ?? ENAMEL[tone];
  return <RuneAction variant="plate" layout="row" items="center" fill={fill} color={tone === "plum" ? CREAM_TEXT : INK} family="Quicksand" weight={700} size={15}
    border={{ width: on ? 3 : 2, color: on ? "#c2477f" : RIM }} opacity={disabled === true ? 0.5 : 1}
    {...(disabled === undefined ? {} : { disabled })} {...(onPress === undefined ? {} : { run: onPress })} {...props}>{children}</RuneAction>;
}

const ICON_ART = new Map<GameIconName, string>();
/** A game icon as native artwork: the engine's own glyph set, tinted by `color`. */
export function Icon({ name, size = 20, color = INK }: { name: GameIconName; size?: number; color?: string }) {
  let art = ICON_ART.get(name);
  if (art === undefined) {
    const markup = renderToStaticMarkup(createElement(GameIcon, { name }));
    art = `<g fill="currentColor">${markup.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")}</g>`;
    ICON_ART.set(name, art);
  }
  return <RuneGlyph artwork={art} size={size} color={color} />;
}

/** `hsl(h, s%, l%)` as the hex Rune paints. */
export function hslHex(h: number, s: number, l: number): string {
  const sat = s / 100, light = l / 100, k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => Math.round(255 * (light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))))).toString(16).padStart(2, "0");
  return `#${f(0)}${f(8)}${f(4)}`;
}
export const planColor = (plan: AlienBodyPlan, lightness = 60): string => hslHex(plan.hue, 62, lightness);

/** A being's portrait, drawn from its body plan: coloured disc, body, eyes and a smile. */
export function Swatch({ plan, size = 40 }: { plan: AlienBodyPlan; size?: number }) {
  const tall = plan.shape === "tall", blob = plan.shape === "blob";
  const eyes = Math.max(1, Math.min(4, plan.eyeCount));
  const body = tall ? "M24 57V26q0-18 12-18t12 18v31Z" : blob ? "M14 49q-5-16 10-21 0-16 13-10 17-5 19 15 13 7 1 23H20Z" : "M17 40q0-24 19-24t19 24q0 19-19 19T17 40Z";
  const at = (i: number) => 36 + (i - (eyes - 1) / 2) * 8;
  const whites = Array.from({ length: eyes }, (_, i) => `<ellipse cx="${at(i)}" cy="${tall ? 31 : 36}" rx="4" ry="5"/>`).join("");
  const pupils = Array.from({ length: eyes }, (_, i) => `<circle cx="${at(i) + 1}" cy="${tall ? 32 : 37}" r="2"/>`).join("");
  const layer = (art: string, color: string) => <RuneView pin={[0, 0, null, null]} width={size} height={size}><RuneGlyph size={size} color={color} artwork={`<g transform="scale(0.3333)">${art}</g>`} /></RuneView>;
  return <RuneView width={size} height={size} radius={size / 2} fill={planColor(plan, 20)} border={{ width: 2, color: planColor(plan, 62) }} label={`${plan.shape} being`}>
    {layer(`<path d="${body}" fill="currentColor"/><path d="m21 53-7 8m37-8 7 8m-31-2-3 6m16-6 3 6" fill="none" stroke="currentColor" stroke-width="3"/>`, planColor(plan, 67))}
    {layer(`<g fill="currentColor">${whites}</g><circle cx="19" cy="18" r="3" fill="currentColor"/>`, "#fff5da")}
    {layer(`<g fill="currentColor">${pupils}</g><path d="M30 47q6 5 12 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`, "#241634")}
  </RuneView>;
}

/** A labelled meter whose fill reads `value` (0-100) every frame. */
export function Meter({ label, value, color, width = 120, height = 8 }: { label?: string; value: () => number; color: Live<string>; width?: number | { fraction: number }; height?: number }) {
  return <RuneView width={width} height={height} radius={height / 2} fill="#2a173333" clip {...(label === undefined ? {} : { label })}>
    <RuneView height={height} radius={height / 2} fill={color} width={bindFraction(value)} />
  </RuneView>;
}
const bindFraction = (value: () => number) => bind(() => ({ fraction: Math.max(0, Math.min(1, value() / 100)) }));

/** A dimmed full-screen veil holding one centred sheet; Escape runs `close`. */
export function Veil({ children, close, label }: { children: ReactNode; close?: () => void; label: string }) {
  const { width, height } = useRuneViewport();
  return <RuneView anchor="fill" fill="#1a1029b8" modal justify="center" items="center" {...(close === undefined ? {} : { onBack: close })}>
    <Paper width={Math.min(560, width - 24)} maxHeight={height - 32} label={label} role="dialog" padding={22} gap={10}>
      <RuneView scroll maxHeight={height - 80} gap={10}>{children}</RuneView>
    </Paper>
  </RuneView>;
}

export function creditsText(value: number): string { return Number.isInteger(value) ? String(value) : value.toFixed(2); }

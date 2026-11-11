/** @jsxImportSource @jgengine/core/ui/jsx */
import type { ReactNode } from "@jgengine/core/ui/jsx";
import { useMemo, useSyncExternalStore } from "@jgengine/core/ui/jsx";
import { RuneAction, RuneGlyph, RuneLabel, RuneView, type RuneActionProps, type RuneViewProps } from "@jgengine/core/ui/rune/primitives.view";
import { bind } from "@jgengine/core/ui/rune/primitives";
import type { RuneElementProps } from "@jgengine/core/ui/rune/element";
import type { Live } from "@jgengine/core/ui/liveValue";

import { hudStore, type HudSnapshot } from "../hudStore";
import { ICON_SVG } from "./iconData";
import { GILT, INK, WAX } from "./theme";

/** A hud-store slice, re-rendering only when the selected structure changes; per-frame numbers bind at leaves instead. */
export function useHudSlice<T>(select: (hud: HudSnapshot) => T): T {
  const read = () => JSON.stringify(select(hudStore.get()) ?? null);
  const token = useSyncExternalStore(hudStore.subscribe, read, read);
  return useMemo(() => JSON.parse(token) as T, [token]);
}
/** A live read of the current hud snapshot for a bound leaf. */
export const hud = (): HudSnapshot => hudStore.get();

/** A game-icons.net glyph (512 units) scaled into the native 24-unit icon box and tinted. */
export function Glyph({ name, size = 20, color = GILT, ...props }: { name: string; size?: number; color?: Live<string> } & Omit<RuneElementProps, "color" | "size">) {
  const inner = ICON_SVG[name];
  if (inner === undefined) throw new Error(`Unknown Ember Command glyph: ${name}`);
  return <RuneGlyph size={size} color={color} artwork={`<g transform="scale(0.046875)">${inner}</g>`} {...props} />;
}

const WAX_RING = (() => {
  const jitter = [0.0, 0.9, -0.6, 1.4, 0.3, -1.1, 0.8, 1.8, -0.4, 0.6, -1.3, 0.2, 1.1, -0.7, 2.0, 0.4, -0.9, 0.7, 1.3, -0.5, 0.1, -1.2, 0.9, 1.6, -0.3, 0.5, -0.8, 1.0];
  return `M${jitter.map((offset, i) => {
    const a = (i / jitter.length) * Math.PI * 2, r = 29 + offset;
    return `${(32 + Math.cos(a) * r).toFixed(2)},${(32 + Math.sin(a) * r).toFixed(2)}`;
  }).join(" L")} Z`;
})();
const EMBLEM = {
  ember: '<path d="M32 17 C35 23 41 26 40 34 C39.4 39.5 35.8 43 32 43 C28.2 43 24.6 39.5 24 34 C23.4 28.6 27.4 26.4 28.6 22.4 C30 25.6 30.6 27.4 32.4 28.6 C33.6 24.8 33.6 21 32 17 Z"/><rect x="25" y="44.5" width="14" height="3" rx="1.5"/>',
  pause: '<rect x="24" y="22" width="5.5" height="20" rx="1"/><rect x="34.5" y="22" width="5.5" height="20" rx="1"/>',
  star: '<path d="M32 19 L35.2 28.4 L45 28.6 L37.2 34.6 L40 44 L32 38.4 L24 44 L26.8 34.6 L19 28.6 L28.8 28.4 Z"/>',
} as const;

/** A ragged disc of poured wax pressed with the campaign's die, as native SVG artwork. */
export function WaxSeal({ size = 64, wax = WAX, emblem = "ember" }: { size?: number; wax?: string; emblem?: keyof typeof EMBLEM }) {
  const art = `<g transform="scale(0.375)">`
    + `<path d="${WAX_RING}" fill="#000" fill-opacity="0.28" transform="translate(0,2.4)"/>`
    + `<path d="${WAX_RING}" fill="${wax}"/>`
    + `<circle cx="26" cy="24" r="16" fill="#fff" fill-opacity="0.12"/>`
    + `<circle cx="32" cy="32" r="20" fill="none" stroke="#000" stroke-opacity="0.35" stroke-width="2.4"/>`
    + `<g fill="#000" fill-opacity="0.5" transform="translate(0.8,0.9)">${EMBLEM[emblem]}</g>`
    + `<g fill="#ffd9c8" fill-opacity="0.5">${EMBLEM[emblem]}</g></g>`;
  return <RuneGlyph size={size} color={wax} artwork={art} />;
}

export function Text({ text, ...props }: Omit<RuneElementProps, "text"> & { text?: Live<string>; textStyle?: string }) {
  return <RuneLabel textStyle="body" {...props} {...(text === undefined ? {} : { value: text })} />;
}
export const Small = (props: Parameters<typeof Text>[0]) => <Text textStyle="small" {...props} />;
export const Eyebrow = (props: Parameters<typeof Text>[0]) => <Text textStyle="eyebrow" {...props} />;
export const Title = (props: Parameters<typeof Text>[0]) => <Text textStyle="title" {...props} />;
export const Row = (props: RuneViewProps) => <RuneView layout="row" gap={8} items="center" {...props} />;

/** A bar ruled in ink: an outlined track with a wash of one colour. The fill is a bound point width, a
 * number slot written per frame, so a moving bar never patches or resubmits the tree. */
export function InkBar({ value, max, color, width, height = 7, label }: {
  value: () => number; max: () => number; color: string; width: number; height?: number; label: string;
}) {
  const inner = Math.max(0, width - 2);
  return <RuneView width={width} height={height} fill="#00000014" border={{ width: 1, color: "#2b1d10aa" }} label={label} role="meter" padding={1}>
    <RuneView height={height - 2} fill={color} width={bind(() => { const m = max(); return m > 0 ? inner * Math.max(0, Math.min(1, value() / m)) : 0; })} />
  </RuneView>;
}

/** A loose sheet pinned to the war table: every detail pane is written on one. */
export function Sheet({ children, ...props }: RuneViewProps & { children?: ReactNode }) {
  return <RuneView variant="sheet" {...props}>
    <RuneView anchor="top" inset={-6}><RuneView width={10} height={10} radius={5} fill={WAX} border={{ width: 1, color: "#3a0b06" }} /></RuneView>
    {children}
  </RuneView>;
}

/** The wax-red action that seals a choice. */
export function SealButton({ children, ...props }: RuneActionProps) {
  return <RuneAction variant="seal" {...props}><Text textStyle="verb" color="#fbe9d6" text={String(children)} align="center" /></RuneAction>;
}
/** A wooden plank action for lesser choices. */
export function PlankButton({ children, ...props }: RuneActionProps) {
  return <RuneAction variant="plank" {...props}><Text textStyle="gilt" text={String(children)} align="center" /></RuneAction>;
}
/** An ink-ruled button written on the sheet. */
export function InkButton({ children, ...props }: RuneActionProps) {
  return <RuneAction minHeight={34} padding={[6, 12, 6, 12]} border={{ width: 1, color: INK }} radius={2} hover="#2b1d1014" press="#2b1d1030" items="center" justify="center" {...props}>
    <Text text={String(children)} align="center" />
  </RuneAction>;
}

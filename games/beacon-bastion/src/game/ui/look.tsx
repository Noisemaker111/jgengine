/** @jsxImportSource @jgengine/core/ui/jsx */
import type { ReactNode } from "@jgengine/core/ui/jsx";
import { RuneAction, RuneGlyph, RuneLabel, RuneView, type RuneActionProps, type RuneViewProps } from "@jgengine/core/ui/rune/primitives.view";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import type { RuneTheme } from "@jgengine/core/ui/rune/primitives";
import type { RuneElementProps } from "@jgengine/core/ui/rune/element";
import { readLive, type Live } from "@jgengine/core/ui/liveValue";
import { bind } from "@jgengine/core/ui/rune/primitives";
import { uiCueSoundId } from "@jgengine/core/ui/uiCues";
import { useGameContext } from "@jgengine/ui/provider";

import { GLYPHS, type GlyphName } from "./glyphs";

/** The beacon's fire, soot timber, carved stone, parchment and the red war enamel. */
export const FIRE = "#ffb347", GOLD = "#f6cf5a", BLOOD = "#e0624a", INK = "#f4ead2", DIM = "#c2b08c", SOOT = "#1f1813";
export const PARCHMENT_INK = "#2e1f12", ENAMEL = "#8a2414", STONE = "#57524a", WOOD = "#6b4a2c";
export const FULL = { fraction: 1 };
export const DISPLAY = "Cinzel", BODY = "Alegreya Sans";

export const beaconTheme = {
  colors: { fire: FIRE, gold: GOLD, blood: BLOOD, ink: INK, muted: DIM, soot: SOOT, track: "#3a2c1e" },
  text: {
    body: { family: BODY, size: 15 },
    label: { family: BODY, size: 12, weight: 600, tracking: 1.4, color: DIM },
    heading: { family: DISPLAY, size: 26, weight: 700, color: INK, tracking: 1 },
  },
  variants: {
    // A timber sign: the HUD's plaques and the purse.
    sign: { padding: [6, 12, 6, 12], gap: 6, gradient: { angle: 90, stops: [[0, "#5a3d24"], [1, "#3b2716"]] }, border: { width: 1, color: "#8d6c40" }, radius: 3, shadow: { y: 2, blur: 6, color: "#00000080" } },
    // Carved stone: the mason's tablet, the memorial and the settings slab.
    stone: { padding: 16, gap: 10, gradient: { angle: 90, stops: [[0, "#5d5850"], [1, "#3c3833"]] }, border: { width: 2, color: "#2a2622" }, radius: 4, shadow: { y: 4, blur: 14, color: "#000000a0" } },
    // A torn commission or dispatch.
    parchment: { padding: [18, 20, 20, 20], gap: 10, gradient: { angle: 90, stops: [[0, "#efe0bb"], [1, "#d8c393"]] }, border: { width: 1, color: "#9c7f4c" }, radius: 2, shadow: { y: 4, blur: 12, color: "#00000090" } },
    // A timber plank to press.
    plank: { minHeight: 40, padding: [8, 16, 8, 16], gap: 8, items: "center", justify: "center", gradient: { angle: 90, stops: [[0, "#7a5532"], [1, "#55381f"]] }, border: { width: 1, color: "#a8814a" }, radius: 3, hover: "#ffffff22", press: "#00000033" },
    // A carved keystone for the beacon's rites; its recharge fill rises inside it.
    keystone: { items: "center", justify: "center", fill: "#3f3b35", radius: 4, clip: true, hover: "#ffffff1a", press: "#00000033" },
    // The red war enamel: the horn, Raise and the chosen oath.
    enamel: { minHeight: 44, padding: [10, 20, 10, 20], gap: 8, items: "center", justify: "center", gradient: { angle: 90, stops: [[0, "#a8321c"], [1, "#6e1a0e"]] }, border: { width: 2, color: "#e8a050" }, radius: 3, hover: "#ffffff22", press: "#00000033", shadow: { y: 0, blur: 14, color: "#ff8c3260" } },
  },
  motion: { duration: 180, distance: 10, bounce: 0 },
} satisfies RuneTheme;

export type TextProps = Omit<RuneElementProps, "text"> & { text?: Live<string> };
export function Text({ text, ...props }: TextProps) { return <RuneLabel {...props} {...(text === undefined ? {} : { value: text })} />; }
export function Tag(props: TextProps) { return <Text {...beaconTheme.text.label} {...props} />; }
export function Heading(props: TextProps) { return <Text {...beaconTheme.text.heading} {...props} />; }
/** A short line over the field, on a soot backing so it reads over bright grass. */
export function Caption({ maxWidth, ...props }: TextProps & { maxWidth?: number }) {
  return <RuneView fill="#120d09c0" radius={3} padding={[3, 8, 3, 8]} {...(maxWidth === undefined ? {} : { maxWidth })}><Text size={13} {...props} /></RuneView>;
}
export function Row(props: RuneViewProps) { return <RuneView layout="row" gap={8} items="center" {...props} />; }

/** A pressable plank; `tone` picks timber, enamel or a quiet text stitch. */
export function Plank({ tone = "plank", children, run, ...props }: RuneActionProps & { tone?: "plank" | "enamel" }) {
  const ctx = useGameContext();
  // Every press answers with the engine's confirm cue on the ui bus, as the timber kit's buttons did.
  const press = () => { run?.(); ctx.game.audio.play(uiCueSoundId("confirm")); };
  return <RuneAction variant={tone} layout="row" color={tone === "enamel" ? "#fff1d8" : INK} {...props} run={press}>{children}</RuneAction>;
}

export function Glyph({ name, size = 16, color = INK }: { name: GlyphName; size?: number; color?: Live<string> }) {
  return <RuneGlyph artwork={GLYPHS[name]} size={size} color={color} />;
}

/**
 * The beacon brazier: iron bowl under a two-tone flame whose height follows `strength` (0..1).
 * A failing keep visibly gutters; at 0 only the coals glow.
 */
export function Brazier({ size = 48, strength }: { size?: number; strength: Live<number> }) {
  const fire = () => Math.max(0, Math.min(1, readLive(strength)));
  const scale = bind(() => 0.3 + fire() * 0.7), lit = bind(() => (fire() > 0.02 ? 1 : 0));
  return <RuneView width={size} height={size} items="center" justify="center">
    <RuneView pin={[0, 0, null, null]} width={size} height={size} items="center" justify="center" scale={scale} opacity={lit}>
      <Glyph name="flameOuter" size={size} color="#ff7a1a" />
    </RuneView>
    <RuneView pin={[0, 0, null, null]} width={size} height={size} items="center" justify="center" scale={scale} opacity={lit}>
      <Glyph name="flameInner" size={size} color="#ffe07a" />
    </RuneView>
    <RuneView pin={[0, 0, null, null]} width={size} height={size} items="center" justify="center">
      <Glyph name="bowl" size={size} color="#7a6c5e" />
    </RuneView>
  </RuneView>;
}

/** A full-screen sheet the field is shut out behind: dark wash, one centred slab, Back on Escape. */
export function Sheet({ children, label, close, width = 640, variant = "stone" }: { children: ReactNode; label: string; close?: () => void; width?: number; variant?: "stone" | "parchment" }) {
  const viewport = useRuneViewport();
  return <RuneView anchor="fill" fill="#0b0705d8" modal {...(close === undefined ? {} : { onBack: close })}>
    <RuneView anchor="center" variant={variant} width={Math.min(width, viewport.width - 24)} maxHeight={viewport.height - 24} label={label} role="dialog">
      <RuneView scroll maxHeight={viewport.height - 60} gap={10}>{children}</RuneView>
    </RuneView>
  </RuneView>;
}

/** The viewport's class, read once per render for layout decisions that change structure. */
export function usePhone(): boolean { return useRuneViewport().width < 600; }

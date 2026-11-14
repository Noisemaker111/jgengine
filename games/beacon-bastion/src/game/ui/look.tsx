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

/**
 * A small-town diner and its noticeboard: a tomato-red accent, cash green, a cream ink, a teal
 * diner sign, a chalkboard, sticky notes, and the hot-pink door hanger that says DO NOT DISTURB.
 */
export const FIRE = "#ff7a4a", GOLD = "#8fe07a", BLOOD = "#ff5a6a", INK = "#fff6e6", DIM = "#c8c2b4", SOOT = "#1b1d24";
export const PARCHMENT_INK = "#3a2a12", ENAMEL = "#c8245a", STONE = "#2f3b36", WOOD = "#1f5a59";
export const FULL = { fraction: 1 };
export const DISPLAY = "Lilita One", BODY = "Nunito";

export const townTheme = {
  colors: { fire: FIRE, gold: GOLD, blood: BLOOD, ink: INK, muted: DIM, soot: SOOT, track: "#2a3430" },
  text: {
    body: { family: BODY, size: 15 },
    label: { family: BODY, size: 12, weight: 600, tracking: 1.4, color: DIM },
    heading: { family: DISPLAY, size: 26, weight: 400, color: INK, tracking: 0.5 },
  },
  variants: {
    // The teal diner sign: the HUD's readouts and the till.
    sign: { padding: [6, 12, 6, 12], gap: 6, gradient: { angle: 90, stops: [[0, "#2f8a86"], [1, "#1f5c5a"]] }, border: { width: 2, color: "#f6e7c1" }, radius: 10, shadow: { y: 3, blur: 6, color: "#00000070" } },
    // The chalkboard: the worker card, the end-of-day card and the settings board.
    stone: { padding: 16, gap: 10, gradient: { angle: 90, stops: [[0, "#34443e"], [1, "#25302c"]] }, border: { width: 4, color: "#c99a5a" }, radius: 8, shadow: { y: 5, blur: 14, color: "#00000090" } },
    // A sticky note on the corkboard.
    parchment: { padding: [16, 18, 18, 18], gap: 10, gradient: { angle: 90, stops: [[0, "#fff4a8"], [1, "#f6df72"]] }, border: { width: 1, color: "#d8b84a" }, radius: 3, shadow: { y: 4, blur: 10, color: "#00000070" } },
    // A tomato-red diner button to press.
    plank: { minHeight: 40, padding: [8, 16, 8, 16], gap: 8, items: "center", justify: "center", gradient: { angle: 90, stops: [[0, "#e4573f"], [1, "#b83a28"]] }, border: { width: 2, color: "#ffd9b0" }, radius: 12, hover: "#ffffff22", press: "#00000033" },
    // A rounded tile for the town's two big buttons; its recharge fill rises inside it.
    keystone: { items: "center", justify: "center", fill: "#2a2f3a", radius: 14, clip: true, hover: "#ffffff1a", press: "#00000033" },
    // The hot-pink DO NOT DISTURB door hanger: the wave call, New Day and the chosen shift.
    enamel: { minHeight: 44, padding: [10, 20, 10, 20], gap: 8, items: "center", justify: "center", gradient: { angle: 90, stops: [[0, "#f0407a"], [1, "#b01f52"]] }, border: { width: 2, color: "#ffe08a" }, radius: 22, hover: "#ffffff22", press: "#00000033", shadow: { y: 0, blur: 14, color: "#ff4a8a60" } },
  },
  motion: { duration: 180, distance: 10, bounce: 0 },
} satisfies RuneTheme;

export type TextProps = Omit<RuneElementProps, "text"> & { text?: Live<string> };
export function Text({ text, ...props }: TextProps) { return <RuneLabel {...props} {...(text === undefined ? {} : { value: text })} />; }
export function Tag(props: TextProps) { return <Text {...townTheme.text.label} {...props} />; }
export function Heading(props: TextProps) { return <Text {...townTheme.text.heading} {...props} />; }
/** A short line over the street, on a dark backing so it reads over bright lawns. */
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
 * The town's attention span as a mug of coffee: the steam rises as high as the town is focused and
 * the coffee is there while there is any focus left. A distracted town visibly goes cold.
 */
export function AttentionMug({ size = 48, strength }: { size?: number; strength: Live<number> }) {
  const focus = () => Math.max(0, Math.min(1, readLive(strength)));
  const scale = bind(() => 0.3 + focus() * 0.7), lit = bind(() => (focus() > 0.02 ? 1 : 0));
  return <RuneView width={size} height={size} items="center" justify="center">
    <RuneView pin={[0, 0, null, null]} width={size} height={size} items="center" justify="center" scale={scale} opacity={lit}>
      <Glyph name="steam" size={size} color="#f4f0ea" />
    </RuneView>
    <RuneView pin={[0, 0, null, null]} width={size} height={size} items="center" justify="center" opacity={lit}>
      <Glyph name="coffeeFill" size={size} color="#8a4a22" />
    </RuneView>
    <RuneView pin={[0, 0, null, null]} width={size} height={size} items="center" justify="center">
      <Glyph name="mug" size={size} color="#ffffff" />
    </RuneView>
  </RuneView>;
}

/** A full-screen sheet the street is shut out behind: dark wash, one centred board, Back on Escape. */
export function Sheet({ children, label, close, width = 640, variant = "stone" }: { children: ReactNode; label: string; close?: () => void; width?: number; variant?: "stone" | "parchment" }) {
  const viewport = useRuneViewport();
  return <RuneView anchor="fill" fill="#0b1014d0" modal {...(close === undefined ? {} : { onBack: close })}>
    <RuneView anchor="center" variant={variant} width={Math.min(width, viewport.width - 24)} maxHeight={viewport.height - 24} label={label} role="dialog">
      <RuneView scroll maxHeight={viewport.height - 60} gap={10}>{children}</RuneView>
    </RuneView>
  </RuneView>;
}

/** The viewport's class, read once per render for layout decisions that change structure. */
export function usePhone(): boolean { return useRuneViewport().width < 600; }

import {
  createElement,
  forwardRef,
  useInsertionEffect,
  type CSSProperties,
  type ElementType,
  type FocusEvent,
  type HTMLAttributes,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import { useHudInteract, type HudInteractListener } from "./hudInteract";

/**
 * What a frame is made of. Every material is a generated texture (SVG turbulence and lighting, no
 * downloaded art) under real lighting, so a panel reads as an object in the game's world instead of
 * a web page's flat or blurred rectangle.
 *
 * - `steel`: brushed metal with a cold sheen.
 * - `brass`: warm, polished metal.
 * - `hull`: painted plate with rivets and wear, for subs, ships and machines.
 * - `wood`: planked grain.
 * - `stone`: carved, pitted rock.
 * - `paper`: fibrous card or parchment.
 * - `enamel`: glossy painted sign metal, like fairground and street signage.
 * - `glass`: a tinted visor or screen with scanlines and a bevelled highlight.
 * - `carbon`: woven fibre, for racing and tech.
 * - `leather`: stitched hide, for journals and saddlebags.
 */
export type GameMaterial = "steel" | "brass" | "hull" | "wood" | "stone" | "paper" | "enamel" | "glass" | "carbon" | "leather";

/**
 * The frame's silhouette. Every cut is a clip path in pixels, so corners stay the same size at any
 * panel size.
 *
 * - `box`: square corners.
 * - `chamfer`: all four corners cut at 45 degrees.
 * - `notch`: two opposite corners cut.
 * - `slant`: a parallelogram.
 * - `tab`: a raised tab along the top-left.
 * - `banner`: a hanging banner with a V notch at the foot.
 * - `shield`: a heraldic point at the foot.
 * - `ticket`: notched sides, like a stub.
 * - `torn`: a ragged bottom edge.
 * - `hex`: pointed ends, for buttons and chips.
 */
export type GameCut = "box" | "chamfer" | "notch" | "slant" | "tab" | "banner" | "shield" | "ticket" | "torn" | "hex";

/** Everything a material decides: its texture, base colour, lighting, text colour and default edge. */
export interface GameMaterialLook {
  /** Base colour under the texture; `tint` replaces it. */
  base: string;
  /** Text drawn on the material. */
  ink: string;
  /** Default rim colour. */
  edge: string;
  /** CSS background layers above the base colour (texture, lighting, wear). */
  layers: string;
  /** Blend for the layers over the base colour. */
  blend: string;
  /** Extra declarations (e.g. a backdrop filter for glass). */
  extra?: CSSProperties;
}

const svg = (body: string, size = 256): string =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>${body}</svg>`,
  ).replace(/'/g, "%27")}")`;

/** Tileable noise: stitched turbulence mapped to one channel of grey with a chosen strength. */
const noise = ({
  frequency,
  octaves = 3,
  seed = 3,
  type = "fractalNoise",
  alpha,
  size = 256,
}: {
  frequency: string;
  octaves?: number;
  seed?: number;
  type?: "fractalNoise" | "turbulence";
  alpha: number;
  size?: number;
}): string =>
  svg(
    `<filter id='n' x='0' y='0' width='100%' height='100%'><feTurbulence type='${type}' baseFrequency='${frequency}' numOctaves='${octaves}' seed='${seed}' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 ${alpha} 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/>`,
    size,
  );

/** Relief: turbulence lit from the top-left, for stone and leather pits. */
const relief = ({ frequency, seed = 5, strength = 1.6, alpha = 0.55 }: { frequency: string; seed?: number; strength?: number; alpha?: number }): string =>
  svg(
    `<filter id='r' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='${frequency}' numOctaves='4' seed='${seed}' stitchTiles='stitch' result='t'/><feDiffuseLighting in='t' surfaceScale='${strength}' lighting-color='white' result='l'><feDistantLight azimuth='225' elevation='42'/></feDiffuseLighting><feColorMatrix in='l' values='0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0 0.5 1.2 0 0 0 -0.6'/><feComponentTransfer><feFuncA type='linear' slope='${alpha}'/></feComponentTransfer></filter><rect width='100%' height='100%' filter='url(#r)'/>`,
  );

const GRAIN_WOOD = noise({ frequency: "0.008 0.36", octaves: 4, seed: 11, alpha: 0.85 });
const GRAIN_PLANKS =
  "repeating-linear-gradient(180deg, transparent 0 46px, rgba(20,10,4,0.5) 46px 48px, rgba(255,220,170,0.1) 48px 49px)";
const BRUSHED = noise({ frequency: "0.002 0.75", octaves: 2, seed: 4, alpha: 0.7 });
const FINE = noise({ frequency: "0.9", octaves: 2, seed: 8, alpha: 0.32, size: 160 });
const FIBRE = noise({ frequency: "0.04 0.4", octaves: 3, seed: 21, type: "turbulence", alpha: 0.16 });
const BLOTCH = noise({ frequency: "0.012", octaves: 3, seed: 9, alpha: 0.42 });
const PITS = relief({ frequency: "0.045", seed: 14, strength: 2.4, alpha: 0.7 });
const HIDE = relief({ frequency: "0.16", seed: 6, strength: 1.2, alpha: 0.5 });

/** Top-lit body: a highlight band and a darker foot, so the surface has volume. */
const LIT = "linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.04) 18%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.28) 100%)";
const VIGNETTE = "radial-gradient(130% 120% at 50% 40%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.42) 100%)";
const RIVET = (x: string, y: string) =>
  `radial-gradient(circle at ${x} ${y}, rgba(255,255,255,0.75) 0 1.2px, rgba(40,44,52,0.9) 1.6px 3.4px, rgba(0,0,0,0.45) 3.8px, transparent 4.6px)`;
const RIVETS = [RIVET("12px", "12px"), RIVET("calc(100% - 12px)", "12px"), RIVET("12px", "calc(100% - 12px)"), RIVET("calc(100% - 12px)", "calc(100% - 12px)")].join(", ");
const SCANLINES = "repeating-linear-gradient(180deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 3px)";
const WEAVE =
  "repeating-linear-gradient(45deg, rgba(255,255,255,0.07) 0 3px, transparent 3px 6px), repeating-linear-gradient(-45deg, rgba(0,0,0,0.35) 0 3px, transparent 3px 6px)";
const STITCH = "linear-gradient(transparent, transparent)";

/**
 * The built-in materials. A game reads one to match its own pieces (`GAME_MATERIALS.wood.ink`), or
 * passes `tint` / `edge` to `GameFrame` to recolour one.
 */
export const GAME_MATERIALS: Readonly<Record<GameMaterial, GameMaterialLook>> = {
  steel: {
    base: "#5d6672",
    ink: "#f2f5f8",
    edge: "#1b1f25",
    layers: `${LIT}, linear-gradient(115deg, rgba(255,255,255,0) 30%, rgba(255,255,255,0.18) 48%, rgba(255,255,255,0) 62%), ${BRUSHED}`,
    blend: "normal, screen, overlay",
  },
  brass: {
    base: "#a07a2c",
    ink: "#1d1405",
    edge: "#3a2a0b",
    layers: `${LIT}, linear-gradient(120deg, rgba(255,240,190,0) 25%, rgba(255,240,190,0.4) 45%, rgba(255,240,190,0) 60%), ${BRUSHED}, ${BLOTCH}`,
    blend: "normal, screen, overlay, multiply",
  },
  hull: {
    base: "#2f4a57",
    ink: "#e8f3f5",
    edge: "#0c161b",
    layers: `${RIVETS}, ${LIT}, ${BLOTCH}, ${FINE}`,
    blend: "normal, normal, multiply, overlay",
  },
  wood: {
    base: "#7a4a24",
    ink: "#fff3df",
    edge: "#2b160a",
    layers: `${LIT}, ${GRAIN_PLANKS}, ${GRAIN_WOOD}, ${VIGNETTE}`,
    blend: "normal, normal, overlay, multiply",
  },
  stone: {
    base: "#77736b",
    ink: "#fbf7ee",
    edge: "#26231f",
    layers: `${LIT}, ${PITS}, ${BLOTCH}, ${VIGNETTE}`,
    blend: "normal, overlay, multiply, multiply",
  },
  paper: {
    base: "#efe3c6",
    ink: "#2b2014",
    edge: "#5b4630",
    layers: `${FIBRE}, ${FINE}, radial-gradient(140% 110% at 50% 45%, rgba(0,0,0,0) 60%, rgba(120,80,30,0.32) 100%)`,
    blend: "multiply, multiply, multiply",
  },
  enamel: {
    base: "#c8312c",
    ink: "#fffaf0",
    edge: "#fffaf0",
    layers: `linear-gradient(180deg, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0.1) 38%, rgba(255,255,255,0) 40%, rgba(0,0,0,0.18) 100%), ${FINE}`,
    blend: "normal, overlay",
  },
  glass: {
    base: "rgba(18, 64, 82, 0.46)",
    ink: "#dcfbff",
    edge: "rgba(150, 240, 255, 0.85)",
    layers: `linear-gradient(160deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.04) 22%, rgba(255,255,255,0) 50%, rgba(140,240,255,0.08) 100%), ${SCANLINES}`,
    blend: "screen, normal",
    extra: { backdropFilter: "blur(6px) saturate(1.4)", WebkitBackdropFilter: "blur(6px) saturate(1.4)" },
  },
  carbon: {
    base: "#1a1c20",
    ink: "#f4f5f7",
    edge: "#3b4049",
    layers: `${LIT}, ${WEAVE}`,
    blend: "normal, normal",
  },
  leather: {
    base: "#5a3320",
    ink: "#f6e7cf",
    edge: "#2a160c",
    layers: `${LIT}, ${HIDE}, ${VIGNETTE}, ${STITCH}`,
    blend: "normal, overlay, multiply, normal",
  },
};

/**
 * The clip path for a cut at a corner size of `depth` pixels.
 *
 * @capability game-frame-cut clip path for an angled or irregular frame silhouette (chamfer, banner, ticket, torn…)
 */
export function gameCutPath(cut: GameCut, depth = 14): string {
  const c = `${depth}px`;
  const h = `${depth / 2}px`;
  switch (cut) {
    case "box":
      return "none";
    case "chamfer":
      return `polygon(${c} 0, calc(100% - ${c}) 0, 100% ${c}, 100% calc(100% - ${c}), calc(100% - ${c}) 100%, ${c} 100%, 0 calc(100% - ${c}), 0 ${c})`;
    case "notch":
      return `polygon(${c} 0, 100% 0, 100% calc(100% - ${c}), calc(100% - ${c}) 100%, 0 100%, 0 ${c})`;
    case "slant":
      return `polygon(${c} 0, 100% 0, calc(100% - ${c}) 100%, 0 100%)`;
    case "tab":
      return `polygon(0 0, min(44%, 220px) 0, calc(min(44%, 220px) + ${c}) ${c}, 100% ${c}, 100% 100%, 0 100%)`;
    case "banner":
      return `polygon(0 0, 100% 0, 100% 100%, 50% calc(100% - ${c}), 0 100%)`;
    case "shield":
      return `polygon(0 0, 100% 0, 100% calc(100% - ${depth * 2}px), 50% 100%, 0 calc(100% - ${depth * 2}px))`;
    case "ticket":
      return `polygon(0 0, 100% 0, 100% calc(50% - ${h}), calc(100% - ${h}) 50%, 100% calc(50% + ${h}), 100% 100%, 0 100%, 0 calc(50% + ${h}), ${h} 50%, 0 calc(50% - ${h}))`;
    case "torn": {
      // A fixed ragged foot, so the same panel tears the same way every frame.
      const teeth = [0, 7, 12, 19, 26, 31, 38, 45, 50, 57, 63, 70, 76, 82, 88, 94, 100];
      const depths = [0.2, 0.9, 0.35, 1, 0.5, 0.15, 0.8, 0.4, 0.95, 0.3, 0.7, 0.1, 0.85, 0.45, 1, 0.25, 0.6];
      const foot = teeth.map((x, i) => `${x}% calc(100% - ${(depths[i]! * depth).toFixed(1)}px)`).reverse();
      return `polygon(0 0, 100% 0, ${foot.join(", ")})`;
    }
    case "hex":
      return `polygon(${c} 0, calc(100% - ${c}) 0, 100% 50%, calc(100% - ${c}) 100%, ${c} 100%, 0 50%)`;
  }
}

/** Props for {@link GameFrame}. */
export interface GameFrameProps extends Omit<HTMLAttributes<HTMLElement>, "color"> {
  /** What it is made of. Default `steel`. */
  material?: GameMaterial;
  /** Silhouette. Default `chamfer`. */
  cut?: GameCut;
  /** Corner and notch size in px. Default 14. */
  depth?: number;
  /** Replaces the material's base colour (e.g. a team or rarity colour). */
  tint?: string;
  /** Rim colour; `"none"` draws no rim. Default the material's edge. */
  edge?: string;
  /** Rim thickness in px. Default 2. */
  edgeWidth?: number;
  /** Drop shadow under the frame. Default true. */
  shadow?: boolean;
  /** Outer glow colour, e.g. for a selected or charged frame. */
  glow?: string;
  /** Inner padding. Default `12px 16px`. */
  padding?: CSSProperties["padding"];
  /** Element to render. Default `div`; `button` makes it a pressable game button. */
  as?: ElementType;
  /** Draws hover lift, press sink and the engine UI sounds; set automatically for `as="button"`. */
  interactive?: boolean;
  /** UI cue name for hover/activate sounds. Default `"confirm"` on interactive frames. */
  cue?: string;
  onInteract?: HudInteractListener;
  /** Anything a `button` takes when `as="button"`. */
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  children?: ReactNode;
}

const FRAME_CSS = `@layer components.jgengine {
[data-jg-frame] { position: relative; box-sizing: border-box; display: block; isolation: isolate; color: var(--jg-gf-ink); filter: var(--jg-gf-filter); transition: translate calc(var(--jg-motion-fast, 120ms) * var(--jg-motion-scale, 1)) var(--jg-ease, ease), filter calc(var(--jg-motion-fast, 120ms) * var(--jg-motion-scale, 1)) var(--jg-ease, ease), scale calc(var(--jg-motion-fast, 120ms) * var(--jg-motion-scale, 1)) var(--jg-ease-spring, ease); }
[data-jg-frame] > [data-jg-frame-face] { position: relative; box-sizing: border-box; height: 100%; padding: var(--jg-gf-padding, 12px 16px); clip-path: var(--jg-gf-cut); background: var(--jg-gf-layers), var(--jg-gf-base); background-blend-mode: var(--jg-gf-blend); background-color: var(--jg-gf-base); }
[data-jg-frame][data-interactive] { cursor: pointer; user-select: none; -webkit-tap-highlight-color: transparent; }
button[data-jg-frame] { appearance: none; border: 0; margin: 0; padding: 0; background: none; font: inherit; color: var(--jg-gf-ink); text-align: inherit; }
@media (hover: hover) {
  [data-jg-frame][data-interactive]:not(:disabled):hover { translate: 0 -2px; filter: var(--jg-gf-filter) brightness(1.1); }
}
[data-jg-frame][data-interactive]:not(:disabled):active { translate: 0 1px; scale: 0.98; filter: var(--jg-gf-filter) brightness(0.92); }
[data-jg-frame][data-interactive]:focus-visible { outline: none; filter: var(--jg-gf-filter) drop-shadow(0 0 6px var(--jg-accent, #ffd23f)) brightness(1.08); }
[data-jg-frame]:disabled { cursor: not-allowed; filter: var(--jg-gf-filter) grayscale(0.7) brightness(0.7); }
}`;

const FRAME_STYLE_ID = "jg-game-frame-styles";

function ensureFrameStyles(): void {
  if (typeof document === "undefined" || document.getElementById(FRAME_STYLE_ID) !== null) return;
  const style = document.createElement("style");
  style.id = FRAME_STYLE_ID;
  style.textContent = FRAME_CSS;
  document.head.appendChild(style);
}

/** The rim as eight offset drop shadows (a clip path hides borders), then the cast shadow and glow. */
function frameFilter(edge: string, width: number, shadow: boolean, glow: string | undefined): string {
  const parts: string[] = [];
  if (edge !== "none" && width > 0) {
    const w = `${width}px`;
    for (const [x, y] of [[w, "0"], [`-${w}`, "0"], ["0", w], ["0", `-${w}`], [w, w], [`-${w}`, w], [w, `-${w}`], [`-${w}`, `-${w}`]] as const) {
      parts.push(`drop-shadow(${x} ${y} 0 ${edge})`);
    }
  }
  if (glow !== undefined) parts.push(`drop-shadow(0 0 10px ${glow})`);
  if (shadow) parts.push("drop-shadow(0 8px 10px rgba(0,0,0,0.45))");
  return parts.length === 0 ? "none" : parts.join(" ");
}

/**
 * The CSS variables that dress a frame. `GameFrame` sets them; spread them on your own element (with
 * `data-jg-frame` on it and `data-jg-frame-face` on its single child) to dress one by hand.
 *
 * @capability game-frame-style CSS variables for a material frame on an element the game already owns
 */
export function gameFrameVars({
  material = "steel",
  cut = "chamfer",
  depth = 14,
  tint,
  edge,
  edgeWidth = 2,
  shadow = true,
  glow,
  padding,
}: Pick<GameFrameProps, "material" | "cut" | "depth" | "tint" | "edge" | "edgeWidth" | "shadow" | "glow" | "padding"> = {}): CSSProperties {
  const look = GAME_MATERIALS[material];
  const vars: Record<string, string | number | undefined> = {
    "--jg-gf-base": tint ?? look.base,
    "--jg-gf-layers": look.layers,
    "--jg-gf-blend": `${look.blend}, normal`,
    "--jg-gf-ink": look.ink,
    "--jg-gf-cut": gameCutPath(cut, depth),
    "--jg-gf-filter": frameFilter(edge ?? look.edge, edgeWidth, shadow, glow),
    "--jg-gf-padding": typeof padding === "number" ? `${padding}px` : padding,
  };
  return vars as CSSProperties;
}

/**
 * A panel, card or button made of a material, with a cut silhouette and a rim: the building block
 * for screens that look like part of the game rather than a web page. `as="button"` makes it a game
 * button that lifts on hover, sinks on press, shows a glow on keyboard focus and plays the engine
 * UI sounds.
 *
 * ```tsx
 * <GameFrame material="wood" cut="banner">Wave 4</GameFrame>
 * <GameFrame as="button" material="enamel" tint="#1f6feb" cut="hex" onClick={start}>Open the park</GameFrame>
 * ```
 *
 * @capability game-frame material frame (steel, wood, stone, paper, glass…) with an angled or irregular cut, as a panel or a game button
 */
export const GameFrame = forwardRef<HTMLElement, GameFrameProps>(function GameFrame(
  {
    material = "steel",
    cut = "chamfer",
    depth,
    tint,
    edge,
    edgeWidth,
    shadow,
    glow,
    padding,
    as,
    interactive,
    cue,
    onInteract,
    type,
    disabled,
    style,
    children,
    onPointerEnter,
    onClick,
    onFocus,
    ...rest
  },
  ref,
) {
  useInsertionEffect(ensureFrameStyles, []);
  const tag: ElementType = as ?? "div";
  const pressable = interactive ?? tag === "button";
  const report = useHudInteract("frame", cue ?? (pressable ? "confirm" : undefined), onInteract);
  const look = GAME_MATERIALS[material];
  const vars = gameFrameVars({ material, cut, depth, tint, edge, edgeWidth, shadow, glow, padding });
  return createElement(
    tag,
    {
      ...rest,
      ref,
      "data-jg-frame": material,
      "data-cut": cut,
      "data-interactive": pressable ? "" : undefined,
      ...(tag === "button" ? { type: type ?? "button", disabled } : {}),
      style: { ...vars, ...look.extra, ...style },
      onPointerEnter: (event: PointerEvent<HTMLElement>) => {
        if (pressable && !disabled) report("hover");
        onPointerEnter?.(event);
      },
      onFocus: (event: FocusEvent<HTMLElement>) => {
        if (pressable && !disabled) report("focus");
        onFocus?.(event);
      },
      onClick: (event: MouseEvent<HTMLElement>) => {
        if (pressable && !disabled) report("activate");
        onClick?.(event);
      },
    },
    createElement("span", { "data-jg-frame-face": "", style: { display: "block" } }, children),
  );
});

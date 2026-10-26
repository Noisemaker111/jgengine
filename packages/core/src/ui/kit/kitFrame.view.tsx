import {
  createElement,
  useInsertionEffect,
  type CSSProperties,
  type ElementType,
  type FocusEvent,
  type HTMLAttributes,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from "react";

import type { HudInteractKind } from "@jgengine/core/hud/hudInteract.view";

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
export type KitMaterial = "steel" | "brass" | "hull" | "wood" | "stone" | "paper" | "enamel" | "glass" | "carbon" | "leather";

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
export type KitCut = "box" | "chamfer" | "notch" | "slant" | "tab" | "banner" | "shield" | "ticket" | "torn" | "hex";

/** Everything a material decides: its texture, base colour, lighting, text colour and default edge. */
export interface KitMaterialLook {
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
  /** Extra declarations a material needs. Never a `filter` or `backdrop-filter`: those re-render every frame over a live 3D scene. */
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
 * The built-in materials. A game reads one to match its own pieces (`KIT_MATERIALS.wood.ink`), or
 * passes `tint` / `edge` to a material `KitPanel` or `KitButton` to recolour one.
 */
export const KIT_MATERIALS: Readonly<Record<KitMaterial, KitMaterialLook>> = {
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
    // No backdrop blur: it re-renders every frame over a live 3D scene. A denser tint reads as a visor instead.
    base: "rgba(12, 46, 60, 0.74)",
    ink: "#dcfbff",
    edge: "rgba(150, 240, 255, 0.85)",
    layers: `linear-gradient(160deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.04) 22%, rgba(255,255,255,0) 50%, rgba(140,240,255,0.08) 100%), ${SCANLINES}`,
    blend: "screen, normal",
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
 * @capability kit-frame-cut clip path for an angled or irregular frame silhouette (chamfer, banner, ticket, torn…)
 */
export function kitCutPath(cut: KitCut, depth = 14): string {
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

/**
 * How a material surface looks: what it is made of, its silhouette and rim. Give `material` to a
 * `KitPanel` or `KitButton` and it draws as that object instead of in the kit's own language.
 */
export interface KitFrameLook {
  /** What it is made of. */
  material: KitMaterial;
  /** Silhouette. Default `chamfer`. */
  cut?: KitCut;
  /** Corner and notch size in px. Default 14. */
  depth?: number;
  /** Replaces the material's base colour (e.g. a team or rarity colour). */
  tint?: string;
  /** Rim colour; `"none"` draws no rim. Default the material's edge. */
  edge?: string;
  /** Rim thickness in px. Default 2. */
  edgeWidth?: number;
  /** A hard cast shadow under the frame (a clipped plate, not a filter). Default true; a `glow` replaces it. */
  shadow?: boolean;
  /** Outer ring colour for a selected or charged frame (a clipped plate 3px wide, not a blur). */
  glow?: string;
  /** Inner padding. Default `12px 16px`. */
  padding?: CSSProperties["padding"];
}

// No CSS `filter` or `backdrop-filter` anywhere: over a live 3D canvas a filtered element is re-rendered
// every frame, and a HUD of twenty drop-shadow rims took a game from 57 fps to 5. The rim is a clipped
// backing plate the face sits inset on, the cast shadow and glow are more plates under it, and hover and
// press light the face with an overlay.
const FRAME_CSS = `@layer components.jgengine {
[data-jg-frame] { position: relative; box-sizing: border-box; display: block; isolation: isolate; padding: var(--jg-gf-rim-w, 2px); color: var(--jg-gf-ink); transition: translate calc(var(--jg-motion-fast, 120ms) * var(--jg-motion-scale, 1)) var(--jg-ease, ease), scale calc(var(--jg-motion-fast, 120ms) * var(--jg-motion-scale, 1)) var(--jg-ease-spring, ease); }
[data-jg-frame]::before { content: ""; position: absolute; inset: 0; z-index: -1; clip-path: var(--jg-gf-cut); background: var(--jg-gf-rim, transparent); pointer-events: none; }
[data-jg-frame][data-shadow]::after { content: ""; position: absolute; inset: 0; z-index: -2; translate: 0 var(--jg-gf-shadow-y, 4px); clip-path: var(--jg-gf-cut); background: rgba(0, 0, 0, 0.36); pointer-events: none; }
[data-jg-frame][data-glow]::after { content: ""; position: absolute; inset: -3px; z-index: -2; clip-path: var(--jg-gf-cut); background: var(--jg-gf-glow); opacity: 0.85; pointer-events: none; }
[data-jg-frame] > [data-jg-frame-face] { position: relative; box-sizing: border-box; height: 100%; isolation: isolate; padding: var(--jg-gf-padding, 12px 16px); clip-path: var(--jg-gf-face-cut, var(--jg-gf-cut)); background: var(--jg-gf-layers), var(--jg-gf-base); background-blend-mode: var(--jg-gf-blend); background-color: var(--jg-gf-base); }
[data-jg-frame] > [data-jg-frame-face]::after { content: ""; position: absolute; inset: 0; z-index: -1; background: var(--jg-gf-light, transparent); pointer-events: none; transition: background-color calc(var(--jg-motion-fast, 120ms) * var(--jg-motion-scale, 1)) var(--jg-ease, ease); }
[data-jg-frame][data-interactive] { cursor: pointer; user-select: none; -webkit-tap-highlight-color: transparent; }
button[data-jg-frame] { appearance: none; border: 0; margin: 0; background: none; font: inherit; color: var(--jg-gf-ink); text-align: inherit; }
@media (hover: hover) {
  [data-jg-frame][data-interactive]:not(:disabled):hover { translate: 0 -2px; --jg-gf-light: rgba(255, 255, 255, 0.1); }
}
[data-jg-frame][data-interactive]:not(:disabled):active { translate: 0 1px; scale: 0.98; --jg-gf-light: rgba(0, 0, 0, 0.12); }
[data-jg-frame][data-interactive]:focus-visible { outline: none; }
[data-jg-frame][data-interactive]:focus-visible::after { content: ""; position: absolute; inset: -3px; z-index: -2; translate: 0 0; clip-path: var(--jg-gf-cut); background: var(--jg-accent, #ffd23f); opacity: 1; pointer-events: none; }
[data-jg-frame]:disabled { cursor: not-allowed; opacity: 0.6; --jg-gf-light: rgba(40, 40, 44, 0.45); }
}`;

const FRAME_STYLE_ID = "jg-kit-frame-styles";

function ensureFrameStyles(): void {
  if (typeof document === "undefined" || document.getElementById(FRAME_STYLE_ID) !== null) return;
  const style = document.createElement("style");
  style.id = FRAME_STYLE_ID;
  style.textContent = FRAME_CSS;
  document.head.appendChild(style);
}

/** A rim this many px wide makes the face's cut corners this much smaller, so the rim stays even along a 45-degree cut. */
const FACE_CORNER_SHRINK = Math.SQRT2 - 1;

/**
 * The CSS variables that dress a material frame. A material `KitPanel`/`KitButton` sets them;
 * spread them on your own element (with `data-jg-frame` on it and `data-jg-frame-face` on its single
 * child) to dress one by hand. Add `data-shadow` for the cast shadow or `data-glow` for the lit
 * ring. It also installs the frame stylesheet, so a hand-dressed element looks right even when no
 * material panel has mounted yet (a HUD that starts in play, with no menu before it).
 *
 * @capability kit-frame-style CSS variables for a material frame on an element the game already owns
 */
export function kitFrameVars({
  material = "steel",
  cut = "chamfer",
  depth = 14,
  tint,
  edge,
  edgeWidth = 2,
  glow,
  padding,
}: Partial<KitFrameLook> = {}): CSSProperties {
  ensureFrameStyles();
  const look = KIT_MATERIALS[material];
  const rim = edge ?? look.edge;
  const rimWidth = rim === "none" ? 0 : Math.max(0, edgeWidth);
  const vars: Record<string, string | number | undefined> = {
    "--jg-gf-base": tint ?? look.base,
    "--jg-gf-layers": look.layers,
    "--jg-gf-blend": `${look.blend}, normal`,
    "--jg-gf-ink": look.ink,
    "--jg-gf-cut": kitCutPath(cut, depth),
    "--jg-gf-face-cut": kitCutPath(cut, Math.max(0, depth - rimWidth * FACE_CORNER_SHRINK)),
    "--jg-gf-rim": rimWidth === 0 ? "transparent" : rim,
    "--jg-gf-rim-w": `${rimWidth}px`,
    "--jg-gf-glow": glow,
    "--jg-gf-padding": typeof padding === "number" ? `${padding}px` : padding,
  };
  return vars as CSSProperties;
}

/** Props of the material surface a material `KitPanel`/`KitButton` renders. @internal */
export interface KitFrameProps extends KitFrameLook, Omit<HTMLAttributes<HTMLElement>, "color"> {
  as?: ElementType;
  pressable: boolean;
  report: (kind: HudInteractKind) => void;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  ref?: Ref<HTMLElement>;
  children?: ReactNode;
}

/**
 * A material surface: a cut silhouette with a rim, a cast shadow or glow, and a generated texture.
 * Pressable ones lift on hover, sink on press, glow on keyboard focus and report UI cues.
 * @internal
 */
export function KitFrame({
  material,
  cut = "chamfer",
  depth,
  tint,
  edge,
  edgeWidth,
  shadow,
  glow,
  padding,
  as,
  pressable,
  report,
  type,
  disabled,
  style,
  children,
  onPointerEnter,
  onClick,
  onFocus,
  ...rest
}: KitFrameProps): ReactNode {
  useInsertionEffect(ensureFrameStyles, []);
  const tag: ElementType = as ?? "div";
  const vars = kitFrameVars({ material, cut, depth, tint, edge, edgeWidth, glow, padding });
  return createElement(
    tag,
    {
      ...rest,
      "data-jg-frame": material,
      "data-cut": cut,
      "data-interactive": pressable ? "" : undefined,
      // A lit frame glows instead of casting a shadow; both are clipped plates under the rim, never filters.
      "data-glow": glow === undefined ? undefined : "",
      "data-shadow": glow === undefined && shadow !== false ? "" : undefined,
      ...(tag === "button" ? { type: type ?? "button", disabled } : {}),
      style: { ...vars, ...KIT_MATERIALS[material].extra, ...style },
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
}

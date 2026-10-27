import type { ButtonHTMLAttributes, ComponentType, CSSProperties, HTMLAttributes, ReactNode } from "react";

import type { SoundDef } from "@jgengine/core/audio/audioFalloff";
import { UI_CUE_BUS, uiCueSoundId, type UiCue } from "@jgengine/core/ui/uiCues";

/** The meaning a kit component carries; each kit draws it in its own language. */
export type KitTone = "neutral" | "accent" | "good" | "warn" | "bad";

/** The input device a prompt is drawn for. */
export type KitDevice = "keyboard" | "gamepad" | "touch";

/** A button in the kit's language. Every native button attribute passes through to the root `<button>`. */
export interface KitButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  /** `primary` is the one thing to press; `secondary` the alternatives; `ghost` the quiet ones. Default `secondary`. */
  variant?: "primary" | "secondary" | "ghost";
  /** Default `md`. */
  size?: "sm" | "md" | "lg";
  tone?: KitTone;
  /** Leading icon. */
  icon?: ReactNode;
  /** Input glyph drawn on the button (a key cap, a pad button): what to press besides clicking. */
  glyph?: ReactNode;
  /** Toggle buttons: drawn as held down. */
  pressed?: boolean;
  type?: "button" | "submit" | "reset";
}

/** A surface that holds content. Kits must not draw it as a plain filled rounded rectangle. */
export interface KitPanelProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  /** Small label above the title (a category, a source). */
  eyebrow?: ReactNode;
  title?: ReactNode;
  /** Right side of the header: a count, a timer, a close button. */
  aside?: ReactNode;
  footer?: ReactNode;
  tone?: KitTone;
  /**
   * `hud` a compact in-play block · `card` a menu/detail card · `dialog` a centred modal ·
   * `pane` a GameMenu detail pane · `strip` a one-line band. Default `hud`.
   */
  variant?: "hud" | "card" | "dialog" | "pane" | "strip";
  /** Landmark element. Default `section`. */
  as?: "section" | "div" | "aside" | "nav" | "header";
  /** Plays the kit's exit motion (`data-state="closed"`); the host unmounts it after `motion.exitMs`. */
  leaving?: boolean;
  children?: ReactNode;
}

/** A value against a maximum: health, a timer, progress. */
export interface KitMeterProps {
  value: number;
  /** Default 1. */
  max?: number;
  label?: ReactNode;
  /** `true` prints `value / max`; a node prints itself. */
  readout?: boolean | ReactNode;
  tone?: KitTone;
  /** Default `bar`. */
  variant?: "bar" | "segments" | "ring";
  /** Cell count for `segments`. Default 10. */
  segments?: number;
  /** Default `md`. */
  size?: "sm" | "md" | "lg";
  className?: string;
  style?: CSSProperties;
}

/** "Press this to do that": the contextual prompt, drawn for the device the player is using. */
export interface KitPromptProps {
  /** The glyph for the device: `"E"`, `"A"`, `"RT"`, `"Tap"`. */
  glyph: ReactNode;
  label: ReactNode;
  device: KitDevice;
  /** 0..1 hold progress for hold-to-confirm. */
  progress?: number | undefined;
  tone?: KitTone | undefined;
  /** Touch: the prompt itself is the control. When set the prompt renders as a `<button>`. */
  onActivate?: (() => void) | undefined;
  className?: string | undefined;
  style?: CSSProperties | undefined;
}

/** A short-lived message. */
export interface KitToastProps {
  tone: KitTone;
  children: ReactNode;
  title?: ReactNode;
  icon?: ReactNode;
  /** Repeats folded into one toast (`×3`). */
  count?: number;
  /** Plays the kit's exit motion (`data-state="closed"`); the host unmounts it after `motion.exitMs`. */
  leaving?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** One verb in a {@link KitMenuProps} list. */
export interface KitMenuItem {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  badge?: ReactNode;
  /** Quieter row under a divider (quit, back). */
  secondary?: boolean;
}

/** A list of verbs with one highlighted: title screen, pause, a choice. Navigation belongs to the host. */
export interface KitMenuProps {
  items: readonly KitMenuItem[];
  activeId: string | null;
  /**
   * Spread onto each item's `<button>`: the shared keyboard/gamepad/pointer navigation (focus, hover,
   * click, data attributes). Spread it last-but-one, then add the kit's own `className`.
   */
  itemProps: (id: string) => Record<string, unknown>;
  onSelect: (id: string) => void;
  /** Default `list`. */
  variant?: "title" | "pause" | "list";
  className?: string;
  style?: CSSProperties;
}

/** The frame around a minimap or radar. The map itself is the child, drawn inside the frame's window. */
export interface KitMinimapFrameProps {
  children?: ReactNode;
  /** Outer size in px; the frame is square. */
  size: number;
  /** Default `square`. */
  shape?: "circle" | "square";
  /** Location name. */
  label?: ReactNode;
  /** Player heading in radians (0 = north, clockwise), for the north marker. */
  heading?: number;
  className?: string;
  style?: CSSProperties;
}

/** The seven parts every kit ships, so switching kits never breaks a game. */
export interface UiKitComponents {
  Button: ComponentType<KitButtonProps>;
  Panel: ComponentType<KitPanelProps>;
  Meter: ComponentType<KitMeterProps>;
  Prompt: ComponentType<KitPromptProps>;
  Toast: ComponentType<KitToastProps>;
  Menu: ComponentType<KitMenuProps>;
  MinimapFrame: ComponentType<KitMinimapFrameProps>;
}

/** The names of {@link UiKitComponents}. */
export type UiKitPart = keyof UiKitComponents;

/** Every part a kit must implement. */
export const UI_KIT_PARTS: readonly UiKitPart[] = ["Button", "Panel", "Meter", "Prompt", "Toast", "Menu", "MinimapFrame"];

/**
 * The tokens every kit fills, so a game reshapes any kit with the same keys. Each becomes a
 * `--kit-<kebab-name>` CSS variable on the kit root (`fontDisplay` → `--kit-font-display`). Kit-specific
 * extras ride the index signature and land the same way.
 */
export interface UiKitTokens {
  /** Main text colour. */
  ink: string;
  /** What panels are made of. A kit draws it as paper, glass, light or metal, never only as a flat fill. */
  surface: string;
  /** Insets, troughs, the other side of a card. */
  surfaceAlt: string;
  accent: string;
  /** Text drawn on `accent`. */
  accentInk: string;
  good: string;
  warn: string;
  bad: string;
  /** Edges and rules. */
  line: string;
  /** Behind dialogs and menus. */
  scrim: string;
  fontDisplay: string;
  fontBody: string;
  fontMono: string;
  [extra: string]: string;
}

/** How a kit's surfaces enter and leave. */
export interface UiKitMotion {
  enterMs: number;
  exitMs: number;
  /** CSS easing for both. */
  ease: string;
}

/**
 * A complete UI language: shapes, framing, type, motion, sound and the seven parts. A game picks one
 * with `defineGame({ uiKit: "ink" })` and reshapes it with {@link customizeKit}.
 */
export interface UiKit {
  /** Lowercase, `[a-z0-9-]`. Class names in `css` are prefixed `jgk-<id>-`. */
  id: string;
  name: string;
  /** One line describing the visual language. */
  description: string;
  tokens: UiKitTokens;
  components: UiKitComponents;
  /** The kit's stylesheet. Injected once per kit; reads `--kit-*` tokens from the kit root. */
  css: string;
  motion: UiKitMotion;
  /** The kit's UI cue sounds. A game's own `audio.sounds["ui.<cue>"]` and `audio.uiCues` still win. */
  sounds: Partial<Record<UiCue, SoundDef>>;
}

/** What a game changes when it reshapes a kit. */
export interface UiKitCustomization {
  tokens?: Partial<UiKitTokens>;
  /** Replace individual parts; the rest stay the kit's own. */
  components?: Partial<UiKitComponents>;
  /** Extra CSS appended after the kit's own. */
  css?: string;
  motion?: Partial<UiKitMotion>;
  /** Replace or silence (`false`) individual cue sounds. */
  sounds?: Partial<Record<UiCue, SoundDef | false>>;
  name?: string;
}

/**
 * Reshape a kit for one game: new tokens, a few swapped parts, extra CSS, other sounds. Everything not
 * given stays the base kit's, so a customized kit is still complete.
 *
 * @example
 * ```ts
 * defineGame({ uiKit: customizeKit(UI_KITS.ink, { tokens: { accent: "#ff4f8b" } }) });
 * ```
 *
 * @capability ui-kit-customize reshape a UI kit per game — tokens, swapped parts, extra CSS, motion and sounds — without losing any part
 */
export function customizeKit(base: UiKit, changes: UiKitCustomization): UiKit {
  const sounds: Partial<Record<UiCue, SoundDef>> = { ...base.sounds };
  for (const [cue, def] of Object.entries(changes.sounds ?? {}) as [UiCue, SoundDef | false | undefined][]) {
    if (def === false) delete sounds[cue];
    else if (def !== undefined) sounds[cue] = { ...def, id: uiCueSoundId(cue) };
  }
  const tokens = { ...base.tokens } as UiKitTokens;
  for (const [key, value] of Object.entries(changes.tokens ?? {})) if (value !== undefined) tokens[key] = value;
  return {
    ...base,
    name: changes.name ?? base.name,
    tokens,
    components: { ...base.components, ...changes.components },
    css: changes.css === undefined ? base.css : `${base.css}\n${changes.css}`,
    motion: { ...base.motion, ...changes.motion },
    sounds,
  };
}

function kebab(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/** The `--kit-*` CSS variables for a kit's tokens and motion, for the kit root's `style`. */
export function uiKitVars(kit: UiKit): CSSProperties {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(kit.tokens)) vars[`--kit-${kebab(key)}`] = value;
  vars["--kit-enter-ms"] = `${kit.motion.enterMs}ms`;
  vars["--kit-exit-ms"] = `${kit.motion.exitMs}ms`;
  vars["--kit-ease"] = kit.motion.ease;
  vars["--kit-text"] = "var(--jg-text-scale, 1)";
  vars["--kit-motion"] = "var(--jg-motion-scale, 1)";
  return vars as CSSProperties;
}

/** A kit's UI cue patch on the `ui` bus, for {@link UiKit.sounds}. */
export function kitCueSound(cue: UiCue, def: Omit<SoundDef, "id" | "bus" | "positional">): SoundDef {
  return { id: uiCueSoundId(cue), bus: UI_CUE_BUS, positional: false, priority: 2, ...def };
}

/** Parts a kit is missing, for tests and dev checks. Empty when the kit is complete. */
export function missingKitParts(kit: Pick<UiKit, "components">): UiKitPart[] {
  return UI_KIT_PARTS.filter((part) => typeof kit.components[part] !== "function" && typeof kit.components[part] !== "object");
}

/** Fill 0..1 for a meter, clamped; `max <= 0` reads as empty. */
export function meterFraction(value: number, max = 1): number {
  if (!(max > 0) || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value / max));
}

/** Cell states for a segmented meter: how many of `segments` are lit for `value / max`. */
export function meterSegmentsLit(value: number, max = 1, segments = 10): number {
  return Math.round(meterFraction(value, max) * Math.max(1, Math.floor(segments)));
}

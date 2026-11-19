import type { ComponentType, CSSProperties, ReactNode } from "@jgengine/core/ui/jsx";
import type { ButtonHTMLAttributes, HTMLAttributes } from "@jgengine/core/ui/jsx/dom.view";

import type { SoundDef } from "@jgengine/core/audio/audioFalloff";
import { UI_CUE_BUS, uiCueSoundId, type UiCue } from "@jgengine/core/ui/uiCues";

export type KitTone = "neutral" | "accent" | "good" | "warn" | "bad";

export type KitDevice = "keyboard" | "gamepad" | "touch";

export interface KitButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  tone?: KitTone;
  icon?: ReactNode;
  glyph?: ReactNode;
  pressed?: boolean;
  type?: "button" | "submit" | "reset";
}

/** A surface that holds content. Kits must not draw it as a plain filled rounded rectangle. */
export interface KitPanelProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  eyebrow?: ReactNode;
  title?: ReactNode;
  aside?: ReactNode;
  footer?: ReactNode;
  tone?: KitTone | undefined;
  variant?: "hud" | "card" | "dialog" | "pane" | "strip";
  as?: "section" | "div" | "aside" | "nav" | "header";
  leaving?: boolean;
  children?: ReactNode;
}

export interface KitMeterProps {
  value: number;
  max?: number;
  label?: ReactNode;
  readout?: boolean | ReactNode;
  tone?: KitTone;
  variant?: "bar" | "segments" | "ring";
  segments?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
  style?: CSSProperties;
}

export interface KitPromptProps {
  glyph: ReactNode;
  label: ReactNode;
  device: KitDevice;
  /** 0..1 hold progress for hold-to-confirm. */
  progress?: number | undefined;
  tone?: KitTone | undefined;
  onActivate?: (() => void) | undefined;
  className?: string | undefined;
  style?: CSSProperties | undefined;
}

export interface KitToastProps {
  tone: KitTone;
  children: ReactNode;
  title?: ReactNode;
  icon?: ReactNode;
  count?: number;
  leaving?: boolean;
  className?: string;
  style?: CSSProperties;
}

export interface KitMenuItem {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  badge?: ReactNode;
  secondary?: boolean;
}

export interface KitMenuProps {
  items: readonly KitMenuItem[];
  activeId: string | null;
  itemProps: (id: string) => Record<string, unknown>;
  onSelect: (id: string) => void;
  variant?: "title" | "pause" | "list";
  className?: string;
  style?: CSSProperties;
}

export interface KitMinimapFrameProps {
  children?: ReactNode;
  /** Outer size in px; the frame is square. */
  size: number;
  shape?: "circle" | "square";
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

export type UiKitPart = keyof UiKitComponents;

/** Every part a kit must implement. */
export const UI_KIT_PARTS: readonly UiKitPart[] = ["Button", "Panel", "Meter", "Prompt", "Toast", "Menu", "MinimapFrame"];

/**
 * The tokens every kit fills, so a game reshapes any kit with the same keys. Each becomes a
 * `--kit-<kebab-name>` CSS variable on the kit root (`fontDisplay` → `--kit-font-display`). Kit-specific
 * extras ride the index signature and land the same way.
 */
export interface UiKitTokens {
  ink: string;
  /** What panels are made of. A kit draws it as paper, glass, light or metal, never only as a flat fill. */
  surface: string;
  surfaceAlt: string;
  accent: string;
  accentInk: string;
  good: string;
  warn: string;
  bad: string;
  line: string;
  scrim: string;
  fontDisplay: string;
  fontBody: string;
  fontMono: string;
  [extra: string]: string;
}

export interface UiKitMotion {
  enterMs: number;
  exitMs: number;
  ease: string;
}

export interface UiKit {
  id: string;
  name: string;
  description: string;
  tokens: UiKitTokens;
  components: UiKitComponents;
  css: string;
  motion: UiKitMotion;
  sounds: Partial<Record<UiCue, SoundDef>>;
}

export interface UiKitCustomization {
  tokens?: Partial<UiKitTokens>;
  components?: Partial<UiKitComponents>;
  /** Extra CSS appended after the kit's own. */
  css?: string;
  motion?: Partial<UiKitMotion>;
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

export function kitCueSound(cue: UiCue, def: Omit<SoundDef, "id" | "bus" | "positional">): SoundDef {
  return { id: uiCueSoundId(cue), bus: UI_CUE_BUS, positional: false, priority: 2, ...def };
}

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

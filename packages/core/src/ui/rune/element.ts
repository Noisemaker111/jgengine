import type { UiNode } from "../jsx/element";
import type { Ref } from "../jsx/types";
import type { Live } from "../liveValue";

/** Rune colours use hex RGB/RGBA values, never a CSS declaration. */
export type RuneColor = string;
/** Native layout sizes are points or a fraction of the parent. */
export type RuneSize = number | { fraction: number };
/** Direct Rune element methods. Numbers are points; angles are radians. */
export interface RuneStyle {
  fill?: RuneColor;
  gradient?: { angle: number; stops: readonly (readonly [number, RuneColor])[] };
  radius?: number;
  border?: { width: number; color: RuneColor };
  shadow?: { y: number; blur: number; color: RuneColor; x?: number; spread?: number; inset?: boolean };
  radial?: { center: readonly [number, number]; radius: readonly [number, number]; stops: readonly (readonly [number, RuneColor])[] };
  blur?: number;
  opacity?: Live<number>;
  width?: RuneSize | Live<number>;
  height?: RuneSize | Live<number>;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  padding?: number | readonly [number, number, number, number];
  gap?: number;
  pin?: readonly [number | null, number | null, number | null, number | null];
  grow?: number;
  shrink?: boolean;
  justify?: "start" | "center" | "end" | "between" | "evenly";
  items?: "start" | "center" | "end" | "stretch";
  clip?: boolean;
  hover?: RuneColor;
  press?: RuneColor;
  motion?: { duration: number; bounce: number };
  shape?: { points: readonly (readonly [number, number])[]; viewBox: readonly [number, number] };
}

/** Text styling maps to Rune's TextStyle; it never inherits a browser font. */
export interface RuneFont {
  size?: number;
  weight?: number;
  family?: string;
  mono?: boolean;
  color?: RuneColor;
  tracking?: number;
  align?: "left" | "center" | "right";
}

/** Props shared by native elements and their optional DOM tooling host. */
export interface RuneElementProps extends RuneStyle, RuneFont {
  children?: UiNode;
  ref?: Ref<RuneElement>;
  id?: string;
  label?: string;
  role?: string;
  disabled?: boolean;
  hidden?: boolean;
  modal?: boolean;
  text?: Live<string>;
  direction?: "row" | "column";
  scroll?: boolean;
  svg?: string;
  image?: string;
  fit?: "cover" | "contain";
  value?: Live<number>;
  max?: number;
  count?: number;
  tone?: { colors: readonly [RuneColor, RuneColor, RuneColor]; warn: number; bad: number };
  onPress?: () => void;
  onFocus?: () => void;
  onValue?: (value: number) => void;
  onCommit?: (value: number) => void;
  onAdjust?: (delta: -1 | 1) => void;
  onKey?: (code: string) => void;
  onEdit?: (text: string) => void;
  onBack?: () => void;
}

/** Host handle for native focus and scrolling; no DOM element is allocated. */
export interface RuneElement {
  focus(): void;
  scrollIntoView(): void;
}

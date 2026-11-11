import type { UiNode } from "../jsx/element";
import type { Ref } from "../jsx/types";
import type { Live } from "../liveValue";

/** Rune colours use hex RGB/RGBA values, never a CSS declaration. */
export type RuneColor = string;
/** Native layout sizes are points or a fraction of the parent. */
export type RuneSize = number | { fraction: number };
/** Direct Rune element methods. Numbers are points; angles are radians. */
export interface RuneStyle {
  x?: number;
  y?: number;
  scale?: number;
  columns?: number;
  fill?: RuneColor;
  gradient?: { angle: number; stops: readonly (readonly [number, RuneColor])[] };
  radius?: number;
  border?: { width: number; color: RuneColor };
  shadow?: { y: number; blur: number; color: RuneColor; x?: number; spread?: number; inset?: boolean };
  radial?: { center: readonly [number, number]; radius: readonly [number, number]; stops: readonly (readonly [number, RuneColor])[] };
  blur?: number;
  opacity?: number;
  width?: RuneSize;
  height?: RuneSize;
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
export type RuneBoundStyle = { [K in keyof RuneStyle]: Live<RuneStyle[K]> };
export type RuneBoundFont = { [K in keyof RuneFont]: Live<RuneFont[K]> };

export interface RuneElementProps extends RuneBoundStyle, RuneBoundFont {
  children?: UiNode;
  ref?: Ref<RuneElement>;
  id?: string;
  label?: string;
  role?: string;
  disabled?: Live<boolean>;
  hidden?: Live<boolean>;
  modal?: boolean;
  text?: Live<string>;
  direction?: "row" | "column";
  scroll?: boolean;
  svg?: string;
  image?: string;
  fit?: "cover" | "contain";
  onPress?: () => void;
  onFocus?: () => void;
  onValue?: (value: number) => void;
  onCommit?: (value: number) => void;
  onAdjust?: (delta: -1 | 1) => void;
  onKey?: (code: string) => void;
  onEdit?: (text: string) => void;
  /** Native field: Enter (single line) submitted this text. */
  onSubmit?: (text: string) => void;
  /** Native field: the page replaced its text from outside Rune (the phone keyboard proxy). */
  onReplace?: (text: string) => void;
  /** Native field text, taken by Rune whenever `rev` changes. */
  value?: string;
  rev?: number;
  placeholder?: string;
  multiline?: boolean;
  secret?: boolean;
  onBack?: () => void;
  tooltip?: string;
  drag?: boolean;
  onDrag?: (gesture: RuneGesture) => void;
  onHover?: (inside: boolean) => void;
  holdMs?: number;
  dragValue?: string;
  onDrop?: (value: string) => void;
  spans?: Live<readonly RuneSpan[]>;
}

/** Rich text ranges use UTF-8 byte offsets, like Rune's native Span API. */
export interface RuneSpan { start: number; end: number; color?: RuneColor; weight?: number; size?: number; mono?: boolean; italic?: boolean; underline?: RuneColor; }

/** Native pointer/touch gesture in element-local layout points. */
export interface RuneGesture {
  phase: "down" | "move" | "up";
  x: number;
  y: number;
  width: number;
  height: number;
  cancelled: boolean;
}

/** Host handle for native focus and scrolling; no DOM element is allocated. */
export interface RuneElement {
  focus(): void;
  scrollIntoView(): void;
}

/**
 * The DOM-facing types of engine UI: what a handler receives, what each host tag
 * accepts, and the `JSX` namespace the compiler reads.
 */

import type { ComponentClass, FunctionComponent, UiElement, UiNode } from "./element";
import type { CSSProperties, Key, Ref } from "./types";

type Synthetic<T, E, Target = EventTarget> = Omit<E, "currentTarget" | "target" | "relatedTarget"> & {
  readonly currentTarget: EventTarget & T;
  readonly target: Target;
  readonly nativeEvent: E;
  persist(): void;
  isDefaultPrevented(): boolean;
  isPropagationStopped(): boolean;
};

/** An event as a handler sees it: the DOM event, with `currentTarget` typed as the element the handler is on. */
export type SyntheticEvent<T = Element, E = Event> = Synthetic<T, E>;
export type UIEvent<T = Element, E = globalThis.UIEvent> = Synthetic<T, E>;
export type MouseEvent<T = Element, E = globalThis.MouseEvent> = Synthetic<T, E> & { readonly relatedTarget: EventTarget | null };
export type PointerEvent<T = Element> = MouseEvent<T, globalThis.PointerEvent>;
export type DragEvent<T = Element> = MouseEvent<T, globalThis.DragEvent>;
export type WheelEvent<T = Element> = MouseEvent<T, globalThis.WheelEvent>;
export type KeyboardEvent<T = Element> = Synthetic<T, globalThis.KeyboardEvent>;
export type TouchEvent<T = Element> = Synthetic<T, globalThis.TouchEvent>;
export type ClipboardEvent<T = Element> = Synthetic<T, globalThis.ClipboardEvent>;
export type CompositionEvent<T = Element> = Synthetic<T, globalThis.CompositionEvent>;
export type AnimationEvent<T = Element> = Synthetic<T, globalThis.AnimationEvent>;
export type TransitionEvent<T = Element> = Synthetic<T, globalThis.TransitionEvent>;
export type InputEvent<T = Element> = Synthetic<T, globalThis.InputEvent>;
export type FormEvent<T = Element> = Synthetic<T, Event>;
export type InvalidEvent<T = Element> = Synthetic<T, Event, EventTarget & T>;
/** `target` is the field itself, so `event.target.value` reads without a cast. */
export type ChangeEvent<T = Element> = Synthetic<T, Event, EventTarget & T>;
export type FocusEvent<Target = Element, RelatedTarget = Element> = Synthetic<Target, globalThis.FocusEvent, EventTarget & Target> & {
  readonly relatedTarget: (EventTarget & RelatedTarget) | null;
};

/** A handler property takes a function of a wider or a narrower event, as handlers always have. */
export type EventHandler<E> = { bivarianceHack(event: E): void }["bivarianceHack"];
export type ReactEventHandler<T = Element> = EventHandler<SyntheticEvent<T>>;
export type MouseEventHandler<T = Element> = EventHandler<MouseEvent<T>>;
export type PointerEventHandler<T = Element> = EventHandler<PointerEvent<T>>;
export type KeyboardEventHandler<T = Element> = EventHandler<KeyboardEvent<T>>;
export type FocusEventHandler<T = Element> = EventHandler<FocusEvent<T>>;
export type ChangeEventHandler<T = Element> = EventHandler<ChangeEvent<T>>;
export type FormEventHandler<T = Element> = EventHandler<FormEvent<T>>;
export type WheelEventHandler<T = Element> = EventHandler<WheelEvent<T>>;
export type DragEventHandler<T = Element> = EventHandler<DragEvent<T>>;
export type TouchEventHandler<T = Element> = EventHandler<TouchEvent<T>>;
export type ClipboardEventHandler<T = Element> = EventHandler<ClipboardEvent<T>>;
export type CompositionEventHandler<T = Element> = EventHandler<CompositionEvent<T>>;
export type AnimationEventHandler<T = Element> = EventHandler<AnimationEvent<T>>;
export type TransitionEventHandler<T = Element> = EventHandler<TransitionEvent<T>>;
export type UIEventHandler<T = Element> = EventHandler<UIEvent<T>>;

type WithCapture<Names extends string, H> = { [K in Names as `on${K}` | `on${K}Capture`]?: H | undefined };

export interface DOMAttributes<T>
  extends WithCapture<"Click" | "DoubleClick" | "AuxClick" | "ContextMenu" | "MouseDown" | "MouseUp" | "MouseMove" | "MouseOver" | "MouseOut", MouseEventHandler<T>>,
    WithCapture<"PointerDown" | "PointerUp" | "PointerMove" | "PointerOver" | "PointerOut" | "PointerCancel" | "GotPointerCapture" | "LostPointerCapture", PointerEventHandler<T>>,
    WithCapture<"KeyDown" | "KeyUp" | "KeyPress", KeyboardEventHandler<T>>,
    WithCapture<"Focus" | "Blur", FocusEventHandler<T>>,
    WithCapture<"Drag" | "DragStart" | "DragEnd" | "DragEnter" | "DragLeave" | "DragOver" | "DragExit" | "Drop", DragEventHandler<T>>,
    WithCapture<"TouchStart" | "TouchMove" | "TouchEnd" | "TouchCancel", TouchEventHandler<T>>,
    WithCapture<"AnimationStart" | "AnimationEnd" | "AnimationIteration", AnimationEventHandler<T>>,
    WithCapture<"TransitionEnd" | "TransitionStart" | "TransitionCancel" | "TransitionRun", TransitionEventHandler<T>>,
    WithCapture<"Copy" | "Cut" | "Paste", ClipboardEventHandler<T>>,
    WithCapture<"CompositionStart" | "CompositionEnd" | "CompositionUpdate", CompositionEventHandler<T>>,
    WithCapture<"Change", ChangeEventHandler<T>>,
    WithCapture<"Input" | "Submit" | "Reset" | "Invalid" | "BeforeInput", FormEventHandler<T>>,
    WithCapture<"Wheel", WheelEventHandler<T>>,
    WithCapture<"Scroll" | "ScrollEnd", UIEventHandler<T>>,
    WithCapture<
      | "Load" | "Error" | "Toggle" | "BeforeToggle" | "Play" | "Pause" | "Playing" | "Ended" | "CanPlay" | "CanPlayThrough" | "LoadedData"
      | "LoadedMetadata" | "LoadStart" | "TimeUpdate" | "VolumeChange" | "DurationChange" | "RateChange" | "Seeked" | "Seeking" | "Stalled"
      | "Suspend" | "Waiting" | "Progress" | "Abort" | "Emptied" | "Select" | "Cancel" | "Close",
      ReactEventHandler<T>
    > {
  children?: UiNode;
  dangerouslySetInnerHTML?: { __html: string } | undefined;
  onMouseEnter?: MouseEventHandler<T> | undefined;
  onMouseLeave?: MouseEventHandler<T> | undefined;
  onPointerEnter?: PointerEventHandler<T> | undefined;
  onPointerLeave?: PointerEventHandler<T> | undefined;
}

type Booleanish = boolean | "true" | "false";

export interface AriaAttributes {
  [aria: `aria-${string}`]: string | number | boolean | undefined;
}

/** The attributes every HTML tag takes. */
export interface HTMLAttributes<T> extends AriaAttributes, DOMAttributes<T> {
  [data: `data-${string}`]: unknown;
  defaultChecked?: boolean | undefined;
  defaultValue?: string | number | readonly string[] | undefined;
  suppressContentEditableWarning?: boolean | undefined;
  suppressHydrationWarning?: boolean | undefined;
  accessKey?: string | undefined;
  autoCapitalize?: string | undefined;
  autoCorrect?: string | undefined;
  autoFocus?: boolean | undefined;
  className?: string | undefined;
  contentEditable?: Booleanish | "inherit" | "plaintext-only" | undefined;
  dir?: string | undefined;
  draggable?: Booleanish | undefined;
  enterKeyHint?: "enter" | "done" | "go" | "next" | "previous" | "search" | "send" | undefined;
  hidden?: boolean | undefined;
  id?: string | undefined;
  inert?: boolean | undefined;
  inputMode?: "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search" | undefined;
  is?: string | undefined;
  lang?: string | undefined;
  nonce?: string | undefined;
  part?: string | undefined;
  popover?: "" | "auto" | "manual" | "hint" | undefined;
  popoverTarget?: string | undefined;
  popoverTargetAction?: "toggle" | "show" | "hide" | undefined;
  role?: string | undefined;
  slot?: string | undefined;
  spellCheck?: Booleanish | undefined;
  style?: CSSProperties | undefined;
  tabIndex?: number | undefined;
  title?: string | undefined;
  translate?: "yes" | "no" | undefined;
  color?: string | undefined;
  content?: string | undefined;
  itemProp?: string | undefined;
  property?: string | undefined;
  rel?: string | undefined;
  unselectable?: "on" | "off" | undefined;
}

type FormControl = {
  disabled?: boolean | undefined;
  form?: string | undefined;
  name?: string | undefined;
};

export interface AnchorHTMLAttributes<T> extends HTMLAttributes<T> {
  download?: unknown;
  href?: string | undefined;
  hrefLang?: string | undefined;
  media?: string | undefined;
  ping?: string | undefined;
  target?: string | undefined;
  type?: string | undefined;
  referrerPolicy?: string | undefined;
}

export interface ButtonHTMLAttributes<T> extends HTMLAttributes<T>, FormControl {
  formAction?: string | undefined;
  formEncType?: string | undefined;
  formMethod?: string | undefined;
  formNoValidate?: boolean | undefined;
  formTarget?: string | undefined;
  type?: "submit" | "reset" | "button" | undefined;
  value?: string | readonly string[] | number | undefined;
}

export interface InputHTMLAttributes<T> extends HTMLAttributes<T>, FormControl {
  accept?: string | undefined;
  alt?: string | undefined;
  autoComplete?: string | undefined;
  capture?: boolean | "user" | "environment" | undefined;
  checked?: boolean | undefined;
  height?: number | string | undefined;
  list?: string | undefined;
  max?: number | string | undefined;
  maxLength?: number | undefined;
  min?: number | string | undefined;
  minLength?: number | undefined;
  multiple?: boolean | undefined;
  pattern?: string | undefined;
  placeholder?: string | undefined;
  readOnly?: boolean | undefined;
  required?: boolean | undefined;
  size?: number | undefined;
  src?: string | undefined;
  step?: number | string | undefined;
  type?: string | undefined;
  value?: string | readonly string[] | number | undefined;
  width?: number | string | undefined;
}

export interface SelectHTMLAttributes<T> extends HTMLAttributes<T>, FormControl {
  autoComplete?: string | undefined;
  multiple?: boolean | undefined;
  required?: boolean | undefined;
  size?: number | undefined;
  value?: string | readonly string[] | number | undefined;
}

export interface TextareaHTMLAttributes<T> extends HTMLAttributes<T>, FormControl {
  autoComplete?: string | undefined;
  cols?: number | undefined;
  dirName?: string | undefined;
  maxLength?: number | undefined;
  minLength?: number | undefined;
  placeholder?: string | undefined;
  readOnly?: boolean | undefined;
  required?: boolean | undefined;
  rows?: number | undefined;
  value?: string | readonly string[] | number | undefined;
  wrap?: string | undefined;
}

export interface OptionHTMLAttributes<T> extends HTMLAttributes<T> {
  disabled?: boolean | undefined;
  label?: string | undefined;
  selected?: boolean | undefined;
  value?: string | readonly string[] | number | undefined;
}

export interface ImgHTMLAttributes<T> extends HTMLAttributes<T> {
  alt?: string | undefined;
  crossOrigin?: "anonymous" | "use-credentials" | "" | undefined;
  decoding?: "async" | "auto" | "sync" | undefined;
  fetchPriority?: "high" | "low" | "auto" | undefined;
  height?: number | string | undefined;
  loading?: "eager" | "lazy" | undefined;
  referrerPolicy?: string | undefined;
  sizes?: string | undefined;
  src?: string | undefined;
  srcSet?: string | undefined;
  useMap?: string | undefined;
  width?: number | string | undefined;
}

export interface LabelHTMLAttributes<T> extends HTMLAttributes<T> {
  form?: string | undefined;
  htmlFor?: string | undefined;
}

export interface FormHTMLAttributes<T> extends HTMLAttributes<T> {
  acceptCharset?: string | undefined;
  action?: string | undefined;
  autoComplete?: string | undefined;
  encType?: string | undefined;
  method?: string | undefined;
  name?: string | undefined;
  noValidate?: boolean | undefined;
  target?: string | undefined;
}

export interface CanvasHTMLAttributes<T> extends HTMLAttributes<T> {
  height?: number | string | undefined;
  width?: number | string | undefined;
}

export interface MediaHTMLAttributes<T> extends HTMLAttributes<T> {
  autoPlay?: boolean | undefined;
  controls?: boolean | undefined;
  crossOrigin?: "anonymous" | "use-credentials" | "" | undefined;
  loop?: boolean | undefined;
  muted?: boolean | undefined;
  playsInline?: boolean | undefined;
  preload?: string | undefined;
  src?: string | undefined;
}

export interface VideoHTMLAttributes<T> extends MediaHTMLAttributes<T> {
  height?: number | string | undefined;
  poster?: string | undefined;
  width?: number | string | undefined;
  disablePictureInPicture?: boolean | undefined;
}

export type AudioHTMLAttributes<T> = MediaHTMLAttributes<T>;

export interface IframeHTMLAttributes<T> extends HTMLAttributes<T> {
  allow?: string | undefined;
  allowFullScreen?: boolean | undefined;
  height?: number | string | undefined;
  loading?: "eager" | "lazy" | undefined;
  name?: string | undefined;
  referrerPolicy?: string | undefined;
  sandbox?: string | undefined;
  src?: string | undefined;
  srcDoc?: string | undefined;
  width?: number | string | undefined;
}

export interface DetailsHTMLAttributes<T> extends HTMLAttributes<T> {
  open?: boolean | undefined;
  name?: string | undefined;
}

export interface DialogHTMLAttributes<T> extends HTMLAttributes<T> {
  open?: boolean | undefined;
}

export interface TdHTMLAttributes<T> extends HTMLAttributes<T> {
  align?: string | undefined;
  colSpan?: number | undefined;
  headers?: string | undefined;
  rowSpan?: number | undefined;
  scope?: string | undefined;
  height?: number | string | undefined;
  width?: number | string | undefined;
  valign?: string | undefined;
}

export type ThHTMLAttributes<T> = TdHTMLAttributes<T>;

/** Every attribute of every tag, for the tags with no narrower set here. */
export interface AllHTMLAttributes<T>
  extends Omit<AnchorHTMLAttributes<T>, "type" | "media">,
    Omit<InputHTMLAttributes<T>, "type" | "size" | "value" | "height" | "width">,
    Omit<ImgHTMLAttributes<T>, "height" | "width" | "crossOrigin">,
    Omit<IframeHTMLAttributes<T>, "height" | "width" | "name" | "loading" | "referrerPolicy" | "src">,
    Omit<VideoHTMLAttributes<T>, "height" | "width" | "crossOrigin" | "src">,
    Omit<FormHTMLAttributes<T>, "autoComplete" | "name" | "target">,
    Omit<TdHTMLAttributes<T>, "height" | "width"> {
  as?: string | undefined;
  async?: boolean | undefined;
  charSet?: string | undefined;
  cite?: string | undefined;
  cols?: number | undefined;
  crossOrigin?: "anonymous" | "use-credentials" | "" | undefined;
  data?: string | undefined;
  dateTime?: string | undefined;
  default?: boolean | undefined;
  defer?: boolean | undefined;
  height?: number | string | undefined;
  high?: number | undefined;
  htmlFor?: string | undefined;
  httpEquiv?: string | undefined;
  integrity?: string | undefined;
  kind?: string | undefined;
  label?: string | undefined;
  low?: number | undefined;
  media?: string | undefined;
  noModule?: boolean | undefined;
  open?: boolean | undefined;
  optimum?: number | undefined;
  reversed?: boolean | undefined;
  rows?: number | undefined;
  selected?: boolean | undefined;
  shape?: string | undefined;
  size?: number | undefined;
  span?: number | undefined;
  srcLang?: string | undefined;
  start?: number | undefined;
  type?: string | undefined;
  value?: string | readonly string[] | number | undefined;
  width?: number | string | undefined;
  wrap?: string | undefined;
}

/** SVG presentation and geometry attributes; any other one is accepted as a string or number. */
export interface SVGAttributes<T> extends AriaAttributes, DOMAttributes<T> {
  [attribute: string]: unknown;
  className?: string | undefined;
  id?: string | undefined;
  style?: CSSProperties | undefined;
}

export interface Attributes {
  key?: Key | null | undefined;
}
export interface RefAttributes<T> extends Attributes {
  ref?: Ref<T> | undefined;
}
export type ClassAttributes<T> = RefAttributes<T>;
export type DetailedHTMLProps<A, T> = ClassAttributes<T> & A;
export type SVGProps<T> = SVGAttributes<T> & ClassAttributes<T>;
export type HTMLProps<T> = AllHTMLAttributes<T> & ClassAttributes<T>;

type Tag<A, T> = DetailedHTMLProps<A, T>;

interface NarrowTags {
  a: Tag<AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>;
  audio: Tag<AudioHTMLAttributes<HTMLAudioElement>, HTMLAudioElement>;
  button: Tag<ButtonHTMLAttributes<HTMLButtonElement>, HTMLButtonElement>;
  canvas: Tag<CanvasHTMLAttributes<HTMLCanvasElement>, HTMLCanvasElement>;
  details: Tag<DetailsHTMLAttributes<HTMLDetailsElement>, HTMLDetailsElement>;
  dialog: Tag<DialogHTMLAttributes<HTMLDialogElement>, HTMLDialogElement>;
  form: Tag<FormHTMLAttributes<HTMLFormElement>, HTMLFormElement>;
  iframe: Tag<IframeHTMLAttributes<HTMLIFrameElement>, HTMLIFrameElement>;
  img: Tag<ImgHTMLAttributes<HTMLImageElement>, HTMLImageElement>;
  input: Tag<InputHTMLAttributes<HTMLInputElement>, HTMLInputElement>;
  label: Tag<LabelHTMLAttributes<HTMLLabelElement>, HTMLLabelElement>;
  option: Tag<OptionHTMLAttributes<HTMLOptionElement>, HTMLOptionElement>;
  select: Tag<SelectHTMLAttributes<HTMLSelectElement>, HTMLSelectElement>;
  td: Tag<TdHTMLAttributes<HTMLTableCellElement>, HTMLTableCellElement>;
  textarea: Tag<TextareaHTMLAttributes<HTMLTextAreaElement>, HTMLTextAreaElement>;
  th: Tag<ThHTMLAttributes<HTMLTableCellElement>, HTMLTableCellElement>;
  video: Tag<VideoHTMLAttributes<HTMLVideoElement>, HTMLVideoElement>;
}

/** Tags whose attributes go beyond the common set but have no interface of their own above. */
type WideTagNames =
  | "area" | "base" | "blockquote" | "col" | "colgroup" | "data" | "del" | "embed" | "fieldset" | "html" | "ins" | "li" | "link" | "map" | "meta"
  | "meter" | "object" | "ol" | "optgroup" | "output" | "progress" | "q" | "script" | "slot" | "source" | "style" | "table" | "time" | "track";

type WideTags = { [K in WideTagNames]: Tag<AllHTMLAttributes<HTMLElementTagNameMap[K]>, HTMLElementTagNameMap[K]> };
type PlainTags = {
  [K in Exclude<keyof HTMLElementTagNameMap, keyof NarrowTags | WideTagNames>]: Tag<HTMLAttributes<HTMLElementTagNameMap[K]>, HTMLElementTagNameMap[K]>;
};
type SvgTags = { [K in Exclude<keyof SVGElementTagNameMap, keyof HTMLElementTagNameMap>]: SVGProps<SVGElementTagNameMap[K]> };

/** What the compiler checks JSX against. */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace JSX {
  export type Element = UiElement;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type ElementType = string | FunctionComponent<any> | ComponentClass<any>;
  export interface ElementClass {
    render(): UiNode;
  }
  export interface ElementAttributesProperty {
    props: object;
  }
  export interface ElementChildrenAttribute {
    children: object;
  }
  export type IntrinsicAttributes = Attributes;
  export type IntrinsicClassAttributes<T> = RefAttributes<T>;
  export interface IntrinsicElements extends NarrowTags, WideTags, PlainTags, SvgTags {
    svg: SVGProps<SVGSVGElement>;
  }
}

/** Props a host tag or a component takes: `ComponentProps<"div">`, `ComponentProps<typeof Panel>`. */
export type ComponentProps<T> = T extends keyof JSX.IntrinsicElements
  ? JSX.IntrinsicElements[T]
  : T extends (props: infer P) => unknown
    ? P
    : T extends new (props: infer P) => unknown
      ? P
      : never;
export type ComponentPropsWithoutRef<T> = Omit<ComponentProps<T>, "ref">;
export type ComponentPropsWithRef<T> = ComponentProps<T>;

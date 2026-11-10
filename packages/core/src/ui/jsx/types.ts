/**
 * Type names UI code uses for nodes, components, refs and styles. None of them
 * needs the DOM, so models and non-view code may import them.
 */

import type { ComponentClass, ContextType, FunctionComponent, UiElement, UiNode } from "./element";

export type ReactNode = UiNode;
export type ReactElement<P = Record<string, unknown>> = UiElement<P>;
export type FC<P = object> = (props: P) => UiNode;
export type FunctionalComponent<P = object> = FC<P>;
export type ComponentType<P = object> = FC<P> | (new (props: P) => { render(): UiNode });
export type ElementType = string | ComponentType<never>;
export type NamedExoticComponent<P = object> = FC<P> & { displayName?: string };
export type LazyExoticComponent<T> = T;
export type MemoExoticComponent<T> = T;
export type ComponentProps<T> = T extends (props: infer P) => unknown ? P : T extends new (props: infer P) => unknown ? P : never;
export type PropsWithChildren<P = object> = P & { children?: UiNode };
export type Context<T> = ContextType<T>;
export type { ComponentClass, FunctionComponent };

export interface RefObject<T> {
  current: T;
}
export type MutableRefObject<T> = RefObject<T>;
export type RefCallback<T> = (instance: T | null) => void | (() => void);
export type Ref<T> = RefCallback<T> | RefObject<T | null> | null;
export type ForwardedRef<T> = Ref<T>;

export type SetStateAction<S> = S | ((prev: S) => S);
export type Dispatch<A> = (action: A) => void;
export type DependencyList = readonly unknown[];
export type Reducer<S, A> = (state: S, action: A) => S;
export type EffectCallback = () => void | (() => void);
export interface ErrorInfo {
  componentStack?: string | null;
}
export type Key = string | number | bigint;

type CssValue = string | number | undefined;

/** An inline style object: CSS properties in camelCase, plus `--custom` properties. */
export interface CSSProperties {
  [property: `--${string}`]: CssValue;
  accentColor?: CssValue; alignContent?: CssValue; alignItems?: CssValue; alignSelf?: CssValue; all?: CssValue; animation?: CssValue;
  animationDelay?: CssValue; animationDirection?: CssValue; animationDuration?: CssValue; animationFillMode?: CssValue;
  animationIterationCount?: CssValue; animationName?: CssValue; animationPlayState?: CssValue; animationTimingFunction?: CssValue;
  appearance?: CssValue; aspectRatio?: CssValue; backdropFilter?: CssValue; backfaceVisibility?: CssValue; background?: CssValue;
  backgroundAttachment?: CssValue; backgroundBlendMode?: CssValue; backgroundClip?: CssValue; backgroundColor?: CssValue;
  backgroundImage?: CssValue; backgroundOrigin?: CssValue; backgroundPosition?: CssValue; backgroundRepeat?: CssValue;
  backgroundSize?: CssValue; blockSize?: CssValue; border?: CssValue; borderBlock?: CssValue; borderBottom?: CssValue;
  borderBottomColor?: CssValue; borderBottomLeftRadius?: CssValue; borderBottomRightRadius?: CssValue; borderBottomStyle?: CssValue;
  borderBottomWidth?: CssValue; borderCollapse?: CssValue; borderColor?: CssValue; borderImage?: CssValue; borderInline?: CssValue;
  borderLeft?: CssValue; borderLeftColor?: CssValue; borderLeftStyle?: CssValue; borderLeftWidth?: CssValue; borderRadius?: CssValue;
  borderRight?: CssValue; borderRightColor?: CssValue; borderRightStyle?: CssValue; borderRightWidth?: CssValue; borderSpacing?: CssValue;
  borderStyle?: CssValue; borderTop?: CssValue; borderTopColor?: CssValue; borderTopLeftRadius?: CssValue; borderTopRightRadius?: CssValue;
  borderTopStyle?: CssValue; borderTopWidth?: CssValue; borderWidth?: CssValue; bottom?: CssValue; boxShadow?: CssValue; boxSizing?: CssValue;
  caretColor?: CssValue; clip?: CssValue; clipPath?: CssValue; color?: CssValue; colorScheme?: CssValue; columnGap?: CssValue;
  columns?: CssValue; contain?: CssValue; containerType?: CssValue; content?: CssValue; cursor?: CssValue; direction?: CssValue;
  display?: CssValue; fill?: CssValue; fillOpacity?: CssValue; filter?: CssValue; flex?: CssValue; flexBasis?: CssValue;
  flexDirection?: CssValue; flexFlow?: CssValue; flexGrow?: CssValue; flexShrink?: CssValue; flexWrap?: CssValue; float?: CssValue;
  font?: CssValue; fontFamily?: CssValue; fontFeatureSettings?: CssValue; fontKerning?: CssValue; fontSize?: CssValue;
  fontStretch?: CssValue; fontStyle?: CssValue; fontVariant?: CssValue; fontVariantNumeric?: CssValue; fontVariationSettings?: CssValue;
  fontWeight?: CssValue; gap?: CssValue; grid?: CssValue; gridArea?: CssValue; gridAutoColumns?: CssValue; gridAutoFlow?: CssValue;
  gridAutoRows?: CssValue; gridColumn?: CssValue; gridColumnEnd?: CssValue; gridColumnStart?: CssValue; gridRow?: CssValue;
  gridRowEnd?: CssValue; gridRowStart?: CssValue; gridTemplate?: CssValue; gridTemplateAreas?: CssValue; gridTemplateColumns?: CssValue;
  gridTemplateRows?: CssValue; height?: CssValue; hyphens?: CssValue; imageRendering?: CssValue; inlineSize?: CssValue; inset?: CssValue;
  insetBlock?: CssValue; insetInline?: CssValue; isolation?: CssValue; justifyContent?: CssValue; justifyItems?: CssValue;
  justifySelf?: CssValue; left?: CssValue; letterSpacing?: CssValue; lineHeight?: CssValue; listStyle?: CssValue; margin?: CssValue;
  marginBlock?: CssValue; marginBottom?: CssValue; marginInline?: CssValue; marginLeft?: CssValue; marginRight?: CssValue;
  marginTop?: CssValue; mask?: CssValue; maskImage?: CssValue; maskPosition?: CssValue; maskRepeat?: CssValue; maskSize?: CssValue;
  maxHeight?: CssValue; maxWidth?: CssValue; minHeight?: CssValue; minWidth?: CssValue; mixBlendMode?: CssValue; objectFit?: CssValue;
  objectPosition?: CssValue; offset?: CssValue; opacity?: CssValue; order?: CssValue; outline?: CssValue; outlineColor?: CssValue;
  outlineOffset?: CssValue; outlineStyle?: CssValue; outlineWidth?: CssValue; overflow?: CssValue; overflowWrap?: CssValue;
  overflowX?: CssValue; overflowY?: CssValue; overscrollBehavior?: CssValue; padding?: CssValue; paddingBlock?: CssValue;
  paddingBottom?: CssValue; paddingInline?: CssValue; paddingLeft?: CssValue; paddingRight?: CssValue; paddingTop?: CssValue;
  paintOrder?: CssValue; perspective?: CssValue; perspectiveOrigin?: CssValue; placeContent?: CssValue; placeItems?: CssValue;
  placeSelf?: CssValue; pointerEvents?: CssValue; position?: CssValue; resize?: CssValue; right?: CssValue; rotate?: CssValue;
  rowGap?: CssValue; scale?: CssValue; scrollBehavior?: CssValue; scrollbarColor?: CssValue; scrollbarGutter?: CssValue;
  scrollbarWidth?: CssValue; scrollSnapAlign?: CssValue; scrollSnapType?: CssValue; stroke?: CssValue; strokeDasharray?: CssValue;
  strokeDashoffset?: CssValue; strokeLinecap?: CssValue; strokeLinejoin?: CssValue; strokeOpacity?: CssValue; strokeWidth?: CssValue;
  tabSize?: CssValue; tableLayout?: CssValue; textAlign?: CssValue; textDecoration?: CssValue; textDecorationColor?: CssValue;
  textIndent?: CssValue; textOverflow?: CssValue; textRendering?: CssValue; textShadow?: CssValue; textTransform?: CssValue;
  textWrap?: CssValue; top?: CssValue; touchAction?: CssValue; transform?: CssValue; transformBox?: CssValue; transformOrigin?: CssValue;
  transformStyle?: CssValue; transition?: CssValue; transitionDelay?: CssValue; transitionDuration?: CssValue;
  transitionProperty?: CssValue; transitionTimingFunction?: CssValue; translate?: CssValue; userSelect?: CssValue; verticalAlign?: CssValue;
  visibility?: CssValue; whiteSpace?: CssValue; width?: CssValue; willChange?: CssValue; wordBreak?: CssValue; wordSpacing?: CssValue;
  wordWrap?: CssValue; writingMode?: CssValue; zIndex?: CssValue; zoom?: CssValue;
  WebkitAppearance?: CssValue; WebkitBackdropFilter?: CssValue; WebkitBackgroundClip?: CssValue; WebkitBoxOrient?: CssValue;
  WebkitFontSmoothing?: CssValue; WebkitLineClamp?: CssValue; WebkitMaskImage?: CssValue; WebkitOverflowScrolling?: CssValue;
  WebkitTapHighlightColor?: CssValue; WebkitTextFillColor?: CssValue; WebkitTextStroke?: CssValue; WebkitTextStrokeColor?: CssValue;
  WebkitTextStrokeWidth?: CssValue; WebkitUserSelect?: CssValue; MozOsxFontSmoothing?: CssValue;
}

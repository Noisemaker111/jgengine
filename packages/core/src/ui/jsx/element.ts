/**
 * The engine's UI element: what JSX compiles to. An element is a plain record of
 * a type (a host tag, a component function or one of the built-in marker types),
 * its props and its key. Nothing here knows about a renderer.
 */

export const ELEMENT = Symbol.for("jg.ui.element");
export const Fragment = Symbol.for("jg.ui.fragment");
export const PROVIDER = Symbol.for("jg.ui.provider");
export const SUSPENSE = Symbol.for("jg.ui.suspense");
export const PORTAL = Symbol.for("jg.ui.portal");
export const MEMO = Symbol.for("jg.ui.memo");
export const LAZY = Symbol.for("jg.ui.lazy");

export type Key = string | number;
export type Props = Record<string, unknown>;

export interface UiElement<P = Props> {
  readonly $$typeof: typeof ELEMENT;
  readonly type: ElementType;
  readonly props: P;
  readonly key: string | null;
}

/** Anything a component may return or take as children. */
export type UiNode = UiElement | string | number | bigint | boolean | null | undefined | Iterable<UiNode>;

export type FunctionComponent<P = Props> = (props: P) => UiNode;

export interface ComponentClass<P = Props> {
  new (props: P): ClassInstance;
  readonly isUiClass: true;
  getDerivedStateFromError?: (error: unknown) => Record<string, unknown> | null;
}

export interface ClassInstance {
  props: Props;
  state: Record<string, unknown>;
  render(): UiNode;
  componentDidMount?(): void;
  componentDidUpdate?(prevProps: Props, prevState: Record<string, unknown>): void;
  componentWillUnmount?(): void;
  componentDidCatch?(error: unknown, info: { componentStack: string }): void;
}

export interface MemoType {
  readonly $$kind: typeof MEMO;
  readonly inner: ElementType;
  readonly equal: ((a: Props, b: Props) => boolean) | null;
}

export interface LazyType {
  readonly $$kind: typeof LAZY;
  load: () => Promise<{ default: ElementType }>;
  status: "idle" | "pending" | "ready" | "failed";
  promise: Promise<void> | null;
  resolved: ElementType | null;
  error: unknown;
}

export interface ContextType<T> {
  readonly $$kind: typeof PROVIDER;
  readonly defaultValue: T;
  /** `<Ctx.Provider value>` and `<Ctx value>` are the same thing. */
  readonly Provider: ContextType<T>;
  readonly Consumer: FunctionComponent<{ children: (value: T) => UiNode }>;
  displayName?: string;
}

export type ElementType =
  | string
  | symbol
  | FunctionComponent<never>
  | ComponentClass<never>
  | MemoType
  | LazyType
  | ContextType<never>;

export function createElementRecord(type: ElementType, props: Props, key: unknown): UiElement {
  return { $$typeof: ELEMENT, type, props, key: key === undefined || key === null ? null : String(key) };
}

/** The automatic JSX runtime entry (`jsx`, `jsxs`, `jsxDEV`). */
export function jsx(type: ElementType, props: Props, key?: unknown): UiElement {
  if (props !== null && typeof props === "object" && "key" in props) {
    const { key: spreadKey, ...rest } = props;
    return createElementRecord(type, rest, key ?? spreadKey);
  }
  return createElementRecord(type, props, key);
}

/** The classic entry: `createElement(type, props, ...children)`. */
export function createElement(type: ElementType, config?: Props | null, ...children: UiNode[]): UiElement {
  const props: Props = {};
  let key: unknown = null;
  if (config !== null && config !== undefined) {
    for (const name in config) {
      if (name === "key") key = config[name];
      else props[name] = config[name];
    }
  }
  if (children.length === 1) props["children"] = children[0];
  else if (children.length > 1) props["children"] = children;
  return createElementRecord(type, props, key);
}

export function isValidElement(value: unknown): value is UiElement {
  return typeof value === "object" && value !== null && (value as { $$typeof?: unknown }).$$typeof === ELEMENT;
}

export function cloneElement(element: UiElement, config?: Props | null, ...children: UiNode[]): UiElement {
  const props: Props = { ...element.props };
  let key: unknown = element.key;
  if (config !== null && config !== undefined) {
    for (const name in config) {
      if (name === "key") key = config[name];
      else props[name] = config[name];
    }
  }
  if (children.length === 1) props["children"] = children[0];
  else if (children.length > 1) props["children"] = children;
  return createElementRecord(element.type, props, key);
}

/** Flattens children into the elements and text a parent actually holds; empties are dropped. */
export function flattenChildren(children: unknown, out: (UiElement | string)[] = []): (UiElement | string)[] {
  if (children === null || children === undefined || typeof children === "boolean") return out;
  if (typeof children === "string") {
    out.push(children);
    return out;
  }
  if (typeof children === "number" || typeof children === "bigint") {
    out.push(String(children));
    return out;
  }
  if (isValidElement(children)) {
    out.push(children);
    return out;
  }
  if (typeof children === "object" && Symbol.iterator in children) {
    for (const child of children as Iterable<unknown>) flattenChildren(child, out);
  }
  return out;
}

export const Children = {
  toArray(children: unknown): (UiElement | string)[] {
    return flattenChildren(children).map((child, index) =>
      isValidElement(child) && child.key === null ? createElementRecord(child.type, child.props, `.${index}`) : child,
    );
  },
  count(children: unknown): number {
    return flattenChildren(children).length;
  },
  map<T>(children: unknown, fn: (child: UiElement | string, index: number) => T): T[] {
    return flattenChildren(children).map(fn);
  },
  forEach(children: unknown, fn: (child: UiElement | string, index: number) => void): void {
    flattenChildren(children).forEach(fn);
  },
  only(children: unknown): UiElement {
    const all = flattenChildren(children);
    const first = all[0];
    if (all.length !== 1 || !isValidElement(first)) throw new Error("Children.only expected one element child");
    return first;
  },
};

export function memo<P>(inner: FunctionComponent<P>, equal?: (a: P, b: P) => boolean): FunctionComponent<P> {
  const type: MemoType = { $$kind: MEMO, inner: inner as ElementType, equal: (equal as MemoType["equal"]) ?? null };
  return type as unknown as FunctionComponent<P>; // type-escape: a memo marker stands where its component is used
}

export function lazy<P>(load: () => Promise<{ default: FunctionComponent<P> }>): FunctionComponent<P> {
  const type: LazyType = {
    $$kind: LAZY,
    load: load as LazyType["load"],
    status: "idle",
    promise: null,
    resolved: null,
    error: undefined,
  };
  return type as unknown as FunctionComponent<P>; // type-escape: a lazy marker stands where its component is used
}

/** Refs are props: `forwardRef` only reorders the arguments. */
export function forwardRef<P, R>(render: (props: P, ref: unknown) => UiNode): FunctionComponent<P & { ref?: R }> {
  return (props) => render(props, (props as { ref?: unknown }).ref ?? null);
}

export function createContext<T>(defaultValue: T): ContextType<T> {
  const context = { $$kind: PROVIDER, defaultValue } as { -readonly [K in keyof ContextType<T>]: ContextType<T>[K] };
  context.Provider = context;
  return context;
}

export const Suspense = SUSPENSE as unknown as FunctionComponent<{ fallback?: UiNode; children?: UiNode }>; // type-escape: marker type
export const StrictMode = Fragment as unknown as FunctionComponent<{ children?: UiNode }>; // type-escape: marker type
export const Profiler = Fragment as unknown as FunctionComponent<{ id?: string; onRender?: unknown; children?: UiNode }>; // type-escape: marker type

export function createPortal(children: UiNode, container: unknown, key?: Key | null): UiElement {
  return createElementRecord(PORTAL, { children, container }, key ?? null);
}

export function createRef<T>(): { current: T | null } {
  return { current: null };
}

/**
 * The engine's UI element: what JSX compiles to. An element is a plain record of
 * a type (a host tag, a component function or one of the built-in marker types),
 * its props and its key. Nothing here knows about a renderer.
 */

export const ELEMENT = Symbol.for("jg.ui.element");
const FRAGMENT = Symbol.for("jg.ui.fragment");
export const PROVIDER = Symbol.for("jg.ui.provider");
export const SUSPENSE = Symbol.for("jg.ui.suspense");
export const PORTAL = Symbol.for("jg.ui.portal");
export const MEMO = Symbol.for("jg.ui.memo");
export const LAZY = Symbol.for("jg.ui.lazy");

export type Key = string | number | bigint;
export type Props = Record<string, unknown>;

/** Whatever can stand as an element's type at run time: a tag name, a component, a marker. */
export type AnyType = string | symbol | object;

export interface UiElement<P = Props> {
  readonly $$typeof: typeof ELEMENT;
  readonly type: AnyType;
  readonly props: P;
  readonly key: string | null;
}

/** Anything a component may return or take as children. */
export type UiNode = UiElement | string | number | bigint | boolean | null | undefined | Iterable<UiNode>;

export interface FunctionComponent<P = object> {
  (props: P): UiNode;
  displayName?: string | undefined;
}

export interface ClassInstance {
  props: Props;
  state: object;
  render(): UiNode;
  componentDidMount?(): void;
  componentDidUpdate?(prevProps: never, prevState: never): void;
  componentWillUnmount?(): void;
  componentDidCatch?(error: unknown, info: { componentStack?: string | null }): void;
}

export interface ComponentClass<P = object> {
  new (props: P): { render(): UiNode };
  displayName?: string | undefined;
  getDerivedStateFromError?(error: unknown): object | null;
}

/** A component type as code names it: a tag, a function component or a class. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ElementType<P = any> = string | FunctionComponent<P> | ComponentClass<P>;

export interface MemoType {
  readonly $$kind: typeof MEMO;
  readonly inner: AnyType;
  readonly equal: ((a: Props, b: Props) => boolean) | null;
}

export interface LazyType {
  readonly $$kind: typeof LAZY;
  load: () => Promise<{ default: AnyType }>;
  status: "idle" | "pending" | "ready" | "failed";
  promise: Promise<void> | null;
  resolved: AnyType | null;
  error: unknown;
}

/**
 * A context. `<Ctx value>` and `<Ctx.Provider value>` provide; `useContext(Ctx)` reads. It is
 * typed as a component so JSX accepts it; at run time it is a marker the reconciler knows.
 */
export interface ContextType<T> {
  (props: { value: T; children?: UiNode }): UiNode;
  readonly $$kind: typeof PROVIDER;
  readonly defaultValue: T;
  readonly Provider: ContextType<T>;
  readonly Consumer: FunctionComponent<{ children: (value: T) => UiNode }>;
  displayName?: string | undefined;
}

export function createElementRecord(type: AnyType, props: Props, key: unknown): UiElement {
  if (typeof type === "string" && /^(?:group|mesh|primitive|object3D|scene|instancedMesh|lineSegments|points|sprite|[a-z][a-zA-Z]*(?:Geometry|Material|Light|Camera))$/.test(type)) {
    throw new Error(`UI cannot render the 3D tag <${type}>; useEngineDraw owns 3D objects. EntityPreview takes model and camera props for portraits.`);
  }
  return { $$typeof: ELEMENT, type, props, key: key === undefined || key === null ? null : String(key) };
}

/** The automatic JSX runtime entry (`jsx`, `jsxs`, `jsxDEV`). */
export function jsx(type: AnyType, props: Props, key?: unknown): UiElement {
  if (props !== null && typeof props === "object" && "key" in props) {
    const { key: spreadKey, ...rest } = props;
    return createElementRecord(type, rest, key ?? spreadKey);
  }
  return createElementRecord(type, props, key);
}

/** The classic entry: `createElement(type, props, ...children)`. */
export function createElement(type: AnyType, config?: object | null, ...children: UiNode[]): UiElement {
  const props: Props = {};
  let key: unknown = null;
  if (config !== null && config !== undefined) {
    const source = config as Props;
    for (const name in source) {
      if (name === "key") key = source[name];
      else props[name] = source[name];
    }
  }
  if (children.length === 1) props["children"] = children[0];
  else if (children.length > 1) props["children"] = children;
  return createElementRecord(type, props, key);
}

export function isValidElement<P = Props>(value: unknown): value is UiElement<P> {
  return typeof value === "object" && value !== null && (value as { $$typeof?: unknown }).$$typeof === ELEMENT;
}

export function cloneElement<P>(element: UiElement<P>, config?: object | null, ...children: UiNode[]): UiElement<P> {
  const props: Props = { ...(element.props as Props) };
  let key: unknown = element.key;
  if (config !== null && config !== undefined) {
    const source = config as Props;
    for (const name in source) {
      if (name === "key") key = source[name];
      else props[name] = source[name];
    }
  }
  if (children.length === 1) props["children"] = children[0];
  else if (children.length > 1) props["children"] = children;
  return createElementRecord(element.type, props, key) as UiElement<P>;
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

/** Skips a component's render when its props are shallowly equal to the last ones (or `equal` says so). */
export function memo<P>(inner: FunctionComponent<P> | ComponentClass<P>, equal?: (previous: Readonly<P>, next: Readonly<P>) => boolean): FunctionComponent<P> {
  const type: MemoType = { $$kind: MEMO, inner, equal: (equal as MemoType["equal"]) ?? null };
  return type as unknown as FunctionComponent<P>; // type-escape: a memo marker stands where its component is used
}

/** A component whose code loads on first render; a `Suspense` above shows its fallback meanwhile. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazy<T extends FunctionComponent<any> | ComponentClass<any>>(load: () => Promise<{ default: T }>): T {
  const type: LazyType = { $$kind: LAZY, load, status: "idle", promise: null, resolved: null, error: undefined };
  return type as unknown as T; // type-escape: a lazy marker stands where its component is used
}

/** Refs are props: `forwardRef` only hands `props.ref` over as the second argument. */
export function forwardRef<T, P = object>(render: (props: P, ref: ((instance: T | null) => void) | { current: T | null } | null) => UiNode): FunctionComponent<P & { ref?: ((instance: T | null) => void) | { current: T | null } | null | undefined }> {
  return (props) => render(props, props.ref ?? null);
}

export function createContextRecord<T>(defaultValue: T): ContextType<T> {
  const context = { $$kind: PROVIDER, defaultValue } as unknown as { -readonly [K in keyof ContextType<T>]: ContextType<T>[K] }; // type-escape: the marker is given a component's type
  context.Provider = context as unknown as ContextType<T>; // type-escape: the marker is its own Provider
  return context as unknown as ContextType<T>; // type-escape: see above
}

export const Fragment = FRAGMENT as unknown as FunctionComponent<{ children?: UiNode }>; // type-escape: marker typed as a component
export const Suspense = SUSPENSE as unknown as FunctionComponent<{ fallback?: UiNode; children?: UiNode; name?: string }>; // type-escape: marker typed as a component
export const StrictMode = FRAGMENT as unknown as FunctionComponent<{ children?: UiNode }>; // type-escape: marker typed as a component
export const Profiler = FRAGMENT as unknown as FunctionComponent<{ id?: string; onRender?: unknown; children?: UiNode }>; // type-escape: marker typed as a component

export function createPortal(children: UiNode, container: unknown, key?: Key | null): UiElement {
  return createElementRecord(PORTAL, { children, container }, key ?? null);
}

export function createRef<T>(): { current: T | null } {
  return { current: null };
}

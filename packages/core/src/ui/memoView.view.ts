import { isValidElement, memo, useRef, type ComponentType, type NamedExoticComponent, type ReactNode } from "react";

import { isLive, live, type LiveValue } from "./liveBind.view";

/*
 * Engine view parts re-render only when what they show changes, never because their parent did. A
 * part made with `memoView` compares its new props with the last ones it drew: event handlers
 * (`onClick`, `onPointerDown`, any `on*` function) and live values (`live(() => ...)`) always count
 * as the same, and the part calls the newest one when the event fires or the frame reads it; children
 * and other nodes compare by what they would draw; a style compares by its entries; plain data
 * compares by its values. So `<KitButton onClick={() => buy(id)}><b>Buy</b></KitButton>` written
 * inline in a component that re-renders every frame draws once.
 */

const latestByProps = new WeakMap<object, Map<string, unknown>>();

const NODE_BUDGET = 400;

function isHandlerKey(key: string): boolean {
  return key.length > 2 && key.charCodeAt(0) === 111 && key.charCodeAt(1) === 110 && key.charCodeAt(2) >= 65 && key.charCodeAt(2) <= 90;
}

function isPlainObject(value: object): boolean {
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sameStyle(previous: unknown, next: unknown): boolean {
  if (Object.is(previous, next)) return true;
  if (typeof previous !== "object" || typeof next !== "object" || previous === null || next === null) return false;
  if (!isPlainObject(previous) || !isPlainObject(next)) return false;
  const keys = Object.keys(previous);
  if (keys.length !== Object.keys(next).length) return false;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) return false;
    const before: unknown = Reflect.get(previous, key);
    const after: unknown = Reflect.get(next, key);
    if (!Object.is(before, after)) return false;
  }
  return true;
}

interface Budget {
  left: number;
}

/** Plain data (numbers, strings, arrays and plain objects of them) compared by value. */
function sameData(previous: unknown, next: unknown, budget: Budget): boolean {
  if (Object.is(previous, next)) return true;
  budget.left -= 1;
  if (budget.left < 0) return false;
  if (typeof previous !== "object" || typeof next !== "object" || previous === null || next === null) return false;
  if (Array.isArray(previous)) {
    if (!Array.isArray(next) || previous.length !== next.length) return false;
    for (let index = 0; index < previous.length; index += 1) if (!sameValue(previous[index], next[index], budget, false)) return false;
    return true;
  }
  if (Array.isArray(next) || !isPlainObject(previous) || !isPlainObject(next)) return false;
  const keys = Object.keys(previous);
  if (keys.length !== Object.keys(next).length) return false;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) return false;
    if (!sameValue(Reflect.get(previous, key), Reflect.get(next, key), budget, false)) return false;
  }
  return true;
}

/**
 * Two values a part would draw the same way. Inside children (`trusted` false) an object that is not
 * a node, a style or plain data never counts as the same even when it is the same object: a game
 * component handed a record it mutates in place must still draw the change.
 */
function sameValue(previous: unknown, next: unknown, budget: Budget, trusted: boolean): boolean {
  if (typeof previous !== "object" || typeof next !== "object" || previous === null || next === null) return Object.is(previous, next);
  if (isValidElement(previous) || isValidElement(next)) return sameNode(previous as ReactNode, next as ReactNode, budget);
  if (isLive(previous) && isLive(next)) return true;
  if (Object.is(previous, next)) return trusted || Object.isFrozen(previous);
  return sameData(previous, next, budget);
}

/** Two React nodes that draw the same: the same text, or elements of the same type, key and props. */
export function sameNode(previous: ReactNode, next: ReactNode, budget: Budget = { left: NODE_BUDGET }): boolean {
  if (Object.is(previous, next)) return true;
  budget.left -= 1;
  if (budget.left < 0) return false;
  if (Array.isArray(previous) || Array.isArray(next)) {
    if (!Array.isArray(previous) || !Array.isArray(next) || previous.length !== next.length) return false;
    for (let index = 0; index < previous.length; index += 1) if (!sameNode(previous[index] as ReactNode, next[index] as ReactNode, budget)) return false;
    return true;
  }
  if (!isValidElement(previous) || !isValidElement(next)) return false;
  if (previous.type !== next.type || previous.key !== next.key) return false;
  const before = previous.props as Record<string, unknown>;
  const after = next.props as Record<string, unknown>;
  const keys = Object.keys(before);
  if (keys.length !== Object.keys(after).length) return false;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(after, key)) return false;
    const a = before[key];
    const b = after[key];
    if (key === "style") {
      if (!sameStyle(a, b)) return false;
    } else if (typeof a === "function" || typeof b === "function") {
      if (!Object.is(a, b)) return false;
    } else if (!sameValue(a, b, budget, false)) return false;
  }
  return true;
}

/**
 * Whether a {@link memoView} part would draw `next` exactly as it drew `previous`. Handlers and live
 * values differing only by identity count as the same and are recorded as the newest, so the part
 * still calls the current one.
 */
export function samePartProps(previous: object, next: object): boolean {
  const before = previous as Record<string, unknown>;
  const after = next as Record<string, unknown>;
  const keys = Object.keys(before);
  if (keys.length !== Object.keys(after).length) return false;
  const budget: Budget = { left: NODE_BUDGET };
  let newest: Map<string, unknown> | null = null;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(after, key)) return false;
    const a = before[key];
    const b = after[key];
    if (Object.is(a, b)) continue;
    if ((typeof a === "function" && typeof b === "function" && isHandlerKey(key)) || (isLive(a) && isLive(b))) {
      newest ??= new Map();
      newest.set(key, b);
      continue;
    }
    if (key === "children") {
      if (!sameNode(a as ReactNode, b as ReactNode, budget)) return false;
      continue;
    }
    if (key === "style") {
      if (!sameStyle(a, b)) return false;
      continue;
    }
    if (typeof a === "function" || typeof b === "function") return false;
    if (!sameValue(a, b, budget, true)) return false;
  }
  if (newest !== null) {
    const record = latestByProps.get(previous) ?? new Map<string, unknown>();
    for (const [key, value] of newest) record.set(key, value);
    latestByProps.set(previous, record);
  }
  return true;
}

function newest(props: object, key: string): unknown {
  const record = latestByProps.get(props);
  return record !== undefined && record.has(key) ? record.get(key) : Reflect.get(props, key);
}

type Callable = (...args: never[]) => unknown;

/**
 * The props a part draws with: each `on*` handler and live value replaced by a stable stand-in that
 * reaches the newest one the parent passed, so a skipped render never leaves an old closure behind.
 */
function useNewestProps<P extends object>(props: P): P {
  const propsRef = useRef(props);
  propsRef.current = props;
  const standIns = useRef<Map<string, unknown> | null>(null);
  let out: P = props;
  for (const key of Object.keys(props)) {
    const value: unknown = Reflect.get(props, key);
    const handler = typeof value === "function" && isHandlerKey(key);
    if (!handler && !isLive(value)) continue;
    standIns.current ??= new Map();
    let standIn = standIns.current.get(key);
    if (standIn === undefined || (handler ? typeof standIn !== "function" : !isLive(standIn))) {
      standIn = handler
        ? (...args: never[]) => {
            const current = newest(propsRef.current, key);
            return typeof current === "function" ? (current as Callable)(...args) : undefined;
          }
        : live(() => (newest(propsRef.current, key) as LiveValue<unknown>).get());
      standIns.current.set(key, standIn);
    }
    if (out === props) out = { ...props };
    Reflect.set(out, key, standIn);
  }
  return out;
}

/**
 * Make a view part that re-renders only when what it draws changes ({@link samePartProps}), never
 * because its parent re-rendered. Every engine UI part (kit parts, HUD blocks) is made with it, so a
 * game writes ordinary inline JSX around them and pays nothing for a busy parent. `name` labels the
 * part in React DevTools and the render counter.
 *
 * @capability memo-view a UI part that skips its parent's re-renders: inline handlers, live values and equal children never redraw it
 */
export function memoView<P extends object>(name: string, Part: (props: P) => ReactNode): NamedExoticComponent<P> {
  const View = (props: P): ReactNode => Part(useNewestProps(props));
  View.displayName = name;
  const memoized = memo(View as ComponentType<P>, samePartProps);
  memoized.displayName = name;
  return memoized;
}

/**
 * The engine's UI component API: elements, hooks and the few built-in component
 * types. Games write UI as function components in JSX; this is what that JSX
 * and those hooks resolve to. It has no renderer in it: `client.view` mounts a
 * tree on Rune or the DOM, `markup` renders one to a string.
 */

import {
  Children,
  Fragment,
  Profiler,
  StrictMode,
  Suspense,
  createContextRecord,
  createElement,
  createPortal,
  isValidElement,
  lazy,
  memo,
  type ContextType,
  type UiNode,
} from "./element";
import {
  Component,
  act,
  flushSync,
  use,
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useId,
  useImperativeHandle,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "./reconciler";

/** A context: `<Ctx value>` (or `<Ctx.Provider value>`) provides, `useContext(Ctx)` reads. */
export function createContext<T>(defaultValue: T): ContextType<T> {
  const context = createContextRecord(defaultValue) as unknown as { -readonly [K in keyof ContextType<T>]: ContextType<T>[K] }; // type-escape: filling the marker's Consumer
  context.Consumer = (props: { children: (value: T) => UiNode }) => props.children(useContext(context as unknown as ContextType<T>)); // type-escape: same marker
  return context as unknown as ContextType<T>; // type-escape: see above
}

export {
  Children,
  Component,
  Fragment,
  Profiler,
  StrictMode,
  Suspense,
  act,
  createElement,
  createPortal,
  flushSync,
  isValidElement,
  lazy,
  memo,
  use,
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useId,
  useImperativeHandle,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
};

export const version = "jgengine-ui";

export type * from "./types";
export type { ActionDispatch, AnyActionArg } from "./reconciler";

const api = {
  Children,
  Component,
  Fragment,
  Profiler,
  StrictMode,
  Suspense,
  act,
  createContext,
  createElement,
  createPortal,
  flushSync,
  isValidElement,
  lazy,
  memo,
  use,
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useId,
  useImperativeHandle,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  version,
};

export default api;

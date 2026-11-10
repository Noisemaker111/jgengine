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
  cloneElement,
  createContextRecord,
  createElement,
  createPortal,
  createRef,
  forwardRef,
  isValidElement,
  lazy,
  memo,
  type ContextType,
  type UiNode,
} from "./element";
import {
  Component,
  PureComponent,
  act,
  flushSync,
  startTransition,
  use,
  useCallback,
  useContext,
  useDebugValue,
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
  useTransition,
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
  PureComponent,
  StrictMode,
  Suspense,
  act,
  cloneElement,
  createElement,
  createPortal,
  createRef,
  flushSync,
  forwardRef,
  isValidElement,
  lazy,
  memo,
  startTransition,
  use,
  useCallback,
  useContext,
  useDebugValue,
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
  useTransition,
};

export const version = "jgengine-ui";

export type * from "./types";
export type { ActionDispatch, AnyActionArg } from "./reconciler";

const api = {
  Children,
  Component,
  Fragment,
  Profiler,
  PureComponent,
  StrictMode,
  Suspense,
  act,
  cloneElement,
  createContext,
  createElement,
  createPortal,
  createRef,
  flushSync,
  forwardRef,
  isValidElement,
  lazy,
  memo,
  startTransition,
  use,
  useCallback,
  useContext,
  useDebugValue,
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
  useTransition,
  version,
};

export default api;

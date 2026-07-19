import { useEffect, useMemo, type DependencyList } from "react";

/** Anything exposing dispose() — three.js geometries, materials, textures, render targets. */
export interface Disposable {
  dispose(): void;
}

/** Dispose a single resource or every resource in a tuple. */
export function disposeAll(value: Disposable | readonly Disposable[]): void {
  if (Array.isArray(value)) {
    for (const item of value as readonly Disposable[]) item.dispose();
    return;
  }
  (value as Disposable).dispose();
}

/**
 * Memoize a three.js resource (or tuple of resources) and dispose it when `deps` change or the
 * component unmounts. Owns the useMemo + dispose-effect pair that otherwise repeats at every
 * GPU-resource call site. The factory must return objects exposing `dispose()` (geometries,
 * materials, textures, render targets).
 *
 * @capability disposable-resource memoize a three.js GPU resource (or tuple) with automatic dispose on change/unmount — no hand-rolled useMemo + dispose-effect pairs
 */
export function useDisposable<T extends Disposable | readonly Disposable[]>(
  create: () => T,
  deps: DependencyList,
): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo(create, deps);
  useEffect(() => () => disposeAll(value), [value]);
  return value;
}

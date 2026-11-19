import { useRef } from "@jgengine/core/ui/jsx";

/** @internal */
export function sameTextureSet(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => (a as Record<string, unknown>)[key] === (b as Record<string, unknown>)[key]);
}

/** @internal */
export function useStableTextureSet<T extends object>(textures: T): T {
  const stable = useRef(textures);
  if (!sameTextureSet(stable.current, textures)) stable.current = textures;
  return stable.current;
}

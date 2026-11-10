interface PatchNode<T> {
  c?: readonly T[];
}

/** Keep only attached replacement roots after all changes in one mirror pass. */
export function compactPatches<T extends PatchNode<T>>(patches: readonly T[], roots: ReadonlySet<T>, owner: (node: T) => T | undefined): T[] {
  const candidates = new Set(patches);
  return [...candidates].filter((patch) => {
    let node = patch;
    let covered = false;
    for (;;) {
      if (roots.has(node)) return !covered;
      const parent = owner(node);
      if (parent === undefined || parent.c?.includes(node) !== true) return false;
      if (candidates.has(parent)) covered = true;
      node = parent;
    }
  });
}

# Save generated items in bounded pages

Use this recipe when an existing project owns generated item storage and wants
runtime ids and incremental save export without mirroring its items into another
registry. The interface is synchronous; it does not provide a database adapter.

```ts
import {
  createItemInstanceRegistry,
  type ItemInstanceStorage,
  type ItemInstanceRegistryState,
} from "@jgengine/core/item/itemInstanceRegistry";

type RolledItem = { damage: number; affixes: string[] };

let existingItems = new Map<string, RolledItem>();
const storage: ItemInstanceStorage<RolledItem> = {
  get: (id) => existingItems.get(id),
  has: (id) => existingItems.has(id),
  set: (id, definition) => void existingItems.set(id, definition),
  delete: (id) => void existingItems.delete(id),
  count: () => existingItems.size,
  entries: () => existingItems.entries(),
  replace(entries) {
    const staged = new Map(entries);
    existingItems = staged;
  },
};

const registry = createItemInstanceRegistry("rolled", { storage });
const runtimeId = registry.register("blade", { damage: 17, affixes: ["keen"] });
const item = registry.get(runtimeId);
```

The example adapter stages replacement in another Map. A larger caller-owned
store can stage in its own transaction or generation and switch on success.
`replace` must consume the entire iterable synchronously and preserve old data
when iteration, cloning, validation, or commit fails. Do not clear live data and
then populate it. Stream `entries()` in stable order; materializing all entries
inside the adapter defeats bounded export.

## Export and restore

```ts
function saveItems(writePage: (json: string) => void): void {
  for (const page of registry.statePages(256)) {
    writePage(JSON.stringify(page));
  }
}

function restoreItems(readPages: Iterable<string>): boolean {
  function* decodedPages(): IterableIterator<ItemInstanceRegistryState<RolledItem>> {
    for (const json of readPages) {
      yield JSON.parse(json) as ItemInstanceRegistryState<RolledItem>;
    }
  }
  return registry.restorePages(decodedPages());
}
```

Each page retains the existing `{ prefix, sequence, entries }` save shape.
An empty registry exports one empty page so released ids still retain their
allocation sequence. Every restored page must have the same prefix and sequence.
Each page's definitions are detached independently; cross-page object identity
is not preserved. Keep definitions JSON-compatible for JSON saves.

`statePages` captures the allocator when called, reads at most `pageSize` entries
per step, and clones only that batch. Registry mutations invalidate the export
and the next step throws. Abandoning an iterator never blocks writes; call its
`return()` when stopping early to release adapter resources. Keep direct writes
to injected storage and definition objects quiescent during export: the registry
cannot detect them. The caller owns immutable capture or staging if saves must
overlap live changes. Publish a set of pages only after the complete export
succeeds; discard partial saves on failure.

`restorePages` returns false for an empty iterable or an invalid first header.
Later inconsistent headers, clone failures, and storage failures throw. A
conforming adapter keeps both the old collection and allocator intact on failure.
Restore consumes and clones one input page at a time; storage staging cost belongs
to the adapter. Existing `state()` and `restore(state)` remain whole-collection
operations and retain their original save shape.

## Reattach existing storage

If the caller restores storage separately, persist the page's allocator header
alongside it and attach with its original prefix and sequence:

```ts
function reattach(savedHeader: { prefix: string; sequence: number }) {
  return createItemInstanceRegistry(savedHeader.prefix, {
    storage,
    sequence: savedHeader.sequence,
  });
}
```

Never derive sequence from count: released ids must remain consumed. Allocation
checks collisions against attached storage, but saving the real sequence avoids
searching through old ids. Allocation stops at `Number.MAX_SAFE_INTEGER` instead
of reusing ids through numeric rounding. The default registry remains in memory;
injected storage owns retention, indexing, transaction policy, and persistence.

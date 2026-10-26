import { createObservableKeyedStore } from "../store/observableKeyedStore";

export type StructureVec3 = readonly [number, number, number];

export interface PlacedStructure {
  id: string;
  catalogId: string;
  position: StructureVec3;
  rotationY: number;
  plotId?: string;
  data?: Readonly<Record<string, unknown>>;
}

export interface AddStructureInput {
  id?: string;
  catalogId: string;
  position: StructureVec3;
  rotationY?: number;
  plotId?: string;
  data?: Readonly<Record<string, unknown>>;
}

export interface StructureFilter {
  plotId?: string;
  catalogId?: string;
}

export interface PlacedStructureSnapshot {
  structures: readonly PlacedStructure[];
}

export interface PlacedStructureStore {
  add(input: AddStructureInput): PlacedStructure;
  move(id: string, position: StructureVec3): boolean;
  rotate(id: string, rotationY: number): boolean;
  remove(id: string): boolean;
  get(id: string): PlacedStructure | null;
  list(filter?: StructureFilter): readonly PlacedStructure[];
  clear(): void;
  select(id: string | null): boolean;
  selected(): PlacedStructure | null;
  snapshot(): PlacedStructureSnapshot;
  load(snapshot: PlacedStructureSnapshot): void;
  subscribe(listener: () => void): () => void;
}

export function createPlacedStructureStore(): PlacedStructureStore {
  const store = createObservableKeyedStore<PlacedStructure>();
  let counter = 1;
  let selectedId: string | null = null;

  function generateId(): string {
    let id = `structure-${counter}`;
    while (store.has(id)) {
      counter += 1;
      id = `structure-${counter}`;
    }
    counter += 1;
    return id;
  }

  return {
    add(input) {
      if (input.id !== undefined && store.has(input.id)) {
        throw new Error(`Structure id "${input.id}" already exists.`);
      }
      const id = input.id ?? generateId();
      const structure: PlacedStructure = {
        id,
        catalogId: input.catalogId,
        position: input.position,
        rotationY: input.rotationY ?? 0,
        ...(input.plotId === undefined ? {} : { plotId: input.plotId }),
        ...(input.data === undefined ? {} : { data: input.data }),
      };
      store.set(id, structure);
      return structure;
    },
    move(id, position) {
      const current = store.get(id);
      if (current === undefined) return false;
      store.set(id, { ...current, position });
      return true;
    },
    rotate(id, rotationY) {
      const current = store.get(id);
      if (current === undefined) return false;
      store.set(id, { ...current, rotationY });
      return true;
    },
    remove(id) {
      const existed = store.has(id);
      store.delete(id);
      if (selectedId === id) selectedId = null;
      return existed;
    },
    get(id) {
      return store.get(id) ?? null;
    },
    list(filter) {
      const all = store.arraySnapshot();
      if (filter === undefined) return all;
      return all.filter(
        (structure) =>
          (filter.plotId === undefined || structure.plotId === filter.plotId) &&
          (filter.catalogId === undefined || structure.catalogId === filter.catalogId),
      );
    },
    clear() {
      for (const structure of store.arraySnapshot()) store.delete(structure.id);
      selectedId = null;
    },
    select(id) {
      if (id === null) {
        selectedId = null;
        return true;
      }
      if (!store.has(id)) return false;
      selectedId = id;
      return true;
    },
    selected() {
      return selectedId === null ? null : store.get(selectedId) ?? null;
    },
    snapshot() {
      return { structures: store.arraySnapshot() };
    },
    load(snapshot) {
      for (const structure of store.arraySnapshot()) store.delete(structure.id);
      selectedId = null;
      for (const structure of snapshot.structures) store.set(structure.id, structure);
    },
    subscribe(listener) {
      return store.subscribe(listener);
    },
  };
}

import type { EntityColliderSet } from "../scene/colliders";
import type { EntityMovement, EntityRole, SceneEntity } from "../scene/entityStore";
import type { BehaviorDescriptor } from "../scene/behaviors";
import type { PlaceOptions, SceneObject } from "../scene/objectStore";

/**
 * What happens to one kind of content (bodies, entities) while its cell is unloaded:
 * `"simulate"` leaves it untouched, `"freeze"` keeps it but stops it, `"despawn"` saves it to a plain
 * record, removes it, and brings it back from the record when the cell loads.
 */
export type OffCellRule = "simulate" | "freeze" | "despawn";

/** A cell's XZ footprint. */
export interface CellBounds {
  min: readonly [number, number];
  max: readonly [number, number];
}

/** How {@link createCellContent} reads, saves and restores one kind of content. */
export interface CellContentAdapter<TRecord, TFrozen = never> {
  /** Ids of this content standing in a cell, read through the store's spatial index. */
  idsIn(bounds: CellBounds): readonly string[];
  /** A plain JSON record that brings the item back, or null for an item that must never leave (the player). */
  save(id: string): TRecord | null;
  remove(id: string): void;
  restore(record: TRecord): void;
  /** Stop an item kept by the `"freeze"` rule, returning the plain record `thaw` restarts it from, or undefined to leave it running. */
  freeze?(id: string): TFrozen | undefined;
  thaw?(id: string, frozen: TFrozen): void;
}

/** Options for {@link createCellContent}. */
export interface CellContentOptions<TRecord, TFrozen = never> {
  rule: OffCellRule;
  adapter: CellContentAdapter<TRecord, TFrozen>;
  /** Most saved items one {@link CellContent.step} brings back. Default 64. */
  restoresPerStep?: number;
}

/** Plain JSON state of a {@link CellContent}: what each unloaded cell holds, saved or frozen. */
export interface CellContentState<TRecord, TFrozen = never> {
  rule: OffCellRule;
  parked: [cell: string, records: TRecord[]][];
  frozen: [cell: string, items: [id: string, frozen: TFrozen][]][];
  restoring: string[];
}

/** Gauges of what a {@link CellContent} holds. */
export interface CellContentStats {
  parkedCells: number;
  parkedItems: number;
  frozenItems: number;
  restoring: number;
  /** Items brought back by the last step. */
  restoredLastStep: number;
}

/** One kind of content following its cells in and out of residency. */
export interface CellContent<TRecord, TFrozen = never> {
  /** The cell unloaded: save, freeze or leave its content by the rule. Returns how many items it touched. */
  unload(cell: string, bounds: CellBounds): number;
  /** The cell loaded: thaw its frozen items now and queue its saved ones for {@link step}. */
  load(cell: string): void;
  /** Bring back up to `restoresPerStep` queued items. */
  step(): number;
  /** Whether a loaded cell has all of its content back. */
  settled(cell: string): boolean;
  isFrozen(id: string): boolean;
  rule(): OffCellRule;
  /** Change the rule for cells that unload from now on; cells already unloaded keep how they left. */
  retune(patch: { rule?: OffCellRule; restoresPerStep?: number }): void;
  stats(): CellContentStats;
  snapshot(): CellContentState<TRecord, TFrozen>;
  restore(state: CellContentState<TRecord, TFrozen>): void;
  reset(): void;
}

/**
 * Make one kind of content follow its cells: when a streamed cell unloads its items are left
 * simulating, frozen, or saved and removed, as the game picked, and when it loads they come back a
 * few per step so a dense cell never lands in one frame. Pair one per kind (bodies, entities) with a
 * world streamer.
 * @capability cell-content entities and bodies in an unloaded cell keep simulating, freeze, or despawn with saved state
 */
export function createCellContent<TRecord, TFrozen = never>(options: CellContentOptions<TRecord, TFrozen>): CellContent<TRecord, TFrozen> {
  const adapter = options.adapter;
  let rule = options.rule;
  let perStep = Math.max(1, Math.floor(options.restoresPerStep ?? 64));
  const parked = new Map<string, TRecord[]>();
  const frozen = new Map<string, [string, TFrozen][]>();
  const frozenIds = new Set<string>();
  const queue: string[] = [];
  let restoredLastStep = 0;

  return {
    unload(cell, bounds) {
      if (rule === "simulate") return 0;
      const ids = adapter.idsIn(bounds);
      if (rule === "freeze") {
        const list = frozen.get(cell) ?? [];
        for (const id of ids) {
          if (frozenIds.has(id)) continue;
          const record = adapter.freeze?.(id);
          if (record === undefined) continue;
          frozenIds.add(id);
          list.push([id, record]);
        }
        if (list.length > 0) frozen.set(cell, list);
        return list.length;
      }
      const index = queue.indexOf(cell);
      if (index >= 0) queue.splice(index, 1);
      const records = parked.get(cell) ?? [];
      let count = 0;
      for (const id of ids) {
        const record = adapter.save(id);
        if (record === null) continue;
        adapter.remove(id);
        records.push(record);
        count += 1;
      }
      if (records.length > 0) parked.set(cell, records);
      return count;
    },
    load(cell) {
      for (const [id, record] of frozen.get(cell) ?? []) {
        adapter.thaw?.(id, record);
        frozenIds.delete(id);
      }
      frozen.delete(cell);
      if (parked.has(cell) && !queue.includes(cell)) queue.push(cell);
    },
    step() {
      let left = perStep;
      while (left > 0 && queue.length > 0) {
        const cell = queue[0]!;
        const records = parked.get(cell) ?? [];
        while (left > 0 && records.length > 0) {
          adapter.restore(records.shift()!);
          left -= 1;
        }
        if (records.length === 0) {
          parked.delete(cell);
          queue.shift();
        }
      }
      restoredLastStep = perStep - left;
      return restoredLastStep;
    },
    settled: (cell) => !queue.includes(cell) && !frozen.has(cell),
    isFrozen: (id) => frozenIds.has(id),
    rule: () => rule,
    retune(patch) {
      if (patch.rule !== undefined) rule = patch.rule;
      if (patch.restoresPerStep !== undefined) perStep = Math.max(1, Math.floor(patch.restoresPerStep));
    },
    stats() {
      let parkedItems = 0;
      for (const records of parked.values()) parkedItems += records.length;
      return { parkedCells: parked.size, parkedItems, frozenItems: frozenIds.size, restoring: queue.length, restoredLastStep };
    },
    snapshot: () => ({
      rule,
      parked: [...parked.entries()].map(([cell, records]) => [cell, [...records]]),
      frozen: [...frozen.entries()].map(([cell, items]) => [cell, items.map(([id, record]): [string, TFrozen] => [id, record])]),
      restoring: [...queue],
    }),
    restore(state) {
      rule = state.rule;
      parked.clear();
      frozen.clear();
      frozenIds.clear();
      queue.length = 0;
      for (const [cell, records] of state.parked) parked.set(cell, [...records]);
      for (const [cell, items] of state.frozen) {
        frozen.set(cell, items.map(([id, record]): [string, TFrozen] => [id, record]));
        for (const [id] of items) frozenIds.add(id);
      }
      queue.push(...state.restoring.filter((cell) => parked.has(cell)));
    },
    reset() {
      parked.clear();
      frozen.clear();
      frozenIds.clear();
      queue.length = 0;
    },
  };
}

/** The slice of the scene object API {@link sceneObjectCells} reads and writes. */
export interface CellObjectStore {
  get(instanceId: string): SceneObject | null;
  inBox(min: readonly [number, number, number], max: readonly [number, number, number]): readonly SceneObject[];
  place(catalogId: string, x: number, y: number, z: number, options?: PlaceOptions): string;
  remove(instanceId: string): boolean;
  setColliders(instanceId: string, colliders: EntityColliderSet | null): void;
  collidersOf(instanceId: string): EntityColliderSet | null;
}

/** A placed object saved with its body, ready to place again. */
export interface CellObjectRecord {
  object: SceneObject;
  colliders: EntityColliderSet | null;
}

const TALL = 1e5;

/**
 * Scene objects and their bodies as cell content: an unloaded cell's props leave the object store
 * with their colliders (so physics and every draw drop them) and are placed again, same id, when it
 * loads. `keep` names objects that never leave. Objects have no motion to stop, so `"freeze"` keeps them.
 */
export function sceneObjectCells(objects: CellObjectStore, options: { keep?: (object: SceneObject) => boolean } = {}): CellContentAdapter<CellObjectRecord> {
  return {
    idsIn: (bounds) => objects.inBox([bounds.min[0], -TALL, bounds.min[1]], [bounds.max[0], TALL, bounds.max[1]])
      .filter((object) => object.position[0] < bounds.max[0] && object.position[2] < bounds.max[1])
      .map((object) => object.instanceId),
    save(id) {
      const object = objects.get(id);
      if (object === null || options.keep?.(object) === true) return null;
      return { object: structuredClone(object), colliders: objects.collidersOf(id) };
    },
    remove: (id) => void objects.remove(id),
    restore({ object, colliders }) {
      const id = objects.place(object.catalogId, object.position[0], object.position[1], object.position[2], {
        instanceId: object.instanceId,
        rotation: object.rotationY,
        onExisting: "replace",
        ...(object.parentSpace === undefined ? {} : { parentSpace: object.parentSpace }),
        ...(object.visual === undefined ? {} : { visual: object.visual }),
        ...(object.state === undefined ? {} : { state: object.state }),
        ...(object.slots === undefined ? {} : { slots: object.slots }),
        ...(object.animation === undefined ? {} : { animation: object.animation }),
      });
      objects.setColliders(id, colliders);
    },
  };
}

/** The slice of the scene entity API {@link sceneEntityCells} reads and writes. */
export interface CellEntityStore {
  get(id: string): SceneEntity | null;
  inRadius(center: readonly [number, number, number], radius: number): string[];
  spawn(name: string, options: {
    id: string;
    position: readonly [number, number, number];
    rotationY: number;
    rotationX: number;
    rotationZ: number;
    role: EntityRole;
    movement: EntityMovement;
    behaviors: readonly BehaviorDescriptor[];
    hidden?: boolean;
    size?: number;
    look?: string;
    meta?: unknown;
    onExisting: "replace";
  }): string;
  despawn(id: string): boolean;
  update(id: string, patch: { movement?: EntityMovement; hidden?: boolean }): boolean;
  setColliders(id: string, colliders: EntityColliderSet | null): void;
  collidersOf(id: string): EntityColliderSet | null;
}

/** How a frozen entity moved and showed before its cell unloaded. */
export interface FrozenEntity {
  movement: EntityMovement;
  hidden: boolean;
}

/** A despawned entity's saved body, ready to spawn again. */
export interface CellEntityRecord {
  entity: SceneEntity;
  colliders: EntityColliderSet | null;
  /** What the game's `extra.save` kept for this entity. */
  extra?: unknown;
}

/**
 * Scene entities as cell content. `"despawn"` saves each entity's pose, role, movement, behaviors and
 * look (plus the game's own `extra` record) and spawns it again under the same id; `"freeze"` stops
 * its movement and hides it until the cell loads. Players never leave, nor anything `keep` names
 * (the car someone is driving).
 */
export function sceneEntityCells(
  entities: CellEntityStore,
  options: { keep?: (entity: SceneEntity) => boolean; extra?: { save(entity: SceneEntity): unknown; restore(id: string, extra: unknown): void } } = {},
): CellContentAdapter<CellEntityRecord, FrozenEntity> {
  const leaves = (entity: SceneEntity | null): entity is SceneEntity => entity !== null && entity.role !== "player" && options.keep?.(entity) !== true;
  return {
    idsIn(bounds) {
      const cx = (bounds.min[0] + bounds.max[0]) / 2;
      const cz = (bounds.min[1] + bounds.max[1]) / 2;
      const radius = Math.hypot(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1]) / 2;
      return entities.inRadius([cx, 0, cz], radius + 1).filter((id) => {
        const position = entities.get(id)?.position;
        return position !== undefined && position[0] >= bounds.min[0] && position[0] < bounds.max[0] && position[2] >= bounds.min[1] && position[2] < bounds.max[1];
      });
    },
    save(id) {
      const entity = entities.get(id);
      if (!leaves(entity)) return null;
      const extra = options.extra?.save(entity);
      return { entity: structuredClone(entity), colliders: entities.collidersOf(id), ...(extra === undefined ? {} : { extra }) };
    },
    remove: (id) => void entities.despawn(id),
    restore({ entity, colliders, extra }) {
      const id = entities.spawn(entity.name, {
        id: entity.id,
        position: entity.position,
        rotationY: entity.rotationY,
        rotationX: entity.rotationX,
        rotationZ: entity.rotationZ,
        role: entity.role,
        movement: entity.movement,
        behaviors: entity.behaviors,
        onExisting: "replace",
        ...(entity.hidden === undefined ? {} : { hidden: entity.hidden }),
        ...(entity.size === undefined ? {} : { size: entity.size }),
        ...(entity.look === undefined ? {} : { look: entity.look }),
        ...(entity.meta === undefined ? {} : { meta: entity.meta }),
      });
      if (colliders !== null) entities.setColliders(id, colliders);
      if (extra !== undefined) options.extra?.restore(id, extra);
    },
    freeze(id) {
      const entity = entities.get(id);
      if (!leaves(entity)) return undefined;
      const was = { movement: structuredClone(entity.movement), hidden: entity.hidden === true };
      entities.update(id, { movement: { ...entity.movement, frozen: true }, hidden: true });
      return was;
    },
    thaw(id, frozen) {
      entities.update(id, { movement: { ...frozen.movement, frozen: frozen.movement.frozen === true }, hidden: frozen.hidden });
    },
  };
}

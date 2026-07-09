/**
 * Unity-style behaviour lifecycle over a headless id-keyed node tree, ported from
 * vladkrutenyuk/three-start (MIT) and adapted to run without three.js: nodes are plain
 * string ids (use entity instance ids to pair with `entityStore`), and the shell binds
 * render-side hooks separately.
 *
 * Lifecycle per behaviour: `onAwake` (once, first activation) → `onEnable` (every
 * inactive→active transition) → `onStart` (once, after the first `onEnable`) →
 * `onUpdate` (per `world.update` while active) → `onDisable` (every active→inactive
 * transition) → `onDestroy` (once, always — even if never activated).
 *
 * `world.start()` bootstraps in passes: modules awake → modules start → modules join
 * update dispatch → ALL behaviours on effectively-active nodes awake (even disabled
 * ones) → enable/start/subscribe. Behaviours attached during the module pass are
 * deferred to the behaviour passes, so module `onUpdate` always dispatches before any
 * behaviour `onUpdate`.
 */

/**
 * Declaration-merging registry games and adapters augment for typed access to
 * world modules:
 *
 * ```ts
 * declare module "@jgengine/core/behaviour/behaviour" {
 *   interface JGEngineRegister {
 *     modules: { physics: PhysicsModule; director: DirectorModule };
 *   }
 * }
 * ```
 */
export interface JGEngineRegister {}

export type RegisterField<TKey extends string, TFallback = unknown> = TKey extends keyof JGEngineRegister
  ? JGEngineRegister[TKey]
  : TFallback;

/** Resolves to the augmented module map when `JGEngineRegister` declares one. */
export type BehaviourModules = RegisterField<"modules", Record<string, BehaviourModule>>;

interface UpdateSubscriber {
  onUpdate(dt: number): void;
}

interface BehaviourNode {
  id: string;
  parent: BehaviourNode | null;
  children: BehaviourNode[];
  activeSelf: boolean;
  behaviours: Behaviour[];
}

interface BehaviourWorldInternal extends BehaviourWorld {
  _subscribeUpdate(subscriber: UpdateSubscriber): void;
  _unsubscribeUpdate(subscriber: UpdateSubscriber): void;
  _isEffectivelyActive(nodeId: string): boolean;
  _detachBehaviour(behaviour: Behaviour): void;
}

/**
 * Subclass and override the lifecycle hooks. A behaviour only joins the per-frame
 * update dispatch if it actually overrides `onUpdate` (prototype-identity check at
 * each activation), so hook-only behaviours cost nothing per frame.
 */
export class Behaviour {
  /** @internal */ _world: BehaviourWorldInternal | null = null;
  /** @internal */ _nodeId: string | null = null;
  /** @internal */ _awoken = false;
  /** @internal */ _startedOnce = false;
  /** @internal */ _isActive = false;
  private _enabled = true;
  private _destroyed = false;

  /** The node this behaviour is attached to; available from `onAwake` onward, never in the constructor. */
  get nodeId(): string {
    if (this._nodeId === null) throw new Error("behaviour is not attached to a node");
    return this._nodeId;
  }

  get world(): BehaviourWorld {
    if (this._world === null) throw new Error("behaviour is not attached to a world");
    return this._world;
  }

  get modules(): BehaviourModules {
    return this.world.modules;
  }

  /** Own enabled flag; effective activity also requires the node's hierarchy to be active. */
  get enabled(): boolean {
    return this._enabled;
  }

  /** Whether the lifecycle is currently in the active span (`onEnable` fired, `onDisable` not yet). */
  get isActive(): boolean {
    return this._isActive;
  }

  onAwake(): void {}
  onEnable(): void {}
  onStart(): void {}
  onUpdate(_dt: number): void {}
  onDisable(): void {}
  onDestroy(): void {}

  enable(): void {
    this.setEnabled(true);
  }

  disable(): void {
    this.setEnabled(false);
  }

  /** Flips the flag only when the node is hierarchy-inactive or the world hasn't started; lifecycle catches up on the next activation. */
  setEnabled(enabled: boolean): void {
    if (this._enabled === enabled) return;
    this._enabled = enabled;
    const world = this._world;
    const nodeId = this._nodeId;
    if (world === null || nodeId === null) return;
    if (!world.started() || !world._isEffectivelyActive(nodeId)) return;
    if (enabled) this._activate();
    else this._deactivate();
  }

  /** Detaches from the node and fires `onDisable` (if active) then `onDestroy`. */
  destroy(): void {
    if (this._world !== null) this._world._detachBehaviour(this);
    this._destroy();
  }

  /** @internal */
  _activate(): void {
    if (this._isActive) return;
    if (this._world === null) return;
    this._isActive = true;
    if (!this._awoken) {
      this._awoken = true;
      this.onAwake();
    }
    this.onEnable();
    if (!this._startedOnce) {
      this._startedOnce = true;
      this.onStart();
    }
    if (this.onUpdate !== Behaviour.prototype.onUpdate) {
      this._world._subscribeUpdate(this);
    }
  }

  /** @internal */
  _deactivate(): void {
    if (!this._isActive) return;
    this._isActive = false;
    this._world?._unsubscribeUpdate(this);
    this.onDisable();
  }

  /** @internal */
  _destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._deactivate();
    this.onDestroy();
    this._world = null;
    this._nodeId = null;
  }
}

/**
 * A world-lifetime service with typed sibling access via `this.modules`. Modules awake
 * and start before any behaviour during `world.start()`, subscribe to update dispatch
 * first (their `onUpdate` fires before every behaviour's), and have no disable/destroy —
 * they live as long as the world.
 */
export class BehaviourModule {
  /** @internal */ _world: BehaviourWorldInternal | null = null;

  get world(): BehaviourWorld {
    if (this._world === null) throw new Error("module is not registered with a world");
    return this._world;
  }

  get modules(): BehaviourModules {
    return this.world.modules;
  }

  onAwake(): void {}
  onStart(): void {}
  onUpdate(_dt: number): void {}

  /** @internal */
  _subscribe(): void {
    if (this._world === null) return;
    if (this.onUpdate !== BehaviourModule.prototype.onUpdate) {
      this._world._subscribeUpdate(this);
    }
  }
}

export interface BehaviourWorld {
  /** Creates the node if missing (parented under `parentId` when given, else a root); reparents an existing node when `parentId` differs. */
  add(id: string, parentId?: string): void;
  has(id: string): boolean;
  parentOf(id: string): string | null;
  childrenOf(id: string): readonly string[];
  /** Moves `id` (and subtree) under `parentId` (`null` = root), firing enable/disable cascades when effective activity changes. Throws on cycles. */
  setParent(id: string, parentId: string | null): void;
  /** Attaches and immediately activates when the world has started, the node is effectively active, and the behaviour is enabled (deferred during bootstrap). */
  attach<T extends Behaviour>(nodeId: string, behaviour: T): T;
  behavioursOf(nodeId: string): readonly Behaviour[];
  /**
   * Sets the node's own flag and cascades activation/deactivation through the subtree,
   * pruning at descendants whose own flag is false — so reactivating a parent restores
   * exactly the per-child stored flags. A flip under an inactive ancestor changes only
   * the flag.
   */
  setActive(id: string, active: boolean): void;
  /** The node's own flag; unknown ids count active. */
  isActiveSelf(id: string): boolean;
  /** Own flag AND every ancestor's; unknown ids count active. */
  isActive(id: string): boolean;
  /** Registers modules by key. Throws on duplicate keys or after `start()`. */
  addModules(modules: Partial<BehaviourModules>): void;
  readonly modules: BehaviourModules;
  /** Bootstraps: modules awake/start/subscribe, then all behaviours on effectively-active nodes awake, then enable+start+subscribe. Idempotent. */
  start(): void;
  started(): boolean;
  /** Dispatches `onUpdate(dt)` to modules then behaviours, over a snapshot — subscribers added mid-dispatch first fire next update. */
  update(dt: number): void;
  /** Destroys every behaviour in the subtree (parent-first) and removes the nodes. */
  destroyNode(id: string): boolean;
  /** Destroys all nodes and behaviours and clears update dispatch. */
  destroy(): void;
}

export function createBehaviourWorld(): BehaviourWorld {
  const nodes = new Map<string, BehaviourNode>();
  const roots: BehaviourNode[] = [];
  const updateSubscribers: UpdateSubscriber[] = [];
  const moduleRecord: Record<string, BehaviourModule> = {};
  let started = false;
  let bootstrapping = false;

  function mustGet(id: string): BehaviourNode {
    const node = nodes.get(id);
    if (node === undefined) throw new Error(`unknown behaviour node "${id}"`);
    return node;
  }

  function ensureNode(id: string, parentId?: string): BehaviourNode {
    const existing = nodes.get(id);
    if (existing !== undefined) {
      if (parentId !== undefined && existing.parent?.id !== parentId) world.setParent(id, parentId);
      return existing;
    }
    const parent = parentId === undefined ? null : ensureNode(parentId);
    const node: BehaviourNode = { id, parent, children: [], activeSelf: true, behaviours: [] };
    nodes.set(id, node);
    if (parent === null) roots.push(node);
    else parent.children.push(node);
    return node;
  }

  function parentChainActive(node: BehaviourNode): boolean {
    let ancestor = node.parent;
    while (ancestor !== null) {
      if (!ancestor.activeSelf) return false;
      ancestor = ancestor.parent;
    }
    return true;
  }

  function isEffectivelyActive(node: BehaviourNode): boolean {
    return node.activeSelf && parentChainActive(node);
  }

  function traverseActiveSelf(node: BehaviourNode, visit: (node: BehaviourNode) => void): void {
    if (!node.activeSelf) return;
    visit(node);
    for (const child of [...node.children]) traverseActiveSelf(child, visit);
  }

  function activateNode(node: BehaviourNode): void {
    if (!started) return;
    if (!isEffectivelyActive(node)) return;
    for (const behaviour of [...node.behaviours]) {
      if (behaviour.enabled) behaviour._activate();
    }
  }

  function deactivateNode(node: BehaviourNode): void {
    for (const behaviour of [...node.behaviours]) {
      if (behaviour._isActive) behaviour._deactivate();
    }
  }

  function deactivateSubtree(node: BehaviourNode): void {
    deactivateNode(node);
    for (const child of [...node.children]) traverseActiveSelf(child, deactivateNode);
  }

  function unlink(node: BehaviourNode): void {
    const siblings = node.parent === null ? roots : node.parent.children;
    const index = siblings.indexOf(node);
    if (index !== -1) siblings.splice(index, 1);
  }

  function collectSubtree(node: BehaviourNode, into: BehaviourNode[]): void {
    into.push(node);
    for (const child of node.children) collectSubtree(child, into);
  }

  const world: BehaviourWorldInternal = {
    add(id, parentId) {
      ensureNode(id, parentId);
    },

    has: (id) => nodes.has(id),

    parentOf: (id) => mustGet(id).parent?.id ?? null,

    childrenOf: (id) => mustGet(id).children.map((child) => child.id),

    setParent(id, parentId) {
      const node = mustGet(id);
      const nextParent = parentId === null ? null : mustGet(parentId);
      if (node.parent === nextParent) return;
      for (let ancestor = nextParent; ancestor !== null; ancestor = ancestor.parent) {
        if (ancestor === node) throw new Error(`cannot parent "${parentId}" under its own descendant "${id}"`);
      }
      const wasEffective = isEffectivelyActive(node);
      unlink(node);
      node.parent = nextParent;
      if (nextParent === null) roots.push(node);
      else nextParent.children.push(node);
      const nowEffective = isEffectivelyActive(node);
      if (!started || wasEffective === nowEffective) return;
      if (nowEffective) traverseActiveSelf(node, activateNode);
      else deactivateSubtree(node);
    },

    attach(nodeId, behaviour) {
      if (behaviour._world !== null) throw new Error("behaviour is already attached");
      const node = ensureNode(nodeId);
      behaviour._world = world;
      behaviour._nodeId = nodeId;
      node.behaviours.push(behaviour);
      if (started && !bootstrapping && behaviour.enabled && isEffectivelyActive(node)) {
        behaviour._activate();
      }
      return behaviour;
    },

    behavioursOf: (nodeId) => [...(nodes.get(nodeId)?.behaviours ?? [])],

    setActive(id, active) {
      const node = ensureNode(id);
      if (node.activeSelf === active) return;
      node.activeSelf = active;
      if (!parentChainActive(node)) return;
      if (active) traverseActiveSelf(node, activateNode);
      else deactivateSubtree(node);
    },

    isActiveSelf: (id) => nodes.get(id)?.activeSelf ?? true,

    isActive(id) {
      const node = nodes.get(id);
      return node === undefined ? true : isEffectivelyActive(node);
    },

    addModules(modules) {
      if (started) throw new Error("cannot add modules after start()");
      for (const [key, module] of Object.entries(modules)) {
        if (module === undefined) continue;
        if (moduleRecord[key] !== undefined) throw new Error(`module "${key}" is already registered`);
        const instance = module as BehaviourModule;
        instance._world = world;
        moduleRecord[key] = instance;
      }
    },

    modules: moduleRecord as BehaviourModules,

    start() {
      if (started) return;
      started = true;
      bootstrapping = true;
      const modules = Object.values(moduleRecord);
      for (const module of modules) module.onAwake();
      for (const module of modules) module.onStart();
      for (const module of modules) module._subscribe();
      bootstrapping = false;
      for (const root of [...roots]) {
        traverseActiveSelf(root, (node) => {
          for (const behaviour of [...node.behaviours]) {
            if (!behaviour._awoken) {
              behaviour._awoken = true;
              behaviour.onAwake();
            }
          }
        });
      }
      for (const root of [...roots]) {
        traverseActiveSelf(root, activateNode);
      }
    },

    started: () => started,

    update(dt) {
      for (const subscriber of [...updateSubscribers]) subscriber.onUpdate(dt);
    },

    destroyNode(id) {
      const node = nodes.get(id);
      if (node === undefined) return false;
      const subtree: BehaviourNode[] = [];
      collectSubtree(node, subtree);
      for (const member of subtree) {
        for (const behaviour of [...member.behaviours]) behaviour._destroy();
        member.behaviours.length = 0;
      }
      unlink(node);
      for (const member of subtree) nodes.delete(member.id);
      return true;
    },

    destroy() {
      for (const root of [...roots]) world.destroyNode(root.id);
      updateSubscribers.length = 0;
    },

    _subscribeUpdate(subscriber) {
      if (!updateSubscribers.includes(subscriber)) updateSubscribers.push(subscriber);
    },

    _unsubscribeUpdate(subscriber) {
      const index = updateSubscribers.indexOf(subscriber);
      if (index !== -1) updateSubscribers.splice(index, 1);
    },

    _isEffectivelyActive: (nodeId) => {
      const node = nodes.get(nodeId);
      return node === undefined ? true : isEffectivelyActive(node);
    },

    _detachBehaviour(behaviour) {
      const nodeId = behaviour._nodeId;
      if (nodeId === null) return;
      const node = nodes.get(nodeId);
      if (node === undefined) return;
      const index = node.behaviours.indexOf(behaviour);
      if (index !== -1) node.behaviours.splice(index, 1);
    },
  };

  return world;
}

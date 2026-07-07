import type { PhysicsWorld } from "./physicsWorld";

export interface StructureMaterial {
  id: string;
  /** Node integrity and edge strength default to this — brittle glass vs load-bearing concrete. */
  strength: number;
  /** Debris body mass when a node of this material collapses. Default 1. */
  mass?: number;
}

export type StructureMaterialTable = Readonly<Record<string, StructureMaterial>>;

export interface StructureNodeSpec {
  id: string;
  /** Body centre in world coordinates — also where its debris spawns. */
  position: readonly [number, number, number];
  halfExtents: readonly [number, number, number];
  /** Overrides material mass for the collapsed debris body. */
  mass?: number;
  /** Hit points before the piece shatters. Default from `material.strength`, else 100. */
  integrity?: number;
  material?: string;
  /** Foundation piece — reachability to any anchor is what keeps the rest standing. */
  anchor?: boolean;
}

export interface StructureEdgeSpec {
  a: string;
  b: string;
  /** Accumulated edge damage past this severs the connection. Default from `material.strength`, else 100. */
  strength?: number;
}

export interface CollapseEvent {
  /**
   * Node ids that left the structure this operation — the shattered node plus every piece the loss
   * disconnected from an anchor. This is the replicated collapse: broadcast the id list, not each
   * fragment's physics (games re-derive the debris locally).
   */
  fell: readonly string[];
  collapsed: boolean;
}

export interface DebrisConfig {
  /** Outward kick magnitude applied to each debris body from `origin`. Default 3. */
  impulse?: number;
  /** Blast origin the kick radiates from. Defaults to each node's own position (straight drop). */
  origin?: readonly [number, number, number];
}

const NO_COLLAPSE: CollapseEvent = { fell: [], collapsed: false };

/**
 * A structural-integrity graph over a building — nodes are pieces (walls, beams, floors), edges are
 * load-bearing connections, some nodes are anchored foundations. `damage`/`damageEdge` wear pieces and
 * connections down; when a piece shatters or an edge severs, the graph recomputes which pieces still
 * reach an anchor and hands back every newly-disconnected piece as one `CollapseEvent`. Feed that to
 * `toDebris` to sink the fallen pieces into a `PhysicsWorld` as rigid bodies ("The Finals" smooth
 * destruction, Rainbow Six walls). Coarse by design: it replicates the collapse event, not per fragment.
 */
export class StructureGraph {
  private readonly nodes = new Map<string, StructureNodeSpec>();
  private readonly integrity = new Map<string, number>();
  private readonly adj = new Map<string, Set<string>>();
  private readonly edgeStrength = new Map<string, number>();
  private readonly edgeDamage = new Map<string, number>();
  private readonly fallenSpecs = new Map<string, StructureNodeSpec>();
  private readonly materials: StructureMaterialTable;

  constructor(config: {
    nodes: readonly StructureNodeSpec[];
    edges: readonly StructureEdgeSpec[];
    materials?: StructureMaterialTable;
  }) {
    this.materials = config.materials ?? {};
    for (const spec of config.nodes) {
      this.nodes.set(spec.id, spec);
      this.integrity.set(spec.id, spec.integrity ?? this.materialStrength(spec.material) ?? 100);
      this.adj.set(spec.id, new Set());
    }
    for (const edge of config.edges) {
      if (!this.nodes.has(edge.a) || !this.nodes.has(edge.b) || edge.a === edge.b) continue;
      this.adj.get(edge.a)!.add(edge.b);
      this.adj.get(edge.b)!.add(edge.a);
      const key = edgeKey(edge.a, edge.b);
      const strength =
        edge.strength ??
        this.materialStrength(this.nodes.get(edge.a)!.material) ??
        this.materialStrength(this.nodes.get(edge.b)!.material) ??
        100;
      this.edgeStrength.set(key, strength);
      this.edgeDamage.set(key, 0);
    }
  }

  private materialStrength(material?: string): number | undefined {
    return material === undefined ? undefined : this.materials[material]?.strength;
  }

  has(id: string): boolean {
    return this.nodes.has(id);
  }

  integrityOf(id: string): number {
    return this.integrity.get(id) ?? 0;
  }

  nodeSpec(id: string): StructureNodeSpec | undefined {
    return this.nodes.get(id);
  }

  neighbors(id: string): string[] {
    const set = this.adj.get(id);
    return set === undefined ? [] : [...set];
  }

  standing(): string[] {
    return [...this.nodes.keys()];
  }

  isSupported(id: string): boolean {
    if (!this.nodes.has(id)) return false;
    return this.supportedSet().has(id);
  }

  private supportedSet(): Set<string> {
    const supported = new Set<string>();
    const queue: string[] = [];
    for (const [id, spec] of this.nodes) {
      if (spec.anchor === true) {
        supported.add(id);
        queue.push(id);
      }
    }
    while (queue.length > 0) {
      const id = queue.pop()!;
      for (const next of this.adj.get(id)!) {
        if (!supported.has(next)) {
          supported.add(next);
          queue.push(next);
        }
      }
    }
    return supported;
  }

  private removeNode(id: string): void {
    const set = this.adj.get(id);
    if (set !== undefined) {
      for (const other of set) {
        this.adj.get(other)?.delete(id);
        const key = edgeKey(id, other);
        this.edgeStrength.delete(key);
        this.edgeDamage.delete(key);
      }
    }
    const spec = this.nodes.get(id);
    if (spec !== undefined) this.fallenSpecs.set(id, spec);
    this.adj.delete(id);
    this.nodes.delete(id);
    this.integrity.delete(id);
  }

  private settle(destroyed: string[]): CollapseEvent {
    const supported = this.supportedSet();
    const fell = [...destroyed];
    for (const id of this.nodes.keys()) {
      if (!supported.has(id)) fell.push(id);
    }
    if (fell.length === 0) return NO_COLLAPSE;
    for (const id of fell) this.removeNode(id);
    return { fell, collapsed: true };
  }

  /** Wear a piece down; at ≤0 integrity it shatters and the loss cascades through unsupported pieces. */
  damage(id: string, amount: number): CollapseEvent {
    if (!this.nodes.has(id)) return NO_COLLAPSE;
    const next = this.integrityOf(id) - amount;
    this.integrity.set(id, next);
    if (next > 0) return NO_COLLAPSE;
    this.removeNode(id);
    return this.settle([id]);
  }

  /** Wear a connection down; past its strength it severs and unsupported pieces cascade off. */
  damageEdge(a: string, b: string, amount: number): CollapseEvent {
    const key = edgeKey(a, b);
    if (!this.edgeStrength.has(key)) return NO_COLLAPSE;
    const dmg = (this.edgeDamage.get(key) ?? 0) + amount;
    if (dmg < this.edgeStrength.get(key)!) {
      this.edgeDamage.set(key, dmg);
      return NO_COLLAPSE;
    }
    return this.severEdge(a, b);
  }

  /** Cut a connection outright (a beam sheared by a blast), then cascade. */
  severEdge(a: string, b: string): CollapseEvent {
    if (!this.adj.get(a)?.has(b)) return NO_COLLAPSE;
    this.adj.get(a)!.delete(b);
    this.adj.get(b)!.delete(a);
    const key = edgeKey(a, b);
    this.edgeStrength.delete(key);
    this.edgeDamage.delete(key);
    return this.settle([]);
  }

  /** Spawn one rigid debris body per fallen piece into `world`; returns the new body indices. */
  toDebris(world: PhysicsWorld, event: CollapseEvent, config: DebrisConfig = {}): number[] {
    const impulse = config.impulse ?? 3;
    const bodies: number[] = [];
    for (const id of event.fell) {
      const spec = this.fallenSpecs.get(id);
      if (spec === undefined) continue;
      const mass = spec.mass ?? this.materials[spec.material ?? ""]?.mass ?? 1;
      const body = world.addBody({ position: spec.position, halfExtents: spec.halfExtents, mass });
      const origin = config.origin ?? spec.position;
      let dx = spec.position[0] - origin[0];
      let dy = spec.position[1] - origin[1];
      let dz = spec.position[2] - origin[2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len > 1e-6) {
        dx /= len;
        dy /= len;
        dz /= len;
      } else {
        dy = 0;
      }
      world.velX[body]! += dx * impulse;
      world.velY[body]! += dy * impulse;
      world.velZ[body]! += dz * impulse;
      bodies.push(body);
    }
    return bodies;
  }
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a} ${b}` : `${b} ${a}`;
}

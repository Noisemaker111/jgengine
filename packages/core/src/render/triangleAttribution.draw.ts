import * as THREE from "three";

/** One line of the triangle table: the draws sharing one geometry inside one named model. */
export interface TriangleLine {
  /** Model ancestor names plus the mesh name, or the material name when nothing is named. */
  label: string;
  /** Triangles one instance submits. */
  perInstance: number;
  /** Instances drawn from this geometry. */
  instances: number;
  /** Draw calls this line costs. */
  draws: number;
  /** `perInstance * instances` - the triangles this line puts in the frame. */
  triangles: number;
}

/** Where one scene's triangles are, biggest line first. */
export interface TriangleAttribution {
  /** Every triangle the scene graph would submit for one camera pass, instances included. */
  triangles: number;
  /** How many of those belong to meshes that cast shadows, so the shadow pass pays them again. */
  casters: number;
  lines: readonly TriangleLine[];
}

function triangleCount(mesh: THREE.Mesh): number {
  if ((mesh as unknown as { isPoints?: boolean }).isPoints === true) return 0;
  if ((mesh as unknown as { isLine?: boolean }).isLine === true) return 0;
  const geometry = mesh.geometry as THREE.BufferGeometry | undefined;
  if (geometry === undefined || geometry === null) return 0;
  const index = geometry.getIndex();
  const position = geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
  const vertices = index !== null ? index.count : position?.count ?? 0;
  return Math.round(vertices / 3);
}

const MAX_LABEL_DEPTH = 3;

function labelOf(mesh: THREE.Mesh): string {
  const names: string[] = [];
  let node: THREE.Object3D | null = mesh;
  for (let depth = 0; node !== null && node !== undefined && depth < MAX_LABEL_DEPTH + 1; depth += 1) {
    if (typeof node.name === "string" && node.name.length > 0) names.push(node.name);
    node = node.parent;
  }
  if (names.length > 0) return names.reverse().join("/");
  const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
  const first = Array.isArray(material) ? material[0] : material;
  return first?.name || first?.type || mesh.type;
}

/**
 * Sum a scene's triangles by model and geometry, which is the attribution a triangle budget needs:
 * a total says a frame is heavy, a table says which authored object made it heavy. Walks the graph
 * once; call it on demand, never per frame.
 * @capability triangle-attribution per-model triangle table with instance counts, for perf probes
 */
export function attributeTriangles(root: THREE.Object3D, limit = 12): TriangleAttribution {
  const lines = new Map<string, TriangleLine>();
  let triangles = 0;
  let casters = 0;
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    const per = triangleCount(mesh);
    if (per === 0) return;
    const instances = (mesh as unknown as { isInstancedMesh?: boolean }).isInstancedMesh === true
      ? Math.max(0, (mesh as THREE.InstancedMesh).count)
      : 1;
    const total = per * instances;
    triangles += total;
    if (mesh.castShadow === true) casters += total;
    const label = labelOf(mesh);
    const key = `${label}#${(mesh.geometry as THREE.BufferGeometry).uuid}`;
    const line = lines.get(key);
    if (line === undefined) lines.set(key, { label, perInstance: per, instances, draws: 1, triangles: total });
    else {
      line.instances += instances;
      line.draws += 1;
      line.triangles += total;
    }
  });
  const sorted = [...lines.values()].sort((a, b) => b.triangles - a.triangles);
  return { triangles, casters, lines: limit > 0 ? sorted.slice(0, limit) : sorted };
}

/**
 * The `render/triangles` probe for one scene: the table, its two headline numbers, and the one-line
 * summary a report prints. Reads the graph on every call, so wrap it in a short cache when a
 * snapshot reads counters and state together.
 * @internal
 */
export function triangleProbe(root: THREE.Object3D): {
  table(): TriangleAttribution;
  counters(): Record<string, number>;
  state(): string;
} {
  const table = () => attributeTriangles(root);
  return {
    table,
    counters: () => {
      const { triangles, casters, lines } = table();
      return { triangles, casters, lines: lines.length };
    },
    state: () => {
      const { triangles, casters, lines } = table();
      const top = lines[0];
      return top === undefined
        ? `${triangles} triangles`
        : `${triangles} triangles · casters ${casters} · top ${top.label} ${top.triangles}`;
    },
  };
}


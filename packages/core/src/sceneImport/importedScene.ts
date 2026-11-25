/**
 * The placement half of an interchange scene folder: `scene.json` beside `meshes/*.obj` and
 * `textures/*.png`, as an outside tool exports it. This file reads and checks `scene.json` and groups
 * its instances into the batches the draw side builds, one per distinct mesh. No three.js here.
 */

/** A material by name: the texture it draws, relative to the scene folder. */
export interface ImportedSceneMaterial {
  texture?: string;
}

/** One placed mesh. */
export interface ImportedSceneInstance {
  /** OBJ file, relative to the scene folder. */
  mesh: string;
  /** The object (`o` or `g`) inside the OBJ file; a file holding one object draws it whatever its name. */
  meshName: string;
  /** Column-major 4x4, mesh-local to world. */
  matrix: readonly number[];
  /** One material name per submesh (`usemtl` run) of the object, in file order. */
  materials: readonly string[];
}

/**
 * Which way the source scene's axes turn. `"left"` (the default) is a Unity-style export: matrices are
 * left-handed and the OBJ files already carry the exporter's X flip, so each matrix is mirrored across
 * X on the way in (`S·M·S`) and the meshes are used as written. `"right"` applies every matrix untouched.
 */
export type ImportedSceneHandedness = "left" | "right";

/** `scene.json`, checked. */
export interface ImportedSceneFile {
  /** Scene centre in source X and Z; the import is placed around it. */
  center: readonly [number, number];
  /** Instances farther than this from `center` (in X and Z) are left out. */
  radius: number;
  materials: Readonly<Record<string, ImportedSceneMaterial>>;
  instances: readonly ImportedSceneInstance[];
  handedness: ImportedSceneHandedness;
}

function fail(path: string, expected: string): never {
  throw new Error(`scene.json: ${path} must be ${expected}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(path, "a finite number");
  return value;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || value === "") fail(path, "a non-empty string");
  return value;
}

/** Check a parsed `scene.json`; the error names the first field that is wrong. */
export function parseImportedSceneFile(value: unknown): ImportedSceneFile {
  if (!isRecord(value)) fail("the file", "an object");
  const center = value["center"];
  if (!Array.isArray(center) || center.length !== 2) fail("center", "[x, z]");
  const radius = value["radius"] === undefined ? Number.POSITIVE_INFINITY : finite(value["radius"], "radius");
  const rawMaterials = value["materials"] ?? {};
  if (!isRecord(rawMaterials)) fail("materials", "an object of material names");
  const materials: Record<string, ImportedSceneMaterial> = {};
  for (const [name, material] of Object.entries(rawMaterials)) {
    if (!isRecord(material)) fail(`materials.${name}`, "an object");
    materials[name] = material["texture"] === undefined ? {} : { texture: text(material["texture"], `materials.${name}.texture`) };
  }
  const rawInstances = value["instances"];
  if (!Array.isArray(rawInstances)) fail("instances", "an array");
  const instances = rawInstances.map((instance: unknown, index): ImportedSceneInstance => {
    const path = `instances[${index}]`;
    if (!isRecord(instance)) fail(path, "an object");
    const matrix = instance["matrix"];
    if (!Array.isArray(matrix) || matrix.length !== 16) fail(`${path}.matrix`, "16 numbers");
    matrix.forEach((entry, at) => finite(entry, `${path}.matrix[${at}]`));
    const names = instance["materials"] ?? [];
    if (!Array.isArray(names)) fail(`${path}.materials`, "an array of material names");
    return {
      mesh: text(instance["mesh"], `${path}.mesh`),
      meshName: typeof instance["meshName"] === "string" ? instance["meshName"] : "",
      matrix: matrix as number[],
      materials: names.map((name, at) => text(name, `${path}.materials[${at}]`)),
    };
  });
  const handedness = value["handedness"] ?? "left";
  if (handedness !== "left" && handedness !== "right") fail("handedness", `"left" or "right"`);
  return { center: [finite(center[0], "center[0]"), finite(center[1], "center[1]")], radius, materials, instances, handedness };
}

/** Every instance of one distinct mesh drawn with one material list, ready to upload. */
export interface ImportedBatchPlan {
  key: string;
  mesh: string;
  meshName: string;
  materials: readonly string[];
  /** The instances' matrices flip triangle winding (a mirrored placement); they draw from a rewound copy. */
  mirrored: boolean;
  /** Column-major matrices, 16 per instance, already converted and relative to {@link ImportedScenePlan.origin}. */
  matrices: Float64Array;
  count: number;
}

/** What a scene folder will draw. */
export interface ImportedScenePlan {
  batches: ImportedBatchPlan[];
  /** Distinct OBJ files. */
  meshFiles: string[];
  /** Distinct texture files the used materials name. */
  textures: string[];
  /** Instances drawn. */
  instances: number;
  /** Instances outside the radius. */
  skipped: number;
  /** Where the scene's own origin sits in the converted world: matrices are stored relative to it so 32-bit instance buffers keep their precision far from zero. */
  origin: readonly [number, number, number];
}

/**
 * Mirror a column-major matrix across X on both sides (`S·M·S`, `S = diag(-1, 1, 1, 1)`): a left-handed
 * placement becomes the right-handed one with the same determinant, so a mesh's winding survives.
 */
export function mirrorMatrixX(matrix: readonly number[], into: Float64Array | number[], offset = 0): void {
  for (let entry = 0; entry < 16; entry += 1) {
    const column = entry >> 2;
    const row = entry & 3;
    into[offset + entry] = (column === 0) !== (row === 0) ? -matrix[entry]! : matrix[entry]!;
  }
}

/** Sign of the upper 3x3 of a column-major matrix: negative when it mirrors. */
function determinant3(m: ArrayLike<number>, offset: number): number {
  const a = m[offset]!, b = m[offset + 4]!, c = m[offset + 8]!;
  const d = m[offset + 1]!, e = m[offset + 5]!, f = m[offset + 9]!;
  const g = m[offset + 2]!, h = m[offset + 6]!, i = m[offset + 10]!;
  return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
}

/**
 * Group a scene's instances into one batch per distinct mesh, material list and winding, convert each
 * matrix to the engine's right-handed frame, and drop instances outside the radius. Matrices stay in
 * 64-bit floats until the upload, relative to the scene centre.
 */
export function planImportedScene(file: ImportedSceneFile): ImportedScenePlan {
  const left = file.handedness === "left";
  const origin: [number, number, number] = [left ? -file.center[0] : file.center[0], 0, file.center[1]];
  const groups = new Map<string, { plan: Omit<ImportedBatchPlan, "matrices" | "count">; offsets: number[] }>();
  const converted = new Float64Array(file.instances.length * 16);
  const meshFiles = new Set<string>();
  const used = new Set<string>();
  let skipped = 0;
  let placed = 0;
  file.instances.forEach((instance) => {
    const dx = instance.matrix[12]! - file.center[0];
    const dz = instance.matrix[14]! - file.center[1];
    if (dx * dx + dz * dz > file.radius * file.radius) {
      skipped += 1;
      return;
    }
    const offset = placed * 16;
    if (left) mirrorMatrixX(instance.matrix, converted, offset);
    else converted.set(instance.matrix, offset);
    converted[offset + 12] = converted[offset + 12]! - origin[0];
    converted[offset + 14] = converted[offset + 14]! - origin[2];
    const mirrored = determinant3(converted, offset) < 0;
    const key = JSON.stringify([instance.mesh, instance.meshName, instance.materials, mirrored]);
    let group = groups.get(key);
    if (group === undefined) {
      group = { plan: { key, mesh: instance.mesh, meshName: instance.meshName, materials: instance.materials, mirrored }, offsets: [] };
      groups.set(key, group);
    }
    group.offsets.push(offset);
    meshFiles.add(instance.mesh);
    for (const name of instance.materials) used.add(name);
    placed += 1;
  });
  const batches = [...groups.values()].map(({ plan, offsets }) => {
    const matrices = new Float64Array(offsets.length * 16);
    offsets.forEach((offset, index) => matrices.set(converted.subarray(offset, offset + 16), index * 16));
    return { ...plan, matrices, count: offsets.length };
  });
  const textures = new Set<string>();
  for (const name of used) {
    const texture = file.materials[name]?.texture;
    if (texture !== undefined) textures.add(texture);
  }
  return { batches, meshFiles: [...meshFiles], textures: [...textures], instances: placed, skipped, origin };
}

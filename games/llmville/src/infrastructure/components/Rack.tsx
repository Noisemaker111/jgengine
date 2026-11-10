import { useMemo, useRef, type RefObject } from "@jgengine/core/ui/jsx";
import { ExtrudeGeometry, Mesh, MeshStandardMaterial, Shape, type Material, type MeshStandardMaterial as MeshStandardMaterialType, type Object3D } from "three";
import { toCreasedNormals } from "three-stdlib";

import { computeRackThermalStateV3, getRackSlotCapacity } from "@llmville/game/infrastructure/infrastructure";
import { SmallGpuRackProcedural } from "@/infrastructure/components/SmallGpuRackProcedural";
import { useRackHardwareDragVisualOptional } from "@/infrastructure/rackHardwareDragVisual";
import { GPU_SPLOT_WORKLOAD, workloadForRackSlot, type GpuSlotWorkload } from "@/infrastructure/computeUnits";
import type { RackInstalledHardwareSlot } from "@llmville/game/infrastructure/infrastructure";
import { getRackCatalogDefinition, resolveRackCatalogId, STARTER_RACK_CATALOG_ID } from "@llmville/game/infrastructure/catalog";
import {
  getRackCoolingUnitDefinition,
  type RackCoolantType,
  type RackCoolingUnitId,
} from "@llmville/game/infrastructure/catalog";
import type { InfrastructureBuildItemId } from "@llmville/game/build/catalog";
import { useFrameTask } from "@jgengine/core/frame/useFrameTask.draw";
import { EngineDrawMount, SceneObjectGroup } from "@jgengine/core/frame/useEngineDraw.draw";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  TorusGeometry,
  type BufferGeometry,
} from "three";

const COOLANT_COLORS: Record<RackCoolantType, string> = {
  air: "#f59e0b",
  water: "#38bdf8",
  ln2: "#a78bfa",
};

const WORKLOAD_COLORS: Record<GpuSlotWorkload, string> = {
  [GPU_SPLOT_WORKLOAD.idle]: "#475569",
  [GPU_SPLOT_WORKLOAD.training]: "#ff007a",
  [GPU_SPLOT_WORKLOAD.scraping]: "#39ff14",
  [GPU_SPLOT_WORKLOAD.serving]: "#00a3ff",
};

function getEmissiveColor(rackType: InfrastructureBuildItemId): string {
  const catalogId = resolveRackCatalogId(rackType);
  if (catalogId?.includes("ln2")) return "#a78bfa";
  if (catalogId?.includes("water")) return "#38bdf8";
  if (catalogId?.includes("server")) return "#5fc2a8";
  if (catalogId?.includes("air")) return "#f59e0b";
  return "#00d4ff";
}

type RackCoolingVisual = "air" | "water" | "ln2" | "hybrid";

interface RackCabinetProfile {
  width: number;
  height: number;
  depth: number;
  bayColumns: number;
  bayRows: number;
  bodyColor: string;
  frameColor: string;
  faceColor: string;
  accentColor: string;
  coolingVisual: RackCoolingVisual;
  coolantTypes: readonly RackCoolantType[];
}

function getRackCabinetProfile(rackType: InfrastructureBuildItemId): RackCabinetProfile {
  const catalogId = resolveRackCatalogId(rackType);
  const coolantTypes = getRackCatalogDefinition(catalogId ?? STARTER_RACK_CATALOG_ID).allowedCoolantTypes;
  if (catalogId === "air_rack_4") {
    return {
      width: 1.06, height: 1.68, depth: 0.88, bayColumns: 2, bayRows: 2,
      bodyColor: "#121718", frameColor: "#2f3b3f", faceColor: "#0a1112", accentColor: "#f59e0b",
      coolingVisual: "air", coolantTypes,
    };
  }
  if (catalogId === "air_rack_6") {
    return {
      width: 1.1, height: 1.86, depth: 0.9, bayColumns: 2, bayRows: 3,
      bodyColor: "#121718", frameColor: "#334047", faceColor: "#0b1217", accentColor: "#f59e0b",
      coolingVisual: "air", coolantTypes,
    };
  }
  if (catalogId === "water_rack_4") {
    return {
      width: 1.08, height: 1.76, depth: 0.94, bayColumns: 2, bayRows: 2,
      bodyColor: "#10191d", frameColor: "#263a44", faceColor: "#071116", accentColor: "#38bdf8",
      coolingVisual: "water", coolantTypes,
    };
  }
  if (catalogId === "server_rack_8_water") {
    return {
      width: 1.16, height: 2.04, depth: 0.96, bayColumns: 2, bayRows: 4,
      bodyColor: "#11181b", frameColor: "#2b3d42", faceColor: "#071012", accentColor: "#38bdf8",
      coolingVisual: "water", coolantTypes,
    };
  }
  if (catalogId === "server_rack_12") {
    return {
      width: 1.2, height: 2.12, depth: 0.98, bayColumns: 3, bayRows: 4,
      bodyColor: "#111719", frameColor: "#303a3f", faceColor: "#080f12", accentColor: "#5fc2a8",
      coolingVisual: "hybrid", coolantTypes,
    };
  }
  if (catalogId === "water_server_rack_12") {
    return {
      width: 1.22, height: 2.18, depth: 1, bayColumns: 3, bayRows: 4,
      bodyColor: "#0e171c", frameColor: "#27414a", faceColor: "#061014", accentColor: "#38bdf8",
      coolingVisual: "water", coolantTypes,
    };
  }
  if (catalogId === "ln2_rack_16") {
    return {
      width: 1.26, height: 2.22, depth: 1.04, bayColumns: 4, bayRows: 4,
      bodyColor: "#111522", frameColor: "#34324f", faceColor: "#090a16", accentColor: "#a78bfa",
      coolingVisual: "ln2", coolantTypes,
    };
  }
  if (catalogId === "medium_server_rack_24") {
    return {
      width: 1.34, height: 2.38, depth: 1.08, bayColumns: 4, bayRows: 6,
      bodyColor: "#101719", frameColor: "#283a3d", faceColor: "#060d0f", accentColor: "#10b981",
      coolingVisual: "hybrid", coolantTypes,
    };
  }

  return {
    width: 1.06, height: 1.72, depth: 0.86, bayColumns: 2, bayRows: 4,
    bodyColor: "#15171d", frameColor: "#30333b", faceColor: "#0d1016", accentColor: "#a855f7",
    coolingVisual: "hybrid", coolantTypes,
  };
}

function isOpenGpuRack(rackType: InfrastructureBuildItemId): boolean {
  return rackType === STARTER_RACK_CATALOG_ID;
}

function getWorkloadLight(workload: GpuSlotWorkload): { color: string; intensity: number } {
  if (workload === GPU_SPLOT_WORKLOAD.training) {
    return { color: WORKLOAD_COLORS[GPU_SPLOT_WORKLOAD.training], intensity: 0.92 };
  }
  if (workload === GPU_SPLOT_WORKLOAD.scraping) {
    return { color: WORKLOAD_COLORS[GPU_SPLOT_WORKLOAD.scraping], intensity: 0.78 };
  }
  if (workload === GPU_SPLOT_WORKLOAD.serving) {
    return { color: WORKLOAD_COLORS[GPU_SPLOT_WORKLOAD.serving], intensity: 0.86 };
  }
  return { color: WORKLOAD_COLORS[GPU_SPLOT_WORKLOAD.idle], intensity: 0 };
}

// ---------------------------------------------------------------------------
// Draw-side builders (drei RoundedBox replicated as ExtrudeGeometry)
// ---------------------------------------------------------------------------

const BOX_BEVEL_EPSILON = 1e-5;

/** drei `<RoundedBox radius smoothness={2}>` as raw geometry: epsilon-arc shape + bevelled extrude. */
function roundedBoxGeometry(width: number, height: number, depth: number, radius: number): BufferGeometry {
  const inner = radius - BOX_BEVEL_EPSILON;
  const shape = new Shape();
  shape.absarc(BOX_BEVEL_EPSILON, BOX_BEVEL_EPSILON, BOX_BEVEL_EPSILON, -Math.PI / 2, -Math.PI, true);
  shape.absarc(BOX_BEVEL_EPSILON, height - inner * 2, BOX_BEVEL_EPSILON, Math.PI, Math.PI / 2, true);
  shape.absarc(width - inner * 2, height - inner * 2, BOX_BEVEL_EPSILON, Math.PI / 2, 0, true);
  shape.absarc(width - inner * 2, BOX_BEVEL_EPSILON, BOX_BEVEL_EPSILON, 0, -Math.PI / 2, true);
  const geometry = new ExtrudeGeometry(shape, {
    depth: depth - radius * 2,
    bevelEnabled: true,
    bevelSegments: 8,
    steps: 1,
    bevelSize: radius - BOX_BEVEL_EPSILON,
    bevelThickness: radius,
    curveSegments: 2,
  });
  geometry.center();
  toCreasedNormals(geometry, 0.4);
  return geometry;
}

function ghostRackMaterial(isValid: boolean): MeshStandardMaterial {
  const ghostColor = isValid ? "#34d399" : "#fb7185";
  return new MeshStandardMaterial({
    color: ghostColor,
    emissive: ghostColor,
    emissiveIntensity: 0.44,
    metalness: 0.58,
    roughness: 0.3,
    transparent: true,
    opacity: 0.42,
  });
}

interface CabinetBoxOptions {
  color: string;
  ghost: boolean;
  isValid: boolean;
  emissive?: string;
  emissiveIntensity?: number;
  metalness?: number;
  roughness?: number;
}

function cabinetMaterial(opts: CabinetBoxOptions): Material {
  if (opts.ghost) return ghostRackMaterial(opts.isValid);
  return new MeshStandardMaterial({
    color: opts.color,
    emissive: opts.emissive ?? opts.color,
    emissiveIntensity: opts.emissiveIntensity ?? 0.025,
    metalness: opts.metalness ?? 0.35,
    roughness: opts.roughness ?? 0.45,
  });
}

function addRoundedBox(
  parent: Object3D,
  args: readonly [number, number, number],
  position: readonly [number, number, number],
  opts: CabinetBoxOptions,
): Mesh {
  const radius = Math.min(0.04, ...args.map((size) => size / 4));
  const mesh = new Mesh(roundedBoxGeometry(args[0], args[1], args[2], radius), cabinetMaterial(opts));
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = !opts.ghost;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addBox(
  parent: Object3D,
  size: readonly [number, number, number],
  material: Material,
  transform?: { position?: readonly [number, number, number]; rotation?: readonly [number, number, number]; castShadow?: boolean; receiveShadow?: boolean },
): Mesh {
  const mesh = new Mesh(new BoxGeometry(size[0], size[1], size[2]), material);
  if (transform?.position !== undefined) mesh.position.set(transform.position[0], transform.position[1], transform.position[2]);
  if (transform?.rotation !== undefined) mesh.rotation.set(transform.rotation[0], transform.rotation[1], transform.rotation[2]);
  if (transform?.castShadow !== undefined) mesh.castShadow = transform.castShadow;
  if (transform?.receiveShadow !== undefined) mesh.receiveShadow = transform.receiveShadow;
  parent.add(mesh);
  return mesh;
}

function addCylinder(
  parent: Object3D,
  args: readonly [number, number, number, number?],
  material: Material,
  transform?: { position?: readonly [number, number, number]; rotation?: readonly [number, number, number]; castShadow?: boolean; receiveShadow?: boolean },
): Mesh {
  const mesh = new Mesh(new CylinderGeometry(args[0], args[1], args[2], args[3] ?? 12), material);
  if (transform?.position !== undefined) mesh.position.set(transform.position[0], transform.position[1], transform.position[2]);
  if (transform?.rotation !== undefined) mesh.rotation.set(transform.rotation[0], transform.rotation[1], transform.rotation[2]);
  if (transform?.castShadow !== undefined) mesh.castShadow = transform.castShadow;
  if (transform?.receiveShadow !== undefined) mesh.receiveShadow = transform.receiveShadow;
  parent.add(mesh);
  return mesh;
}

function buildCabinetFanRotor(parent: Group, radius: number, accent: string, rotation: number): void {
  const rotor = new Group();
  rotor.rotation.z = rotation;
  const ring = new Mesh(new TorusGeometry(radius, radius * 0.1, 8, 28), new MeshStandardMaterial({
    color: "#0b1117", metalness: 0.68, roughness: 0.3, emissive: accent, emissiveIntensity: 0.12,
  }));
  ring.castShadow = true;
  rotor.add(ring);
  const hub = new Mesh(new CylinderGeometry(radius * 0.28, radius * 0.28, 0.026, 18), new MeshStandardMaterial({
    color: "#111827", metalness: 0.72, roughness: 0.28, emissive: accent, emissiveIntensity: 0.18,
  }));
  hub.rotation.x = Math.PI / 2;
  hub.castShadow = true;
  rotor.add(hub);
  const bladeMaterial = new MeshStandardMaterial({
    color: "#1f2937", metalness: 0.58, roughness: 0.32, emissive: accent, emissiveIntensity: 0.1,
  });
  for (const angle of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) {
    const blade = new Mesh(new BoxGeometry(radius * 0.72, radius * 0.16, 0.018), bladeMaterial);
    blade.position.set(Math.cos(angle) * radius * 0.26, Math.sin(angle) * radius * 0.26, 0.018);
    blade.rotation.z = angle;
    blade.castShadow = true;
    rotor.add(blade);
  }
  parent.add(rotor);
}

function trackResources(root: Object3D): { geometries: Set<BufferGeometry>; materials: Set<Material> } {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  root.traverse((child) => {
    const mesh = child as Mesh;
    if (mesh.isMesh) {
      geometries.add(mesh.geometry);
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of list) materials.add(material);
    }
  });
  return { geometries, materials };
}

// ---------------------------------------------------------------------------
// Cabinet sub-builders
// ---------------------------------------------------------------------------

function buildCapabilityMarks(parent: Group, profile: RackCabinetProfile, slotCount: number, rackType: InfrastructureBuildItemId, isValid: boolean): void {
  const faceZ = profile.depth / 2 + 0.09;
  const sideX = profile.width / 2 + 0.035;
  const bandCount = Math.min(6, Math.max(1, Math.ceil(slotCount / 4)));
  const bandWidth = Math.min(0.86, profile.width * 0.62) / bandCount;
  const sidePortY = profile.height * 0.38;
  const tierOffset = resolveRackCatalogId(rackType)?.includes("server") ? 0.04 : 0;

  for (let index = 0; index < bandCount; index++) {
    addRoundedBox(parent, [bandWidth * 0.55, 0.04, 0.035], [
      -((bandCount - 1) * bandWidth) / 2 + index * bandWidth,
      profile.height * 0.47 + tierOffset,
      faceZ + 0.02,
    ], {
      color: profile.accentColor, ghost: false, isValid,
      emissive: profile.accentColor, emissiveIntensity: 0.5, metalness: 0.35, roughness: 0.36,
    });
  }

  profile.coolantTypes.forEach((coolant, index) => {
    const color = COOLANT_COLORS[coolant];
    const port = new Group();
    port.position.set(sideX, sidePortY - index * 0.15, faceZ + 0.005);
    addCylinder(port, [0.043, 0.043, 0.045, 16], new MeshStandardMaterial({
      color, metalness: 0.46, roughness: 0.28, emissive: color, emissiveIntensity: 0.42,
    }), { rotation: [0, 0, Math.PI / 2], castShadow: true });
    addRoundedBox(port, [0.1, 0.018, 0.022], [-0.055, 0, 0], {
      color, ghost: false, isValid, emissive: color, emissiveIntensity: 0.28, metalness: 0.36, roughness: 0.32,
    });
    parent.add(port);
  });
}

function buildThermalHints(parent: Group, profile: RackCabinetProfile, isValid: boolean): void {
  const faceZ = profile.depth / 2 + 0.075;
  const airHintColor = profile.coolingVisual === "air" || profile.coolingVisual === "hybrid" ? "#f59e0b" : "#1e293b";
  const waterHintColor = profile.coolingVisual === "water" || profile.coolingVisual === "hybrid" ? "#38bdf8" : profile.frameColor;

  if (profile.coolingVisual === "air") {
    [-0.22, 0.22].forEach((x, index) => {
      addCylinder(parent, [0.06, 0.06, 0.012, 20], new MeshStandardMaterial({
        color: "#1e293b", metalness: 0.6, roughness: 0.4, emissive: airHintColor, emissiveIntensity: 0.08,
      }), {
        position: [x, -profile.height * 0.28, faceZ],
        rotation: [Math.PI / 2, 0, index * 0.6],
        castShadow: true,
      });
    });
    return;
  }

  if (profile.coolingVisual === "water") {
    for (const x of [-profile.width / 2 - 0.018, profile.width / 2 + 0.018]) {
      addRoundedBox(parent, [0.035, profile.height * 0.5, 0.035], [x, 0.03, faceZ], {
        color: waterHintColor, ghost: false, isValid,
        emissive: waterHintColor, emissiveIntensity: 0.15, metalness: 0.4, roughness: 0.34,
      });
    }
    return;
  }

  if (profile.coolingVisual === "ln2") {
    addRoundedBox(parent, [profile.width * 0.66, 0.036, 0.03], [0, profile.height * 0.42, faceZ + 0.012], {
      color: profile.accentColor, ghost: false, isValid,
      emissive: profile.accentColor, emissiveIntensity: 0.38, metalness: 0.25, roughness: 0.28,
    });
    return;
  }

  const hints: readonly { x: number; color: string }[] = [
    { x: -profile.width / 2 - 0.018, color: "#38bdf8" },
    { x: profile.width / 2 + 0.018, color: "#f59e0b" },
  ];
  for (const hint of hints) {
    addRoundedBox(parent, [0.032, profile.height * 0.52, 0.032], [hint.x, 0.02, faceZ], {
      color: hint.color, ghost: false, isValid,
      emissive: hint.color, emissiveIntensity: hint.color === "#38bdf8" ? 0.16 : 0.14,
      metalness: 0.4, roughness: hint.color === "#38bdf8" ? 0.3 : 0.32,
    });
  }
}

function buildInstalledCoolingModule(parent: Group, profile: RackCabinetProfile, installedCoolerId: RackCoolingUnitId | null | undefined, isValid: boolean): void {
  if (!installedCoolerId) return;
  const cooler = getRackCoolingUnitDefinition(installedCoolerId);
  const faceZ = profile.depth / 2 + 0.12;
  const sideX = profile.width / 2 + 0.055;
  const accent = COOLANT_COLORS[cooler.coolantType];

  if (cooler.coolantType === "air") {
    const fanCount = cooler.capacityKw >= 5 ? 4 : cooler.capacityKw >= 2.5 ? 3 : 2;
    const fanSpacing = (profile.width * 0.56) / Math.max(1, fanCount - 1);
    addRoundedBox(parent, [profile.width * 0.72, 0.34, 0.055], [0, -profile.height * 0.34, faceZ], {
      color: "#172027", ghost: false, isValid, emissive: accent, emissiveIntensity: 0.1, metalness: 0.54, roughness: 0.34,
    });
    for (let index = 0; index < fanCount; index++) {
      const fan = new Group();
      fan.position.set(
        -((fanCount - 1) * fanSpacing) / 2 + index * fanSpacing,
        -profile.height * 0.34,
        faceZ + 0.035,
      );
      buildCabinetFanRotor(fan, 0.09, accent, index * 0.72);
      parent.add(fan);
    }
    return;
  }

  if (cooler.coolantType === "water") {
    const pipeXs = [-sideX, -sideX + 0.12, sideX - 0.12, sideX];
    const pipeMaterial = new MeshStandardMaterial({ color: accent, metalness: 0.46, roughness: 0.24, emissive: accent, emissiveIntensity: 0.5 });
    for (const x of pipeXs) {
      addCylinder(parent, [0.028, 0.028, profile.height * 0.78, 18], pipeMaterial, {
        position: [x, 0.02, faceZ + 0.005], castShadow: true,
      });
    }
    const crossMaterial = new MeshStandardMaterial({ color: accent, metalness: 0.46, roughness: 0.24, emissive: accent, emissiveIntensity: 0.44 });
    for (const y of [profile.height * 0.42, -profile.height * 0.42]) {
      addCylinder(parent, [0.028, 0.028, profile.width * 1.05, 18], crossMaterial, {
        position: [0, y, faceZ + 0.005], rotation: [0, 0, Math.PI / 2], castShadow: true,
      });
    }
    addRoundedBox(parent, [profile.width * 0.58, 0.18, 0.085], [0, -profile.height * 0.51, faceZ + 0.035], {
      color: "#0e7490", ghost: false, isValid, emissive: accent, emissiveIntensity: 0.55, metalness: 0.48, roughness: 0.28,
    });
    for (const x of [-0.18, 0, 0.18]) {
      addRoundedBox(parent, [0.035, 0.16, 0.095], [x, -profile.height * 0.51, faceZ + 0.075], {
        color: "#bae6fd", ghost: false, isValid, emissive: accent, emissiveIntensity: 0.16, metalness: 0.36, roughness: 0.32,
      });
    }
    return;
  }

  // ln2
  addBox(parent, [profile.width * 0.92, profile.height * 0.8, 0.075], new MeshStandardMaterial({
    color: "#dbeafe", emissive: accent, emissiveIntensity: 0.16, metalness: 0.24, roughness: 0.18,
    transparent: true, opacity: 0.42,
  }), { position: [0, 0, faceZ + 0.015], castShadow: true, receiveShadow: true });
  for (const x of [-profile.width * 0.52, profile.width * 0.52]) {
    addRoundedBox(parent, [0.075, profile.height * 0.86, 0.14], [x, 0, faceZ - 0.005], {
      color: "#bfdbfe", ghost: false, isValid, emissive: accent, emissiveIntensity: 0.24, metalness: 0.34, roughness: 0.2,
    });
  }
  addRoundedBox(parent, [profile.width * 1.0, 0.07, 0.15], [0, profile.height * 0.44, faceZ - 0.005], {
    color: accent, ghost: false, isValid, emissive: accent, emissiveIntensity: 0.85, metalness: 0.28, roughness: 0.26,
  });
  addRoundedBox(parent, [profile.width * 1.0, 0.07, 0.15], [0, -profile.height * 0.44, faceZ - 0.005], {
    color: accent, ghost: false, isValid, emissive: accent, emissiveIntensity: 0.55, metalness: 0.28, roughness: 0.26,
  });
  for (const x of [-0.36, 0, 0.36]) {
    addCylinder(parent, [0.045, 0.045, 0.07, 18], new MeshStandardMaterial({
      color: "#e0f2fe", metalness: 0.44, roughness: 0.22, emissive: accent, emissiveIntensity: 0.28,
    }), { position: [x, -profile.height * 0.52, faceZ + 0.06], castShadow: true });
  }
}

interface BayVisual {
  slotIndex: number;
  material: MeshStandardMaterial;
  occupied: boolean;
  lastWorkload: GpuSlotWorkload | null;
}

function rackCabinetDraw(
  getProps: () => {
    rackId: string;
    slotWorkloadMap: ReadonlyMap<string, GpuSlotWorkload> | undefined;
  },
  build: {
    rackType: InfrastructureBuildItemId;
    slotCount: number;
    installedSlots: readonly (RackInstalledHardwareSlot | null)[];
    installedCoolerId: RackCoolingUnitId | null | undefined;
    ghost: boolean;
    isValid: boolean;
    lightRef: RefObject<MeshStandardMaterialType | null>;
  },
): EngineDraw {
  const { rackType, slotCount, installedSlots, installedCoolerId, ghost, isValid, lightRef } = build;
  const profile = getRackCabinetProfile(rackType);
  const bayWidth = (profile.width * 0.68) / profile.bayColumns;
  const bayHeight = (profile.height * 0.62) / profile.bayRows;
  const firstBayX = -((profile.bayColumns - 1) * bayWidth) / 2;
  const firstBayY = profile.height * 0.28;
  const visualSlotCount = Math.min(slotCount, profile.bayColumns * profile.bayRows);

  const root = new Group();
  const boxOpts = { ghost, isValid } as const;

  addRoundedBox(root, [profile.width, profile.height, profile.depth], [0, 0, 0], {
    ...boxOpts, color: profile.bodyColor, metalness: 0.48, roughness: 0.38,
  });
  addRoundedBox(root, [profile.width * 0.88, profile.height * 0.86, 0.04], [0, 0.02, profile.depth / 2 + 0.03], {
    ...boxOpts, color: profile.faceColor, metalness: 0.24, roughness: 0.58,
  });
  for (const x of [-profile.width / 2 + 0.06, profile.width / 2 - 0.06]) {
    addRoundedBox(root, [0.07, profile.height * 0.96, 0.08], [x, 0, profile.depth / 2 + 0.06], {
      ...boxOpts, color: profile.frameColor, metalness: 0.65, roughness: 0.32,
    });
  }

  // Accent strip — its material is handed to the parent via lightRef.
  const stripMaterial = new MeshStandardMaterial({
    color: profile.accentColor,
    emissive: profile.accentColor,
    emissiveIntensity: 1.4,
    metalness: 0.42,
    roughness: 0.32,
  });
  if (ghost) {
    // Ghost mode: the strip renders the shared ghost material instead.
    stripMaterial.dispose();
  }
  const stripMesh = new Mesh(
    roundedBoxGeometry(profile.width * 0.58, 0.045, 0.045, Math.min(0.04, 0.045 / 4)),
    ghost ? ghostRackMaterial(isValid) : stripMaterial,
  );
  stripMesh.position.set(0, -profile.height * 0.43, profile.depth / 2 + 0.075);
  stripMesh.castShadow = !ghost;
  stripMesh.receiveShadow = true;
  root.add(stripMesh);
  if (!ghost) lightRef.current = stripMaterial;

  if (!ghost) {
    buildCapabilityMarks(root, profile, slotCount, rackType, isValid);
    buildThermalHints(root, profile, isValid);
    buildInstalledCoolingModule(root, profile, installedCoolerId, isValid);
  }

  const bays: BayVisual[] = [];
  for (let slotIndex = 0; slotIndex < visualSlotCount; slotIndex++) {
    const column = slotIndex % profile.bayColumns;
    const row = Math.floor(slotIndex / profile.bayColumns);
    const hardwareId = installedSlots[slotIndex] ?? null;
    const occupied = hardwareId !== null || ghost;

    const bayMaterial = new MeshStandardMaterial({
      color: occupied ? "#283136" : "#283136",
      emissive: "#000000",
      emissiveIntensity: 0,
      metalness: 0.2,
      roughness: 0.42,
    });
    const bay = new Mesh(
      roundedBoxGeometry(bayWidth * 0.78, bayHeight * 0.56, 0.04, Math.min(0.04, 0.04 / 4)),
      bayMaterial,
    );
    bay.position.set(firstBayX + column * bayWidth, firstBayY - row * bayHeight, profile.depth / 2 + 0.072);
    bay.castShadow = !ghost;
    bay.receiveShadow = true;
    root.add(bay);
    bays.push({ slotIndex, material: bayMaterial, occupied, lastWorkload: null });
  }

  for (const [index, x] of [-0.25, 0, 0.25].entries()) {
    const fan = new Group();
    fan.position.set(x, -profile.height * 0.28, profile.depth / 2 + 0.075);
    if (ghost) {
      const mesh = new Mesh(new CylinderGeometry(0.075, 0.075, 0.018, 24), ghostRackMaterial(isValid));
      mesh.rotation.x = Math.PI / 2;
      mesh.rotation.z = index * 0.35;
      fan.add(mesh);
    } else {
      buildCabinetFanRotor(fan, 0.075, profile.accentColor, index * 0.35);
    }
    root.add(fan);
  }

  const { geometries, materials } = trackResources(root);

  return {
    mount(state: EngineFrameState) {
      state.scene.add(root);
    },
    frame(_state: EngineFrameState) {
      if (ghost) return;
      const props = getProps();
      for (const bay of bays) {
        const hardwareId = installedSlots[bay.slotIndex] ?? null;
        const workload = workloadForRackSlot(props.slotWorkloadMap, props.rackId, bay.slotIndex, hardwareId);
        if (workload === bay.lastWorkload) continue;
        bay.lastWorkload = workload;
        const light = getWorkloadLight(workload);
        if (bay.occupied) {
          bay.material.color.set(light.color);
          bay.material.emissive.set(light.color);
          bay.material.emissiveIntensity = light.intensity + 0.2;
        }
      }
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(root);
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      if (lightRef.current === stripMaterial) lightRef.current = null;
    },
  };
}

function RackCabinetProcedural(props: {
  rackId: string;
  rackType: InfrastructureBuildItemId;
  slotCount: number;
  installedSlots: readonly RackInstalledHardwareSlot[];
  installedCoolerId: RackCoolingUnitId | null | undefined;
  slotWorkloadMap: ReadonlyMap<string, GpuSlotWorkload> | undefined;
  ghost: boolean;
  isValid: boolean;
  lightRef: RefObject<MeshStandardMaterialType | null>;
}) {
  const latest = useRef(props);
  latest.current = props;
  const installedKey = props.installedSlots.map((slot) => slot ?? "-").join(",");
  return (
    <EngineDrawMount
      create={() =>
        rackCabinetDraw(
          () => ({ rackId: latest.current.rackId, slotWorkloadMap: latest.current.slotWorkloadMap }),
          {
            rackType: props.rackType,
            slotCount: props.slotCount,
            installedSlots: props.installedSlots,
            installedCoolerId: props.installedCoolerId,
            ghost: props.ghost,
            isValid: props.isValid,
            lightRef: props.lightRef,
          },
        )
      }
      deps={[props.rackType, props.slotCount, installedKey, props.installedCoolerId ?? null, props.ghost, props.isValid]}
    />
  );
}

interface RackProps {
  rackId?: string;
  rackType: InfrastructureBuildItemId;
  x: number;
  z: number;
  rotationY: number;
  ghost?: boolean;
  isValid?: boolean;
  installedHardwareSlots?: readonly RackInstalledHardwareSlot[] | undefined;
  installedCoolerId?: RackCoolingUnitId | null | undefined;
  slotWorkloadMap?: ReadonlyMap<string, GpuSlotWorkload> | undefined;
}

export default function Rack({
  rackId,
  rackType,
  x,
  z,
  rotationY,
  ghost = false,
  isValid = true,
  installedHardwareSlots,
  installedCoolerId,
  slotWorkloadMap,
}: RackProps) {
  const lightRef = useRef<MeshStandardMaterialType>(null);
  const emissiveColor = getEmissiveColor(rackType);
  const elapsedRef = useRef(0);
  const dragVisual = useRackHardwareDragVisualOptional();
  const slotCount = getRackSlotCapacity(rackType);
  const slots =
    installedHardwareSlots ?? (Array.from({ length: slotCount }, () => null) as RackInstalledHardwareSlot[]);
  const extractSlotIndex =
    !ghost && rackId !== undefined && dragVisual?.drag?.rackId === rackId ? dragVisual.drag.slotIndex : null;
  const workloads = slots.map((hardwareId, slotIndex) => workloadForRackSlot(slotWorkloadMap, rackId ?? "", slotIndex, hardwareId));
  const working = workloads.some((workload) => workload !== "idle");
  const overheated = useMemo(() => working && computeRackThermalStateV3({ id: rackId ?? "preview", rackType, installedHardwareModuleIds: installedHardwareSlots ?? [], installedCoolerId }, { isComputeActive: working }).rackThrottle < 1,
  [working, rackId, rackType, installedHardwareSlots, installedCoolerId]);
  const activityColor = overheated ? "#e8836b" : workloads.includes("training") ? "#e0a95c" : workloads.includes("serving") ? "#5fc2a8" : workloads.includes("scraping") ? "#8db6de" : "#718078";

  useFrameTask(function rackAnimation(_state, delta) {
    if (ghost) return;
    elapsedRef.current += delta;
    if (lightRef.current) {
      const pulse = working ? 0.8 + Math.sin(elapsedRef.current * (workloads.includes("training") ? 3 : 1.5)) * 0.25 : 0.12;
      lightRef.current.emissive.set(activityColor);
      lightRef.current.emissiveIntensity = pulse;
    }
  });

  const rackBaseY = isOpenGpuRack(rackType) ? 0.6 : getRackCabinetProfile(rackType).height / 2;

  return (
    <SceneObjectGroup position={[x, rackBaseY, z]} rotationY={rotationY}>
      {isOpenGpuRack(rackType) ? (
        <SmallGpuRackProcedural
          rackId={rackId ?? "preview"}
          slotCount={slotCount}
          installedSlots={slots}
          slotWorkloadMap={ghost ? undefined : slotWorkloadMap}
          extractSlotIndex={extractSlotIndex}
          ghost={ghost}
          isValid={isValid}
          emissiveColor={emissiveColor}
          installedCoolerId={installedCoolerId}
          lightRef={lightRef}
        />
      ) : (
        <RackCabinetProcedural
          rackId={rackId ?? "preview"}
          rackType={rackType}
          slotCount={slotCount}
          installedSlots={slots}
          installedCoolerId={installedCoolerId}
          slotWorkloadMap={ghost ? undefined : slotWorkloadMap}
          ghost={ghost}
          isValid={isValid}
          lightRef={lightRef}
        />
      )}
    </SceneObjectGroup>
  );
}

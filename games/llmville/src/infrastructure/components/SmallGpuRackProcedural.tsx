/** @jsxImportSource @jgengine/core/ui/jsx */
import { useRef, type RefObject } from "@jgengine/core/ui/jsx";
import {
  BoxGeometry,
  type BufferGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  QuadraticBezierCurve3,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  type Material,
  type MeshStandardMaterial as MeshStandardMaterialType,
  type Object3D,
} from "three";

import type { HardwareModelId } from "@llmville/game/infrastructure/catalog";
import { GPU_SPLOT_WORKLOAD, workloadForRackSlot, type GpuSlotWorkload } from "@/infrastructure/computeUnits";
import {
  getRackCoolingUnitDefinition,
  type RackCoolantType,
  type RackCoolingUnitId,
} from "@llmville/game/infrastructure/catalog";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";

type SmallGpuRackProceduralProps = {
  rackId: string;
  slotCount: number;
  installedSlots: readonly (HardwareModelId | null)[];
  slotWorkloadMap: ReadonlyMap<string, GpuSlotWorkload> | undefined;
  extractSlotIndex: number | null;
  ghost: boolean;
  isValid: boolean;
  emissiveColor: string;
  installedCoolerId?: RackCoolingUnitId | null | undefined;
  lightRef: RefObject<MeshStandardMaterialType | null>;
};

const FRAME = "#141414";
const FRAME_POST_OFFSETS: readonly (readonly [number, number])[] = [
  [-0.38, -0.38],
  [0.38, -0.38],
  [-0.38, 0.38],
  [0.38, 0.38],
];
const FRAME_METAL = 0.84;
const FRAME_ROUGH = 0.26;
const PSU_COLOR = "#0a0a0a";
const GPU_DARK = "#64748b";
const RISER = "#2563eb";
const FAN_FRAME = "#0f172a";
const FAN_BLADE = "#991b1b";
const CABLE = "#0f172a";

const COOLANT_COLORS: Record<RackCoolantType, string> = {
  air: "#f59e0b",
  water: "#38bdf8",
  ln2: "#a78bfa",
};

const GPU_Y = 0.17;
const TRAY_TOP_Y = -0.08 + 0.0125;
const FAN_PLATE_Z = 0.404;
const FAN_CENTER_Z = 0.418;

const RAILS: readonly { pos: readonly [number, number, number]; size: readonly [number, number, number] }[] = [
  { pos: [0, -0.45, -0.38], size: [0.82, 0.035, 0.035] },
  { pos: [0, -0.45, 0.38], size: [0.82, 0.035, 0.035] },
  { pos: [-0.38, -0.45, 0], size: [0.035, 0.035, 0.76] },
  { pos: [0.38, -0.45, 0], size: [0.035, 0.035, 0.76] },
  { pos: [0, 0.45, -0.38], size: [0.82, 0.035, 0.035] },
  { pos: [0, 0.45, 0.38], size: [0.82, 0.035, 0.035] },
  { pos: [-0.38, 0.45, 0], size: [0.035, 0.035, 0.76] },
  { pos: [0.38, 0.45, 0], size: [0.035, 0.035, 0.76] },
];

function slotXsForCount(slotCount: number): number[] {
  if (slotCount < 1) return [];
  const span = Math.min(0.76, Math.max(0.34, 0.09 * slotCount + 0.07 * Math.max(0, slotCount - 1)));
  if (slotCount === 1) return [0];
  const half = span / 2;
  return Array.from({ length: slotCount }, (_, i) => -half + (i / (slotCount - 1)) * span);
}

function gpuWorkloadBase(workload: GpuSlotWorkload): { color: string; emissive: string; intensity: number } {
  if (workload === GPU_SPLOT_WORKLOAD.idle) {
    return { color: "#1f2937", emissive: GPU_DARK, intensity: 0.04 };
  }
  const emissive =
    workload === GPU_SPLOT_WORKLOAD.training ? "#ff007a"
    : workload === GPU_SPLOT_WORKLOAD.scraping ? "#39ff14"
    : "#00a3ff";
  return {
    color: emissive,
    emissive,
    intensity:
      workload === GPU_SPLOT_WORKLOAD.training ? 0.74
      : workload === GPU_SPLOT_WORKLOAD.scraping ? 0.62
      : 0.68,
  };
}

function track(object: Object3D, geometries: Set<BufferGeometry>, materials: Set<Material>): void {
  object.traverse((child) => {
    const mesh = child as Mesh;
    if (mesh.isMesh) {
      geometries.add(mesh.geometry);
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of list) materials.add(material);
    }
  });
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

function buildFanRotor(parent: Group, radius: number, accent: string, rotation: number): void {
  const rotor = new Group();
  rotor.rotation.z = rotation;
  const ringMaterial = new MeshStandardMaterial({
    color: "#0b1117",
    metalness: 0.68,
    roughness: 0.3,
    emissive: accent,
    emissiveIntensity: 0.12,
  });
  const hubMaterial = new MeshStandardMaterial({
    color: "#111827",
    metalness: 0.72,
    roughness: 0.28,
    emissive: accent,
    emissiveIntensity: 0.16,
  });
  const bladeMaterial = new MeshStandardMaterial({
    color: "#1f2937",
    metalness: 0.58,
    roughness: 0.32,
    emissive: accent,
    emissiveIntensity: 0.1,
  });
  const ring = new Mesh(new TorusGeometry(radius, radius * 0.1, 8, 24), ringMaterial);
  ring.castShadow = true;
  rotor.add(ring);
  const hub = new Mesh(new CylinderGeometry(radius * 0.28, radius * 0.28, 0.022, 18), hubMaterial);
  hub.rotation.x = Math.PI / 2;
  hub.castShadow = true;
  rotor.add(hub);
  for (const angle of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) {
    const blade = new Mesh(new BoxGeometry(radius * 0.7, radius * 0.15, 0.014), bladeMaterial);
    blade.position.set(Math.cos(angle) * radius * 0.24, Math.sin(angle) * radius * 0.24, 0.016);
    blade.rotation.z = angle;
    blade.castShadow = true;
    rotor.add(blade);
  }
  parent.add(rotor);
}

function buildPowerCable(parent: Group, gpuX: number, ghost: boolean, isValid: boolean, gmat: MeshStandardMaterial): void {
  const start = new Vector3(gpuX, GPU_Y + 0.22, 0.14);
  const end = new Vector3(gpuX * 0.35, -0.26, -0.14);
  const mid = new Vector3(gpuX * 0.55, 0.02, -0.02);
  const curve = new QuadraticBezierCurve3(start, mid, end);
  const geometry = new TubeGeometry(curve, 14, 0.014, 6, false);
  const material = ghost
    ? gmat
    : new MeshStandardMaterial({ color: CABLE, metalness: 0.2, roughness: 0.88 });
  const mesh = new Mesh(geometry, material);
  mesh.castShadow = !ghost;
  parent.add(mesh);
}

function buildCoolingModule(parent: Group, coolerId: RackCoolingUnitId | null | undefined, ghost: boolean): void {
  if (ghost || !coolerId) return;
  const cooler = getRackCoolingUnitDefinition(coolerId);
  const accent = COOLANT_COLORS[cooler.coolantType];

  if (cooler.coolantType === "air") {
    const module = new Group();
    module.position.set(0, -0.12, 0.51);
    addBox(module, [0.62, 0.28, 0.055], new MeshStandardMaterial({
      color: "#172027", metalness: 0.64, roughness: 0.34, emissive: accent, emissiveIntensity: 0.08,
    }), { castShadow: true, receiveShadow: true });
    const fanCount = cooler.capacityKw >= 5 ? 3 : 2;
    for (let index = 0; index < fanCount; index++) {
      const fan = new Group();
      fan.position.set(index === 0 ? -0.16 : fanCount === 2 ? 0.16 : (index - 1) * 0.16, 0, 0.042);
      buildFanRotor(fan, 0.078, accent, index * 0.7);
      module.add(fan);
    }
    parent.add(module);
    return;
  }

  if (cooler.coolantType === "water") {
    const module = new Group();
    module.position.set(0.49, -0.02, 0.08);
    const pipeMaterial = new MeshStandardMaterial({ color: accent, metalness: 0.5, roughness: 0.24, emissive: accent, emissiveIntensity: 0.46 });
    for (const z of [-0.05, 0.05]) {
      addCylinder(module, [0.022, 0.022, 0.72, 18], pipeMaterial, {
        position: [0, 0, z], castShadow: true, receiveShadow: true,
      });
    }
    const crossMaterial = new MeshStandardMaterial({ color: accent, metalness: 0.5, roughness: 0.24, emissive: accent, emissiveIntensity: 0.42 });
    for (const y of [0.36, -0.36]) {
      addCylinder(module, [0.022, 0.022, 0.16, 18], crossMaterial, {
        position: [0, y, 0], rotation: [Math.PI / 2, 0, 0], castShadow: true,
      });
    }
    addBox(module, [0.14, 0.12, 0.28], new MeshStandardMaterial({ color: "#0e7490", metalness: 0.5, roughness: 0.3, emissive: accent, emissiveIntensity: 0.36 }), {
      position: [0, -0.4, 0], castShadow: true,
    });
    addBox(module, [0.025, 0.16, 0.28], new MeshStandardMaterial({ color: "#bae6fd", metalness: 0.36, roughness: 0.34, emissive: accent, emissiveIntensity: 0.16 }), {
      position: [-0.02, -0.4, 0], castShadow: true,
    });
    parent.add(module);
    return;
  }

  // ln2
  const module = new Group();
  module.position.set(0, 0, 0.02);
  addBox(module, [0.84, 0.88, 0.07], new MeshStandardMaterial({
    color: "#dbeafe", metalness: 0.22, roughness: 0.18, emissive: accent, emissiveIntensity: 0.16,
    transparent: true, opacity: 0.42,
  }), { position: [0, 0, 0.47], castShadow: true, receiveShadow: true });
  const sideMaterial = new MeshStandardMaterial({ color: "#bfdbfe", metalness: 0.34, roughness: 0.2, emissive: accent, emissiveIntensity: 0.24 });
  for (const x of [-0.45, 0.45]) {
    addBox(module, [0.06, 0.96, 0.46], sideMaterial, { position: [x, 0, 0.19], castShadow: true, receiveShadow: true });
  }
  const bandMaterial = new MeshStandardMaterial({ color: accent, metalness: 0.3, roughness: 0.24, emissive: accent, emissiveIntensity: 0.5 });
  for (const y of [0.5, -0.5]) {
    addBox(module, [0.9, 0.06, 0.46], bandMaterial, { position: [0, y, 0.19], castShadow: true, receiveShadow: true });
  }
  addBox(module, [0.48, 0.04, 0.06], new MeshStandardMaterial({ color: "#e0f2fe", metalness: 0.44, roughness: 0.22, emissive: accent, emissiveIntensity: 0.32 }), {
    position: [0, -0.58, 0.47], castShadow: true,
  });
  parent.add(module);
}

interface SlotVisual {
  index: number;
  group: Group;
  extract: number;
  hardwareId: HardwareModelId | null;
  gpuMaterial: MeshStandardMaterial | null;
  lastWorkload: GpuSlotWorkload | null;
}

function smallGpuRackDraw(
  getProps: () => SmallGpuRackProceduralProps,
  build: {
    slotCount: number;
    installedSlots: readonly (HardwareModelId | null)[];
    ghost: boolean;
    isValid: boolean;
    installedCoolerId: RackCoolingUnitId | null | undefined;
    emissiveColor: string;
    lightRef: RefObject<MeshStandardMaterialType | null>;
  },
): EngineDraw {
  const { slotCount, installedSlots, ghost, isValid, installedCoolerId, emissiveColor, lightRef } = build;
  const root = new Group();
  const gmat = new MeshStandardMaterial({
    color: isValid ? "#34d399" : "#fb7185",
    emissive: isValid ? "#34d399" : "#fb7185",
    emissiveIntensity: 0.45,
    metalness: 0.65,
    roughness: 0.25,
    transparent: true,
    opacity: 0.45,
  });
  const frameMaterial = ghost ? gmat : new MeshStandardMaterial({ color: FRAME, metalness: FRAME_METAL, roughness: FRAME_ROUGH });

  const slotXs = slotXsForCount(slotCount);
  const paddedSlots: (HardwareModelId | null)[] = [];
  for (let i = 0; i < slotCount; i++) paddedSlots.push(installedSlots[i] ?? null);

  const maxAbsX = slotXs.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
  const fanPlateW = Math.min(0.92, maxAbsX * 2 + 0.14);
  const trayW = Math.min(0.82, maxAbsX * 2 + 0.12);

  // Frame posts, rails, struts, tray, PSU, fan plate.
  for (const [px, pz] of FRAME_POST_OFFSETS) {
    addBox(root, [0.045, 0.95, 0.045], frameMaterial, {
      position: [px, 0, pz], castShadow: !ghost, receiveShadow: true,
    });
  }
  for (const rail of RAILS) {
    addBox(root, rail.size, frameMaterial, {
      position: rail.pos, castShadow: !ghost, receiveShadow: true,
    });
  }
  for (const sx of [-0.38, 0.38]) {
    addBox(root, [0.04, 0.55, 0.024], ghost ? gmat : frameMaterial, {
      position: [sx, 0.02, 0.395], castShadow: !ghost, receiveShadow: !ghost,
    });
  }
  addBox(root, [trayW, 0.025, 0.55], ghost
    ? (gmat)
    : new MeshStandardMaterial({ color: "#14532d", metalness: 0.35, roughness: 0.65 }), {
    position: [0, -0.08, 0.05], castShadow: !ghost, receiveShadow: true,
  });
  addBox(root, [0.52, 0.14, 0.38], ghost
    ? (gmat)
    : new MeshStandardMaterial({ color: PSU_COLOR, metalness: 0.55, roughness: 0.42 }), {
    position: [0, -0.32, -0.12], castShadow: !ghost, receiveShadow: true,
  });
  addBox(root, [fanPlateW, 0.2, 0.022], ghost
    ? (gmat)
    : new MeshStandardMaterial({ color: FAN_FRAME, metalness: 0.65, roughness: 0.4 }), {
    position: [0, 0.02, FAN_PLATE_Z], castShadow: !ghost, receiveShadow: true,
  });

  const slots: SlotVisual[] = [];

  slotXs.forEach((gx, slotIndex) => {
    const hardwareId = paddedSlots[slotIndex] ?? null;

    if (hardwareId) {
      addBox(root, [0.06, 0.04, 0.1], ghost ? gmat : new MeshStandardMaterial({
        color: RISER, metalness: 0.45, roughness: 0.42, emissive: RISER, emissiveIntensity: 0.12,
      }), {
        position: [gx, TRAY_TOP_Y + 0.02, -0.06], castShadow: !ghost,
      });
    }

    const slotGroup = new Group();
    slotGroup.position.set(gx, GPU_Y, 0.12);
    root.add(slotGroup);

    let gpuMaterial: MeshStandardMaterial | null = null;
    if (!hardwareId) {
      if (!ghost) {
        addBox(slotGroup, [0.095, 0.12, 0.06], new MeshStandardMaterial({ color: "#0f172a", metalness: 0.4, roughness: 0.75 }), {
          position: [0, 0, 0.05],
        });
      } else {
        addBox(slotGroup, [0.07, 0.1, 0.05], gmat, {});
      }
    } else if (ghost) {
      addBox(slotGroup, [0.09, 0.48, 0.2], gmat, { castShadow: false, receiveShadow: true });
    } else {
      gpuMaterial = new MeshStandardMaterial({
        color: "#1f2937",
        metalness: 0.78,
        roughness: 0.26,
        emissive: GPU_DARK,
        emissiveIntensity: 0.04,
      });
      addBox(slotGroup, [0.09, 0.48, 0.2], gpuMaterial, { castShadow: true, receiveShadow: true });
      addBox(slotGroup, [0.085, 0.44, 0.012], new MeshStandardMaterial({ color: "#475569", metalness: 0.82, roughness: 0.2 }), {
        position: [0, 0, -0.105],
      });
    }

    slots.push({
      index: slotIndex,
      group: slotGroup,
      extract: 0,
      hardwareId,
      gpuMaterial,
      lastWorkload: null,
    });

    if (hardwareId || ghost) {
      buildPowerCable(root, gx, ghost, isValid, gmat);
    }
  });

  // Front fans.
  slotXs.forEach((fx, i) => {
    const fan = new Group();
    fan.position.set(fx, 0.02, FAN_CENTER_Z);
    if (ghost) {
      const mesh = new Mesh(
        new CylinderGeometry(0.068, 0.068, 0.018, 24),
        gmat,
      );
      mesh.rotation.x = Math.PI / 2;
      mesh.rotation.z = (i * Math.PI) / 2;
      fan.add(mesh);
    } else {
      buildFanRotor(fan, 0.068, FAN_BLADE, (i * Math.PI) / 2);
    }
    root.add(fan);
  });

  buildCoolingModule(root, installedCoolerId, ghost);

  // Status light strip — its material is handed to the parent rack via lightRef.
  const stripMaterial = ghost
    ? (gmat)
    : new MeshStandardMaterial({
        color: emissiveColor,
        emissive: emissiveColor,
        emissiveIntensity: 2,
        metalness: 0.5,
        roughness: 0.35,
      });
  addBox(root, [Math.min(0.62, fanPlateW * 0.72), 0.04, 0.02], stripMaterial, {
    position: [0, -0.28, 0.448],
  });
  if (!ghost) lightRef.current = stripMaterial as MeshStandardMaterialType;

  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  track(root, geometries, materials);

  return {
    mount(state: EngineFrameState) {
      state.scene.add(root);
    },
    frame(state: EngineFrameState, delta: number) {
      const props = getProps();
      for (const slot of slots) {
        const target = props.extractSlotIndex === slot.index ? 1 : 0;
        slot.extract += (target - slot.extract) * Math.min(1, delta * 16);
        slot.group.position.z = 0.12 + 0.26 * slot.extract;

        if (slot.gpuMaterial === null || slot.hardwareId === null) continue;
        const workload = workloadForRackSlot(props.slotWorkloadMap, props.rackId, slot.index, slot.hardwareId);
        if (workload !== slot.lastWorkload) {
          slot.lastWorkload = workload;
          const base = gpuWorkloadBase(workload);
          slot.gpuMaterial.color.set(base.color);
          slot.gpuMaterial.emissive.set(base.emissive);
          if (workload === GPU_SPLOT_WORKLOAD.idle) {
            slot.gpuMaterial.emissiveIntensity = base.intensity;
          }
        }
        if (workload === GPU_SPLOT_WORKLOAD.idle) continue;
        const base = gpuWorkloadBase(workload);
        const pulse = 0.88 + 0.12 * Math.sin(state.clock.elapsedTime * 2.8 + slot.index);
        slot.gpuMaterial.emissiveIntensity = base.intensity * pulse;
      }
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(root);
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      if (!materials.has(gmat)) gmat.dispose();
      if (lightRef.current === stripMaterial) lightRef.current = null;
    },
  };
}

/** Open-air GPU-style frame (procedural fallback when no GLB). Per-slot hardware + workload + extract. */
export function SmallGpuRackProcedural(props: SmallGpuRackProceduralProps) {
  const latest = useRef(props);
  latest.current = props;
  const installedKey = props.installedSlots.map((slot) => slot ?? "-").join(",");
  return (
    <EngineDrawMount
      create={() =>
        smallGpuRackDraw(() => latest.current, {
          slotCount: props.slotCount,
          installedSlots: props.installedSlots,
          ghost: props.ghost,
          isValid: props.isValid,
          installedCoolerId: props.installedCoolerId,
          emissiveColor: props.emissiveColor,
          lightRef: props.lightRef,
        })
      }
      deps={[props.slotCount, installedKey, props.ghost, props.isValid, props.installedCoolerId ?? null, props.emissiveColor]}
    />
  );
}

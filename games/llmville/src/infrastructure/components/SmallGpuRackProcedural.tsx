import { useEffect, useMemo, useRef, type RefObject } from "react";
import { PROFILE_SECTION, useProfiledFrame } from "@/runtime/runtimePerformanceProfiler";
import { Group, QuadraticBezierCurve3, TubeGeometry, Vector3 } from "three";
import type { MeshStandardMaterial as MeshStandardMaterialType } from "three";

import type { HardwareModelId } from "@llmville/game/infrastructure/catalog";
import { GPU_SPLOT_WORKLOAD, workloadForRackSlot, type GpuSlotWorkload } from "@/infrastructure/computeUnits";
import {
  getRackCoolingUnitDefinition,
  type RackCoolantType,
  type RackCoolingUnitId,
} from "@llmville/game/infrastructure/catalog";

type SmallGpuRackProceduralProps = {
  rackId: string;
  slotCount: number;
  installedSlots: readonly (HardwareModelId | null)[];
  slotWorkloadMap: ReadonlyMap<string, GpuSlotWorkload> | undefined;
  extractSlotIndex: number | null;
  ghost: boolean;
  isValid: boolean;
  emissiveColor: string;
  installedCoolerId?: RackCoolingUnitId | null;
  lightRef: RefObject<MeshStandardMaterialType | null>;
};

const FRAME = "#141414";
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

const WORKLOAD_COLORS: Record<GpuSlotWorkload, string> = {
  [GPU_SPLOT_WORKLOAD.idle]: "#475569",
  [GPU_SPLOT_WORKLOAD.training]: "#ff007a",
  [GPU_SPLOT_WORKLOAD.scraping]: "#39ff14",
  [GPU_SPLOT_WORKLOAD.serving]: "#00a3ff",
};

const GPU_Y = 0.17;
const TRAY_TOP_Y = -0.08 + 0.0125;
const FAN_PLATE_Z = 0.404;
const FAN_CENTER_Z = 0.418;

function slotXsForCount(slotCount: number): number[] {
  if (slotCount < 1) return [];
  const span = Math.min(0.76, Math.max(0.34, 0.09 * slotCount + 0.07 * Math.max(0, slotCount - 1)));
  if (slotCount === 1) return [0];
  const half = span / 2;
  return Array.from({ length: slotCount }, (_, i) => -half + (i / (slotCount - 1)) * span);
}

function GhostPlacementMaterial({ isValid }: { isValid: boolean }) {
  const ghostColor = isValid ? "#34d399" : "#fb7185";
  return (
    <meshStandardMaterial
      color={ghostColor}
      emissive={ghostColor}
      emissiveIntensity={0.45}
      metalness={0.65}
      roughness={0.25}
      transparent
      opacity={0.45}
    />
  );
}

function GpuPowerCable({
  gpuX,
  ghost,
  isValid,
}: {
  gpuX: number;
  ghost: boolean;
  isValid: boolean;
}) {
  const geometry = useMemo(() => {
    const start = new Vector3(gpuX, GPU_Y + 0.22, 0.14);
    const end = new Vector3(gpuX * 0.35, -0.26, -0.14);
    const mid = new Vector3(gpuX * 0.55, 0.02, -0.02);
    const curve = new QuadraticBezierCurve3(start, mid, end);
    return new TubeGeometry(curve, 14, 0.014, 6, false);
  }, [gpuX]);

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  return (
    <mesh geometry={geometry} castShadow={!ghost}>
      {ghost ? <GhostPlacementMaterial isValid={isValid} /> : <meshStandardMaterial color={CABLE} metalness={0.2} roughness={0.88} />}
    </mesh>
  );
}

function OpenFanRotor({
  radius,
  accent,
  rotation = 0,
}: {
  radius: number;
  accent: string;
  rotation?: number;
}) {
  return (
    <group rotation={[0, 0, rotation]}>
      <mesh castShadow>
        <torusGeometry args={[radius, radius * 0.1, 8, 24]} />
        <meshStandardMaterial color="#0b1117" metalness={0.68} roughness={0.3} emissive={accent} emissiveIntensity={0.12} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[radius * 0.28, radius * 0.28, 0.022, 18]} />
        <meshStandardMaterial color="#111827" metalness={0.72} roughness={0.28} emissive={accent} emissiveIntensity={0.16} />
      </mesh>
      {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((angle) => (
        <mesh
          key={angle}
          position={[Math.cos(angle) * radius * 0.24, Math.sin(angle) * radius * 0.24, 0.016]}
          rotation={[0, 0, angle]}
          castShadow
        >
          <boxGeometry args={[radius * 0.7, radius * 0.15, 0.014]} />
          <meshStandardMaterial color="#1f2937" metalness={0.58} roughness={0.32} emissive={accent} emissiveIntensity={0.1} />
        </mesh>
      ))}
    </group>
  );
}

function GpuSlotContent({
  workload,
  ghost,
  isValid,
}: {
  workload: GpuSlotWorkload;
  ghost: boolean;
  isValid: boolean;
}) {
  const matRef = useRef<MeshStandardMaterialType>(null);
  const pulseRef = useRef(0);

  useEffect(() => {
    const m = matRef.current;
    if (!m || ghost) return;
    if (workload === GPU_SPLOT_WORKLOAD.idle) {
      m.emissiveIntensity = 0.04;
    }
  }, [ghost, workload]);

  useProfiledFrame(PROFILE_SECTION.rackGpuPulse, (_s, delta) => {
    pulseRef.current += delta;
    const m = matRef.current;
    if (!m || ghost || workload === GPU_SPLOT_WORKLOAD.idle) return;
    const pulse = 0.88 + 0.12 * Math.sin(pulseRef.current * 2.8);
    m.emissiveIntensity =
      (workload === GPU_SPLOT_WORKLOAD.training ? 0.74 : workload === GPU_SPLOT_WORKLOAD.scraping ? 0.62 : 0.68) * pulse;
  });

  if (ghost) {
    return (
      <mesh castShadow={false} receiveShadow>
        <boxGeometry args={[0.09, 0.48, 0.2]} />
        <GhostPlacementMaterial isValid={isValid} />
      </mesh>
    );
  }

  const emissive = workload === GPU_SPLOT_WORKLOAD.idle ? GPU_DARK : WORKLOAD_COLORS[workload];
  const emissiveIntensity =
    workload === GPU_SPLOT_WORKLOAD.idle ? 0.04
    : workload === GPU_SPLOT_WORKLOAD.training ? 0.74
    : workload === GPU_SPLOT_WORKLOAD.scraping ? 0.62
    : 0.68;
  const bodyColor = workload === GPU_SPLOT_WORKLOAD.idle ? "#1f2937" : emissive;

  return (
    <>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[0.09, 0.48, 0.2]} />
        <meshStandardMaterial
          ref={matRef}
          color={bodyColor}
          metalness={0.78}
          roughness={0.26}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
        />
      </mesh>
      <mesh position={[0, 0, -0.105]}>
        <boxGeometry args={[0.085, 0.44, 0.012]} />
        <meshStandardMaterial color="#475569" metalness={0.82} roughness={0.2} />
      </mesh>
    </>
  );
}

function GpuSlotGroup({
  rackId,
  slotIndex,
  gpuX,
  hardwareId,
  workloadMap,
  extractSlotIndex,
  ghost,
  isValid,
}: {
  rackId: string;
  slotIndex: number;
  gpuX: number;
  hardwareId: HardwareModelId | null;
  workloadMap: ReadonlyMap<string, GpuSlotWorkload> | undefined;
  extractSlotIndex: number | null;
  ghost: boolean;
  isValid: boolean;
}) {
  const groupRef = useRef<Group>(null);
  const extractRef = useRef(0);

  const workload = hardwareId
    ? workloadForRackSlot(workloadMap, rackId, slotIndex, hardwareId)
    : GPU_SPLOT_WORKLOAD.idle;

  useProfiledFrame(PROFILE_SECTION.rackGpuPulse, (_s, delta) => {
    const target = extractSlotIndex === slotIndex ? 1 : 0;
    extractRef.current += (target - extractRef.current) * Math.min(1, delta * 16);
    if (groupRef.current) {
      groupRef.current.position.z = 0.12 + 0.26 * extractRef.current;
    }
  });

  if (!hardwareId) {
    return (
      <group ref={groupRef} position={[gpuX, GPU_Y, 0.12]}>
        {!ghost && (
          <mesh position={[0, 0, 0.05]}>
            <boxGeometry args={[0.095, 0.12, 0.06]} />
            <meshStandardMaterial color="#0f172a" metalness={0.4} roughness={0.75} />
          </mesh>
        )}
        {ghost && (
          <mesh>
            <boxGeometry args={[0.07, 0.1, 0.05]} />
            <GhostPlacementMaterial isValid={isValid} />
          </mesh>
        )}
      </group>
    );
  }

  return (
    <group ref={groupRef} position={[gpuX, GPU_Y, 0.12]}>
      <GpuSlotContent workload={workload} ghost={ghost} isValid={isValid} />
    </group>
  );
}

function OpenRackCoolingModule({
  installedCoolerId,
  ghost,
}: {
  installedCoolerId?: RackCoolingUnitId | null;
  ghost: boolean;
}) {
  if (ghost || !installedCoolerId) return null;

  const cooler = getRackCoolingUnitDefinition(installedCoolerId);
  const accent = COOLANT_COLORS[cooler.coolantType];

  if (cooler.coolantType === "air") {
    const fanCount = cooler.capacityKw >= 5 ? 3 : 2;
    return (
      <group position={[0, -0.12, 0.51]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.62, 0.28, 0.055]} />
          <meshStandardMaterial color="#172027" metalness={0.64} roughness={0.34} emissive={accent} emissiveIntensity={0.08} />
        </mesh>
        {Array.from({ length: fanCount }, (_, index) => (
          <group
            key={`open-cooler-air-${index}`}
            position={[index === 0 ? -0.16 : fanCount === 2 ? 0.16 : (index - 1) * 0.16, 0, 0.042]}
          >
            <OpenFanRotor radius={0.078} accent={accent} rotation={index * 0.7} />
          </group>
        ))}
      </group>
    );
  }

  if (cooler.coolantType === "water") {
    return (
      <group position={[0.49, -0.02, 0.08]}>
        {[-0.05, 0.05].map((z) => (
          <mesh key={`open-water-pipe-${z}`} position={[0, 0, z]} castShadow receiveShadow>
            <cylinderGeometry args={[0.022, 0.022, 0.72, 18]} />
            <meshStandardMaterial color={accent} metalness={0.5} roughness={0.24} emissive={accent} emissiveIntensity={0.46} />
          </mesh>
        ))}
        {[0.36, -0.36].map((y) => (
          <mesh key={`open-water-cross-${y}`} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.022, 0.022, 0.16, 18]} />
            <meshStandardMaterial color={accent} metalness={0.5} roughness={0.24} emissive={accent} emissiveIntensity={0.42} />
          </mesh>
        ))}
        <mesh position={[0, -0.4, 0]} castShadow>
          <boxGeometry args={[0.14, 0.12, 0.28]} />
          <meshStandardMaterial color="#0e7490" metalness={0.5} roughness={0.3} emissive={accent} emissiveIntensity={0.36} />
        </mesh>
        <mesh position={[-0.02, -0.4, 0]} castShadow>
          <boxGeometry args={[0.025, 0.16, 0.28]} />
          <meshStandardMaterial color="#bae6fd" metalness={0.36} roughness={0.34} emissive={accent} emissiveIntensity={0.16} />
        </mesh>
      </group>
    );
  }

  return (
    <group position={[0, 0, 0.02]}>
      <mesh position={[0, 0, 0.47]} castShadow receiveShadow>
        <boxGeometry args={[0.84, 0.88, 0.07]} />
        <meshStandardMaterial
          color="#dbeafe"
          metalness={0.22}
          roughness={0.18}
          emissive={accent}
          emissiveIntensity={0.16}
          transparent
          opacity={0.42}
        />
      </mesh>
      {[-0.45, 0.45].map((x) => (
        <mesh key={`open-ln2-shell-side-${x}`} position={[x, 0, 0.19]} castShadow receiveShadow>
          <boxGeometry args={[0.06, 0.96, 0.46]} />
          <meshStandardMaterial color="#bfdbfe" metalness={0.34} roughness={0.2} emissive={accent} emissiveIntensity={0.24} />
        </mesh>
      ))}
      {[0.5, -0.5].map((y) => (
        <mesh key={`open-ln2-shell-band-${y}`} position={[0, y, 0.19]} castShadow receiveShadow>
          <boxGeometry args={[0.9, 0.06, 0.46]} />
          <meshStandardMaterial color={accent} metalness={0.3} roughness={0.24} emissive={accent} emissiveIntensity={0.5} />
        </mesh>
      ))}
      <mesh position={[0, -0.58, 0.47]} castShadow>
        <boxGeometry args={[0.48, 0.04, 0.06]} />
        <meshStandardMaterial color="#e0f2fe" metalness={0.44} roughness={0.22} emissive={accent} emissiveIntensity={0.32} />
      </mesh>
    </group>
  );
}

/** Open-air GPU-style frame (procedural fallback when no GLB). Per-slot hardware + workload + extract. */
export function SmallGpuRackProcedural({
  rackId,
  slotCount,
  installedSlots,
  slotWorkloadMap,
  extractSlotIndex,
  ghost,
  isValid,
  emissiveColor,
  installedCoolerId,
  lightRef,
}: SmallGpuRackProceduralProps) {
  const slotXs = useMemo(() => slotXsForCount(slotCount), [slotCount]);
  const paddedSlots = useMemo(() => {
    const out: (HardwareModelId | null)[] = [];
    for (let i = 0; i < slotCount; i++) {
      out.push(installedSlots[i] ?? null);
    }
    return out;
  }, [installedSlots, slotCount]);

  const maxAbsX = useMemo(() => slotXs.reduce((m, x) => Math.max(m, Math.abs(x)), 0), [slotXs]);
  const fanPlateW = Math.min(0.92, maxAbsX * 2 + 0.14);
  const trayW = Math.min(0.82, maxAbsX * 2 + 0.12);

  return (
    <group>
      {[
        [-0.38, -0.38],
        [0.38, -0.38],
        [-0.38, 0.38],
        [0.38, 0.38],
      ].map(([px, pz], i) => (
        <mesh key={`post-${i}`} position={[px, 0, pz]} castShadow={!ghost} receiveShadow>
          <boxGeometry args={[0.045, 0.95, 0.045]} />
          {ghost ? <GhostPlacementMaterial isValid={isValid} /> : <meshStandardMaterial color={FRAME} metalness={FRAME_METAL} roughness={FRAME_ROUGH} />}
        </mesh>
      ))}

      {[
        { pos: [0, -0.45, -0.38] as const, size: [0.82, 0.035, 0.035] as const },
        { pos: [0, -0.45, 0.38] as const, size: [0.82, 0.035, 0.035] as const },
        { pos: [-0.38, -0.45, 0] as const, size: [0.035, 0.035, 0.76] as const },
        { pos: [0.38, -0.45, 0] as const, size: [0.035, 0.035, 0.76] as const },
        { pos: [0, 0.45, -0.38] as const, size: [0.82, 0.035, 0.035] as const },
        { pos: [0, 0.45, 0.38] as const, size: [0.82, 0.035, 0.035] as const },
        { pos: [-0.38, 0.45, 0] as const, size: [0.035, 0.035, 0.76] as const },
        { pos: [0.38, 0.45, 0] as const, size: [0.035, 0.035, 0.76] as const },
      ].map((rail, i) => (
        <mesh key={`rail-${i}`} position={rail.pos} castShadow={!ghost} receiveShadow>
          <boxGeometry args={rail.size} />
          {ghost ? <GhostPlacementMaterial isValid={isValid} /> : <meshStandardMaterial color={FRAME} metalness={FRAME_METAL} roughness={FRAME_ROUGH} />}
        </mesh>
      ))}

      {[-0.38, 0.38].map((sx, i) => (
        <mesh key={`fan-strut-${i}`} position={[sx, 0.02, 0.395]} castShadow={!ghost} receiveShadow={!ghost}>
          <boxGeometry args={[0.04, 0.55, 0.024]} />
          {ghost ? (
            <GhostPlacementMaterial isValid={isValid} />
          ) : (
            <meshStandardMaterial color={FRAME} metalness={FRAME_METAL} roughness={FRAME_ROUGH} />
          )}
        </mesh>
      ))}

      <mesh position={[0, -0.08, 0.05]} castShadow={!ghost} receiveShadow>
        <boxGeometry args={[trayW, 0.025, 0.55]} />
        {ghost ? <GhostPlacementMaterial isValid={isValid} /> : <meshStandardMaterial color="#14532d" metalness={0.35} roughness={0.65} />}
      </mesh>

      <mesh position={[0, -0.32, -0.12]} castShadow={!ghost} receiveShadow>
        <boxGeometry args={[0.52, 0.14, 0.38]} />
        {ghost ? <GhostPlacementMaterial isValid={isValid} /> : <meshStandardMaterial color={PSU_COLOR} metalness={0.55} roughness={0.42} />}
      </mesh>

      <mesh position={[0, 0.02, FAN_PLATE_Z]} castShadow={!ghost} receiveShadow>
        <boxGeometry args={[fanPlateW, 0.2, 0.022]} />
        {ghost ? (
          <GhostPlacementMaterial isValid={isValid} />
        ) : (
          <meshStandardMaterial color={FAN_FRAME} metalness={0.65} roughness={0.4} />
        )}
      </mesh>

      {slotXs.map((gx, slotIndex) => {
        const hw = paddedSlots[slotIndex] ?? null;
        if (!hw) return null;
        return (
          <mesh key={`riser-${slotIndex}`} position={[gx, TRAY_TOP_Y + 0.02, -0.06]} castShadow={!ghost}>
            <boxGeometry args={[0.06, 0.04, 0.1]} />
            {ghost ? (
              <GhostPlacementMaterial isValid={isValid} />
            ) : (
              <meshStandardMaterial color={RISER} metalness={0.45} roughness={0.42} emissive={RISER} emissiveIntensity={0.12} />
            )}
          </mesh>
        );
      })}

      {slotXs.map((gx, slotIndex) => (
        <GpuSlotGroup
          key={`gpu-slot-${slotIndex}`}
          rackId={rackId}
          slotIndex={slotIndex}
          gpuX={gx}
          hardwareId={paddedSlots[slotIndex] ?? null}
          workloadMap={slotWorkloadMap}
          extractSlotIndex={extractSlotIndex}
          ghost={ghost}
          isValid={isValid}
        />
      ))}

      {slotXs.map((gx, i) => {
        if (!paddedSlots[i] && !ghost) return null;
        return <GpuPowerCable key={`cable-${i}`} gpuX={gx} ghost={ghost} isValid={isValid} />;
      })}

      {slotXs.map((fx, i) => (
        <group key={`fan-${i}`} position={[fx, 0.02, FAN_CENTER_Z]}>
          {ghost ? (
            <mesh rotation={[Math.PI / 2, 0, (i * Math.PI) / 2]} castShadow={false}>
              <cylinderGeometry args={[0.068, 0.068, 0.018, 24]} />
              <GhostPlacementMaterial isValid={isValid} />
            </mesh>
          ) : (
            <OpenFanRotor radius={0.068} accent={FAN_BLADE} rotation={(i * Math.PI) / 2} />
          )}
        </group>
      ))}

      <OpenRackCoolingModule installedCoolerId={installedCoolerId} ghost={ghost} />

      <mesh position={[0, -0.28, 0.448]}>
        <boxGeometry args={[Math.min(0.62, fanPlateW * 0.72), 0.04, 0.02]} />
        {ghost ? (
          <GhostPlacementMaterial isValid={isValid} />
        ) : (
          <meshStandardMaterial
            ref={lightRef}
            color={emissiveColor}
            emissive={emissiveColor}
            emissiveIntensity={2}
            metalness={0.5}
            roughness={0.35}
          />
        )}
      </mesh>
    </group>
  );
}

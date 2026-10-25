import { useMemo, useRef, type Ref, type RefObject } from "react";
import { RoundedBox } from "@react-three/drei";
import { PROFILE_SECTION, useProfiledFrame } from "@/runtime/runtimePerformanceProfiler";
import type { MeshStandardMaterial as MeshStandardMaterialType } from "three";

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

function FanRotor({
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
        <torusGeometry args={[radius, radius * 0.1, 8, 28]} />
        <meshStandardMaterial color="#0b1117" metalness={0.68} roughness={0.3} emissive={accent} emissiveIntensity={0.12} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[radius * 0.28, radius * 0.28, 0.026, 18]} />
        <meshStandardMaterial color="#111827" metalness={0.72} roughness={0.28} emissive={accent} emissiveIntensity={0.18} />
      </mesh>
      {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((angle) => (
        <mesh
          key={angle}
          position={[Math.cos(angle) * radius * 0.26, Math.sin(angle) * radius * 0.26, 0.018]}
          rotation={[0, 0, angle]}
          castShadow
        >
          <boxGeometry args={[radius * 0.72, radius * 0.16, 0.018]} />
          <meshStandardMaterial color="#1f2937" metalness={0.58} roughness={0.32} emissive={accent} emissiveIntensity={0.1} />
        </mesh>
      ))}
    </group>
  );
}

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
      width: 1.06,
      height: 1.68,
      depth: 0.88,
      bayColumns: 2,
      bayRows: 2,
      bodyColor: "#121718",
      frameColor: "#2f3b3f",
      faceColor: "#0a1112",
      accentColor: "#f59e0b",
      coolingVisual: "air",
      coolantTypes,
    };
  }
  if (catalogId === "air_rack_6") {
    return {
      width: 1.1,
      height: 1.86,
      depth: 0.9,
      bayColumns: 2,
      bayRows: 3,
      bodyColor: "#121718",
      frameColor: "#334047",
      faceColor: "#0b1217",
      accentColor: "#f59e0b",
      coolingVisual: "air",
      coolantTypes,
    };
  }
  if (catalogId === "water_rack_4") {
    return {
      width: 1.08,
      height: 1.76,
      depth: 0.94,
      bayColumns: 2,
      bayRows: 2,
      bodyColor: "#10191d",
      frameColor: "#263a44",
      faceColor: "#071116",
      accentColor: "#38bdf8",
      coolingVisual: "water",
      coolantTypes,
    };
  }
  if (catalogId === "server_rack_8_water") {
    return {
      width: 1.16,
      height: 2.04,
      depth: 0.96,
      bayColumns: 2,
      bayRows: 4,
      bodyColor: "#11181b",
      frameColor: "#2b3d42",
      faceColor: "#071012",
      accentColor: "#38bdf8",
      coolingVisual: "water",
      coolantTypes,
    };
  }
  if (catalogId === "server_rack_12") {
    return {
      width: 1.2,
      height: 2.12,
      depth: 0.98,
      bayColumns: 3,
      bayRows: 4,
      bodyColor: "#111719",
      frameColor: "#303a3f",
      faceColor: "#080f12",
      accentColor: "#5fc2a8",
      coolingVisual: "hybrid",
      coolantTypes,
    };
  }
  if (catalogId === "water_server_rack_12") {
    return {
      width: 1.22,
      height: 2.18,
      depth: 1,
      bayColumns: 3,
      bayRows: 4,
      bodyColor: "#0e171c",
      frameColor: "#27414a",
      faceColor: "#061014",
      accentColor: "#38bdf8",
      coolingVisual: "water",
      coolantTypes,
    };
  }
  if (catalogId === "ln2_rack_16") {
    return {
      width: 1.26,
      height: 2.22,
      depth: 1.04,
      bayColumns: 4,
      bayRows: 4,
      bodyColor: "#111522",
      frameColor: "#34324f",
      faceColor: "#090a16",
      accentColor: "#a78bfa",
      coolingVisual: "ln2",
      coolantTypes,
    };
  }
  if (catalogId === "medium_server_rack_24") {
    return {
      width: 1.34,
      height: 2.38,
      depth: 1.08,
      bayColumns: 4,
      bayRows: 6,
      bodyColor: "#101719",
      frameColor: "#283a3d",
      faceColor: "#060d0f",
      accentColor: "#10b981",
      coolingVisual: "hybrid",
      coolantTypes,
    };
  }

  return {
    width: 1.06,
    height: 1.72,
    depth: 0.86,
    bayColumns: 2,
    bayRows: 4,
    bodyColor: "#15171d",
    frameColor: "#30333b",
    faceColor: "#0d1016",
    accentColor: "#a855f7",
    coolingVisual: "hybrid",
    coolantTypes,
  };
}

function isOpenGpuRack(rackType: InfrastructureBuildItemId): boolean {
  return rackType === STARTER_RACK_CATALOG_ID;
}

function GhostRackMaterial({ isValid }: { isValid: boolean }) {
  const ghostColor = isValid ? "#34d399" : "#fb7185";
  return (
    <meshStandardMaterial
      color={ghostColor}
      emissive={ghostColor}
      emissiveIntensity={0.44}
      metalness={0.58}
      roughness={0.3}
      transparent
      opacity={0.42}
    />
  );
}

function RackCabinetBox({
  args,
  position,
  color,
  ghost,
  isValid,
  emissive,
  emissiveIntensity = 0.025,
  metalness = 0.35,
  roughness = 0.45,
  materialRef,
}: {
  args: [number, number, number];
  position: [number, number, number];
  color: string;
  ghost: boolean;
  isValid: boolean;
  emissive?: string;
  emissiveIntensity?: number;
  metalness?: number;
  roughness?: number;
  materialRef?: Ref<MeshStandardMaterialType>;
}) {
  return (
    <RoundedBox args={args} radius={Math.min(0.04, ...args.map((size) => size / 4))} smoothness={2} position={position} castShadow={!ghost} receiveShadow>
      {ghost ? (
        <GhostRackMaterial isValid={isValid} />
      ) : (
        <meshStandardMaterial
          ref={materialRef}
          color={color}
          emissive={emissive ?? color}
          emissiveIntensity={emissiveIntensity}
          metalness={metalness}
          roughness={roughness}
        />
      )}
    </RoundedBox>
  );
}

function RackCapabilityMarks({
  profile,
  slotCount,
  rackType,
  ghost,
  isValid,
}: {
  profile: RackCabinetProfile;
  slotCount: number;
  rackType: InfrastructureBuildItemId;
  ghost: boolean;
  isValid: boolean;
}) {
  if (ghost) return null;

  const faceZ = profile.depth / 2 + 0.09;
  const sideX = profile.width / 2 + 0.035;
  const bandCount = Math.min(6, Math.max(1, Math.ceil(slotCount / 4)));
  const bandWidth = Math.min(0.86, profile.width * 0.62) / bandCount;
  const sidePortY = profile.height * 0.38;
  const tierOffset = resolveRackCatalogId(rackType)?.includes("server") ? 0.04 : 0;

  return (
    <>
      {Array.from({ length: bandCount }, (_, index) => (
        <RackCabinetBox
          key={`tier-band-${index}`}
          args={[bandWidth * 0.55, 0.04, 0.035]}
          position={[
            -((bandCount - 1) * bandWidth) / 2 + index * bandWidth,
            profile.height * 0.47 + tierOffset,
            faceZ + 0.02,
          ]}
          color={profile.accentColor}
          ghost={false}
          isValid={isValid}
          emissive={profile.accentColor}
          emissiveIntensity={0.5}
          metalness={0.35}
          roughness={0.36}
        />
      ))}

      {profile.coolantTypes.map((coolant, index) => {
        const color = COOLANT_COLORS[coolant];
        return (
          <group
            key={`coolant-port-${coolant}`}
            position={[
              sideX,
              sidePortY - index * 0.15,
              faceZ + 0.005,
            ]}
          >
            <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.043, 0.043, 0.045, 16]} />
              <meshStandardMaterial color={color} metalness={0.46} roughness={0.28} emissive={color} emissiveIntensity={0.42} />
            </mesh>
            <RackCabinetBox
              args={[0.1, 0.018, 0.022]}
              position={[-0.055, 0, 0]}
              color={color}
              ghost={false}
              isValid={isValid}
              emissive={color}
              emissiveIntensity={0.28}
              metalness={0.36}
              roughness={0.32}
            />
          </group>
        );
      })}
    </>
  );
}

function RackInstalledCoolingModule({
  profile,
  installedCoolerId,
  ghost,
  isValid,
}: {
  profile: RackCabinetProfile;
  installedCoolerId: RackCoolingUnitId | null | undefined;
  ghost: boolean;
  isValid: boolean;
}) {
  if (ghost || !installedCoolerId) return null;

  const cooler = getRackCoolingUnitDefinition(installedCoolerId);
  const faceZ = profile.depth / 2 + 0.12;
  const sideX = profile.width / 2 + 0.055;
  const accent = COOLANT_COLORS[cooler.coolantType];

  if (cooler.coolantType === "air") {
    const fanCount = cooler.capacityKw >= 5 ? 4 : cooler.capacityKw >= 2.5 ? 3 : 2;
    const fanSpacing = profile.width * 0.56 / Math.max(1, fanCount - 1);
    return (
      <>
        <RackCabinetBox
          args={[profile.width * 0.72, 0.34, 0.055]}
          position={[0, -profile.height * 0.34, faceZ]}
          color="#172027"
          ghost={false}
          isValid={isValid}
          emissive={accent}
          emissiveIntensity={0.1}
          metalness={0.54}
          roughness={0.34}
        />
        {Array.from({ length: fanCount }, (_, index) => (
          <group
            key={`installed-air-fan-${index}`}
            position={[
              -((fanCount - 1) * fanSpacing) / 2 + index * fanSpacing,
              -profile.height * 0.34,
              faceZ + 0.035,
            ]}
          >
            <FanRotor radius={0.09} accent={accent} rotation={index * 0.72} />
          </group>
        ))}
      </>
    );
  }

  if (cooler.coolantType === "water") {
    const pipeXs = [-sideX, -sideX + 0.12, sideX - 0.12, sideX];
    return (
      <>
        {pipeXs.map((x) => (
          <mesh key={`water-pipe-vertical-${x}`} position={[x, 0.02, faceZ + 0.005]} castShadow>
            <cylinderGeometry args={[0.028, 0.028, profile.height * 0.78, 18]} />
            <meshStandardMaterial color={accent} metalness={0.46} roughness={0.24} emissive={accent} emissiveIntensity={0.5} />
          </mesh>
        ))}
        {[profile.height * 0.42, -profile.height * 0.42].map((y) => (
          <mesh key={`water-pipe-cross-${y}`} position={[0, y, faceZ + 0.005]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.028, 0.028, profile.width * 1.05, 18]} />
            <meshStandardMaterial color={accent} metalness={0.46} roughness={0.24} emissive={accent} emissiveIntensity={0.44} />
          </mesh>
        ))}
        <RackCabinetBox
          args={[profile.width * 0.58, 0.18, 0.085]}
          position={[0, -profile.height * 0.51, faceZ + 0.035]}
          color="#0e7490"
          ghost={false}
          isValid={isValid}
          emissive={accent}
          emissiveIntensity={0.55}
          metalness={0.48}
          roughness={0.28}
        />
        {[-0.18, 0, 0.18].map((x) => (
          <RackCabinetBox
            key={`water-radiator-fin-${x}`}
            args={[0.035, 0.16, 0.095]}
            position={[x, -profile.height * 0.51, faceZ + 0.075]}
            color="#bae6fd"
            ghost={false}
            isValid={isValid}
            emissive={accent}
            emissiveIntensity={0.16}
            metalness={0.36}
            roughness={0.32}
          />
        ))}
      </>
    );
  }

  return (
    <>
      <mesh position={[0, 0, faceZ + 0.015]} castShadow receiveShadow>
        <boxGeometry args={[profile.width * 0.92, profile.height * 0.8, 0.075]} />
        <meshStandardMaterial
          color="#dbeafe"
          emissive={accent}
          emissiveIntensity={0.16}
          metalness={0.24}
          roughness={0.18}
          transparent
          opacity={0.42}
        />
      </mesh>
      {[-profile.width * 0.52, profile.width * 0.52].map((x) => (
        <RackCabinetBox
          key={`ln2-shell-side-${x}`}
          args={[0.075, profile.height * 0.86, 0.14]}
          position={[x, 0, faceZ - 0.005]}
          color="#bfdbfe"
          ghost={false}
          isValid={isValid}
          emissive={accent}
          emissiveIntensity={0.24}
          metalness={0.34}
          roughness={0.2}
        />
      ))}
      <RackCabinetBox
        args={[profile.width * 1.0, 0.07, 0.15]}
        position={[0, profile.height * 0.44, faceZ - 0.005]}
        color={accent}
        ghost={false}
        isValid={isValid}
        emissive={accent}
        emissiveIntensity={0.85}
        metalness={0.28}
        roughness={0.26}
      />
      <RackCabinetBox
        args={[profile.width * 1.0, 0.07, 0.15]}
        position={[0, -profile.height * 0.44, faceZ - 0.005]}
        color={accent}
        ghost={false}
        isValid={isValid}
        emissive={accent}
        emissiveIntensity={0.55}
        metalness={0.28}
        roughness={0.26}
      />
      {[-0.36, 0, 0.36].map((x) => (
        <mesh key={`ln2-shell-port-${x}`} position={[x, -profile.height * 0.52, faceZ + 0.06]} castShadow>
          <cylinderGeometry args={[0.045, 0.045, 0.07, 18]} />
          <meshStandardMaterial color="#e0f2fe" metalness={0.44} roughness={0.22} emissive={accent} emissiveIntensity={0.28} />
        </mesh>
      ))}
    </>
  );
}

function RackBaseThermalHints({
  profile,
  ghost,
  isValid,
}: {
  profile: RackCabinetProfile;
  ghost: boolean;
  isValid: boolean;
}) {
  if (ghost) return null;

  const faceZ = profile.depth / 2 + 0.075;
  const airHintColor = profile.coolingVisual === "air" || profile.coolingVisual === "hybrid" ? "#f59e0b" : "#1e293b";
  const waterHintColor = profile.coolingVisual === "water" || profile.coolingVisual === "hybrid" ? "#38bdf8" : profile.frameColor;

  if (profile.coolingVisual === "air") {
    return (
      <>
        {[-0.22, 0.22].map((x, index) => (
          <mesh key={`air-hint-${index}`} position={[x, -profile.height * 0.28, faceZ]} rotation={[Math.PI / 2, 0, index * 0.6]} castShadow>
            <cylinderGeometry args={[0.06, 0.06, 0.012, 20]} />
            <meshStandardMaterial color="#1e293b" metalness={0.6} roughness={0.4} emissive={airHintColor} emissiveIntensity={0.08} />
          </mesh>
        ))}
      </>
    );
  }

  if (profile.coolingVisual === "water") {
    return (
      <>
        {[-profile.width / 2 - 0.018, profile.width / 2 + 0.018].map((x) => (
          <RackCabinetBox
            key={`water-hint-${x}`}
            args={[0.035, profile.height * 0.5, 0.035]}
            position={[x, 0.03, faceZ]}
            color={waterHintColor}
            ghost={false}
            isValid={isValid}
            emissive={waterHintColor}
            emissiveIntensity={0.15}
            metalness={0.4}
            roughness={0.34}
          />
        ))}
      </>
    );
  }

  if (profile.coolingVisual === "ln2") {
    return (
      <RackCabinetBox
        args={[profile.width * 0.66, 0.036, 0.03]}
        position={[0, profile.height * 0.42, faceZ + 0.012]}
        color={profile.accentColor}
        ghost={false}
        isValid={isValid}
        emissive={profile.accentColor}
        emissiveIntensity={0.38}
        metalness={0.25}
        roughness={0.28}
      />
    );
  }

  return (
    <>
      <RackCabinetBox
        args={[0.032, profile.height * 0.52, 0.032]}
        position={[-profile.width / 2 - 0.018, 0.02, faceZ]}
        color="#38bdf8"
        ghost={false}
        isValid={isValid}
        emissive="#38bdf8"
        emissiveIntensity={0.16}
        metalness={0.4}
        roughness={0.3}
      />
      <RackCabinetBox
        args={[0.032, profile.height * 0.52, 0.032]}
        position={[profile.width / 2 + 0.018, 0.02, faceZ]}
        color="#f59e0b"
        ghost={false}
        isValid={isValid}
        emissive="#f59e0b"
        emissiveIntensity={0.14}
        metalness={0.4}
        roughness={0.32}
      />
    </>
  );
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

function RackCabinetProcedural({
  rackId,
  rackType,
  slotCount,
  installedSlots,
  installedCoolerId,
  slotWorkloadMap,
  ghost,
  isValid,
  lightRef,
}: {
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
  const profile = getRackCabinetProfile(rackType);
  const bayWidth = (profile.width * 0.68) / profile.bayColumns;
  const bayHeight = (profile.height * 0.62) / profile.bayRows;
  const firstBayX = -((profile.bayColumns - 1) * bayWidth) / 2;
  const firstBayY = profile.height * 0.28;
  const visualSlotCount = Math.min(slotCount, profile.bayColumns * profile.bayRows);

  return (
    <group>
      <RackCabinetBox
        args={[profile.width, profile.height, profile.depth]}
        position={[0, 0, 0]}
        color={profile.bodyColor}
        ghost={ghost}
        isValid={isValid}
        metalness={0.48}
        roughness={0.38}
      />
      <RackCabinetBox
        args={[profile.width * 0.88, profile.height * 0.86, 0.04]}
        position={[0, 0.02, profile.depth / 2 + 0.03]}
        color={profile.faceColor}
        ghost={ghost}
        isValid={isValid}
        metalness={0.24}
        roughness={0.58}
      />
      {[-profile.width / 2 + 0.06, profile.width / 2 - 0.06].map((x) => (
        <RackCabinetBox
          key={x}
          args={[0.07, profile.height * 0.96, 0.08]}
          position={[x, 0, profile.depth / 2 + 0.06]}
          color={profile.frameColor}
          ghost={ghost}
          isValid={isValid}
          metalness={0.65}
          roughness={0.32}
        />
      ))}
      <RackCabinetBox
        args={[profile.width * 0.58, 0.045, 0.045]}
        position={[0, -profile.height * 0.43, profile.depth / 2 + 0.075]}
        color={profile.accentColor}
        ghost={ghost}
        isValid={isValid}
        emissive={profile.accentColor}
        emissiveIntensity={1.4}
        metalness={0.42}
        roughness={0.32}
        materialRef={lightRef}
      />
      <RackCapabilityMarks
        profile={profile}
        slotCount={slotCount}
        rackType={rackType}
        ghost={ghost}
        isValid={isValid}
      />
      <RackBaseThermalHints profile={profile} ghost={ghost} isValid={isValid} />
      <RackInstalledCoolingModule
        profile={profile}
        installedCoolerId={installedCoolerId}
        ghost={ghost}
        isValid={isValid}
      />

      {Array.from({ length: visualSlotCount }, (_, slotIndex) => {
        const column = slotIndex % profile.bayColumns;
        const row = Math.floor(slotIndex / profile.bayColumns);
        const hardwareId = installedSlots[slotIndex] ?? null;
        const workload = workloadForRackSlot(slotWorkloadMap, rackId, slotIndex, hardwareId);
        const light = getWorkloadLight(workload);
        const occupied = hardwareId !== null || ghost;

        return (
          <group
            key={slotIndex}
            position={[
              firstBayX + column * bayWidth,
              firstBayY - row * bayHeight,
              profile.depth / 2 + 0.072,
            ]}
          >
            <RackCabinetBox
              args={[bayWidth * 0.78, bayHeight * 0.56, 0.04]}
              position={[0, 0, 0]}
              color={occupied ? light.color : "#283136"}
              ghost={ghost}
              isValid={isValid}
              emissive={occupied ? light.color : "#000000"}
              emissiveIntensity={occupied ? light.intensity + 0.2 : 0}
              metalness={0.2}
              roughness={0.42}
            />
          </group>
        );
      })}

      {[-0.25, 0, 0.25].map((x, index) => (
        <group key={x} position={[x, -profile.height * 0.28, profile.depth / 2 + 0.075]}>
          {ghost ? (
            <mesh rotation={[Math.PI / 2, 0, index * 0.35]} castShadow={false}>
              <cylinderGeometry args={[0.075, 0.075, 0.018, 24]} />
              <GhostRackMaterial isValid={isValid} />
            </mesh>
          ) : (
            <FanRotor radius={0.075} accent={profile.accentColor} rotation={index * 0.35} />
          )}
        </group>
      ))}
    </group>
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
  installedHardwareSlots?: readonly RackInstalledHardwareSlot[];
  installedCoolerId?: RackCoolingUnitId | null;
  slotWorkloadMap?: ReadonlyMap<string, GpuSlotWorkload>;
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

  useProfiledFrame(PROFILE_SECTION.rackAnimation, (_state, delta) => {
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
    <group position={[x, rackBaseY, z]} rotation={[0, rotationY, 0]}>
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
    </group>
  );
}

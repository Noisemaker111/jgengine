import { createFileRoute, redirect } from "@tanstack/react-router";
import { Html, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo, useState } from "react";
import { PCFShadowMap } from "three";

import type { InfrastructureBuildItemId } from "@llmville/game/build/catalog";
import Rack from "@/infrastructure/components/Rack";
import { GPU_SPLOT_WORKLOAD, type GpuSlotWorkload } from "@/infrastructure/computeUnits";
import {
  coolerFitsRack,
  getRackCoolingUnitDefinition,
  RACK_COOLING_CATALOG,
  type RackCoolingUnitId,
} from "@llmville/game/infrastructure/catalog";
import type { RackInstalledHardwareSlot } from "@llmville/game/infrastructure/infrastructure";
import { getRackSlotCapacity } from "@llmville/game/infrastructure/infrastructure";
import {
  getRackCatalogDefinition,
  RACK_CATALOG,
  resolveRackCatalogId,
  STARTER_RACK_CATALOG_ID,
} from "@llmville/game/infrastructure/catalog";

type GpuPreviewMode = "empty" | "half" | "full";
type CoolerPreviewMode = "none" | "installed";
type ComputeLightPreviewMode = "off" | "mixed" | GpuSlotWorkload;

const RACK_PREVIEWS = RACK_CATALOG.map((rack) => ({
  id: rack.id,
  label: rack.label,
})) as readonly { id: InfrastructureBuildItemId; label: string }[];

const HARDWARE_SWATCHES: readonly RackInstalledHardwareSlot[] = [
  "gpu_1",
  "gpu_9",
  "gpu_16",
  "gpu_22",
  "gpu_24",
  "gpu_30",
  "gpu_32",
  "gpu_35",
];

function getPreviewRackDefinition(rackType: InfrastructureBuildItemId) {
  return getRackCatalogDefinition(resolveRackCatalogId(rackType) ?? STARTER_RACK_CATALOG_ID);
}

function rackTierLabel(slotCount: number): string {
  if (slotCount >= 24) return "datacenter";
  if (slotCount >= 16) return "extreme";
  if (slotCount >= 12) return "server";
  if (slotCount >= 8) return "dense";
  if (slotCount >= 4) return "growth";
  return "starter";
}

function rackSlots(rackType: InfrastructureBuildItemId, gpuMode: GpuPreviewMode): readonly RackInstalledHardwareSlot[] {
  const count = getRackSlotCapacity(rackType);
  return Array.from({ length: count }, (_, index) => {
    if (gpuMode === "empty") return null;
    if (gpuMode === "half" && index % 2 !== 0) return null;
    return HARDWARE_SWATCHES[index % HARDWARE_SWATCHES.length] ?? "gpu_1";
  });
}

function pickPreviewCooler(rackType: InfrastructureBuildItemId): RackCoolingUnitId | null {
  const rack = getPreviewRackDefinition(rackType);
  const coolers = RACK_COOLING_CATALOG
    .filter((cooler) => coolerFitsRack(cooler.coolantType, rack.allowedCoolantTypes))
    .toSorted((a, b) => b.capacityKw - a.capacityKw);
  return coolers[0]?.id ?? null;
}

function buildWorkloadMap(
  previews: readonly { id: InfrastructureBuildItemId }[],
  slotsByRack: ReadonlyMap<InfrastructureBuildItemId, readonly RackInstalledHardwareSlot[]>,
  lightMode: ComputeLightPreviewMode,
): ReadonlyMap<string, GpuSlotWorkload> {
  const mixedWorkloads: readonly GpuSlotWorkload[] = [
    GPU_SPLOT_WORKLOAD.training,
    GPU_SPLOT_WORKLOAD.scraping,
    GPU_SPLOT_WORKLOAD.serving,
    GPU_SPLOT_WORKLOAD.idle,
  ];
  const map = new Map<string, GpuSlotWorkload>();
  if (lightMode === "off") return map;

  for (const preview of previews) {
    const slots = slotsByRack.get(preview.id) ?? [];
    slots.forEach((hardwareId, slotIndex) => {
      if (hardwareId === null) return;
      const workload =
        lightMode === "mixed" ? mixedWorkloads[slotIndex % mixedWorkloads.length] ?? "idle"
        : lightMode;
      map.set(`${preview.id}:${slotIndex}`, workload);
    });
  }

  return map;
}

function PreviewButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded px-2.5 py-1.5 text-xs font-semibold transition",
        active
          ? "bg-brand-teal text-zinc-950 shadow-sm"
          : "bg-white/8 text-zinc-300 hover:bg-white/14 hover:text-white",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function RackLabel({
  preview,
  coolerId,
  gpuMode,
}: {
  preview: (typeof RACK_PREVIEWS)[number];
  coolerId: RackCoolingUnitId | null;
  gpuMode: GpuPreviewMode;
}) {
  const rack = getPreviewRackDefinition(preview.id);
  const slotCount = getRackSlotCapacity(preview.id);
  const cooler = coolerId ? getRackCoolingUnitDefinition(coolerId) : null;

  return (
    <div className="w-48 rounded-md border border-white/15 bg-zinc-950/85 px-2.5 py-2 text-left text-[10px] leading-tight text-zinc-300 shadow-lg backdrop-blur">
      <div className="truncate text-xs font-semibold text-white">{preview.label}</div>
      <div className="mt-1 text-zinc-400">
        {slotCount} slots · {rackTierLabel(slotCount)} · {rack.allowedCoolantTypes.join("/")}
      </div>
      <div className="mt-1 font-medium text-brand-teal">
        {gpuMode === "empty" ? "bare frame" : `${gpuMode} GPUs`} · {cooler ? cooler.name : "no cooler module"}
      </div>
    </div>
  );
}

function DevRackGallery() {
  const [gpuMode, setGpuMode] = useState<GpuPreviewMode>("full");
  const [coolerMode, setCoolerMode] = useState<CoolerPreviewMode>("installed");
  const [lightMode, setLightMode] = useState<ComputeLightPreviewMode>("mixed");
  const [showLabels, setShowLabels] = useState(true);

  const slotsByRack = useMemo(() => {
    return new Map(RACK_PREVIEWS.map((preview) => [preview.id, rackSlots(preview.id, gpuMode)]));
  }, [gpuMode]);

  const workloadMap = useMemo(
    () => buildWorkloadMap(RACK_PREVIEWS, slotsByRack, lightMode),
    [slotsByRack, lightMode],
  );

  const coolerByRack = useMemo(() => {
    return new Map(
      RACK_PREVIEWS.map((preview) => [
        preview.id,
        coolerMode === "installed" ? pickPreviewCooler(preview.id) : null,
      ]),
    );
  }, [coolerMode]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#111719] text-white">
      <Canvas
        camera={{ position: [11.5, 7.5, 18.5], fov: 42, near: 0.1, far: 90 }}
        shadows="percentage"
        gl={{ antialias: true, stencil: false, depth: true }}
        onCreated={({ gl }) => {
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = PCFShadowMap;
        }}
      >
        <color attach="background" args={["#111719"]} />
        <fog attach="fog" args={["#111719", 18, 54]} />
        <ambientLight intensity={0.7} />
        <hemisphereLight args={["#fff6e6", "#223230", 1.05]} />
        <spotLight position={[1.4, 9, 6]} angle={0.78} penumbra={0.55} intensity={140} castShadow shadow-mapSize={[1024, 1024]} color="#fff1dc" />
        <pointLight position={[-7, 3, 4]} intensity={18} color="#e0a95c" />
        <pointLight position={[9, 3, 5]} intensity={25} color="#5fc2a8" />

        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[27, 20]} />
          <meshStandardMaterial color="#35413f" roughness={0.82} metalness={0.05} />
        </mesh>

        {RACK_PREVIEWS.map((preview, index) => {
          const column = index % 4;
          const row = Math.floor(index / 4);
          const x = (column - 1.5) * 4.35 + 1.4;
          const z = row * 4.45 - 4.5;
          const coolerId = coolerByRack.get(preview.id) ?? null;

          return (
            <group key={preview.id}>
              <Rack
                rackId={preview.id}
                rackType={preview.id}
                x={x}
                z={z}
                rotationY={0}
                installedHardwareSlots={slotsByRack.get(preview.id)}
                installedCoolerId={coolerId}
                slotWorkloadMap={workloadMap}
              />
              {showLabels ? (
                <Html position={[x, 3.05, z + 0.1]} center distanceFactor={8} occlude={false}>
                  <RackLabel preview={preview} coolerId={coolerId} gpuMode={gpuMode} />
                </Html>
              ) : null}
            </group>
          );
        })}

        <OrbitControls enablePan enableZoom enableRotate target={[1.4, 1.1, 0.3]} />
      </Canvas>

      <div className="pointer-events-auto absolute left-4 top-4 w-[360px] rounded-md border border-white/10 bg-zinc-950/85 p-3 text-xs text-zinc-200 shadow-xl backdrop-blur">
        <div className="text-sm font-semibold text-white">Rack visual gallery</div>
        <div className="mt-1 text-zinc-400">
          Compare bare frames, GPU modules, cooling modules, compute lights, rack tier, and coolant support.
        </div>

        <div className="mt-3 space-y-3">
          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">GPU modules</div>
            <div className="flex gap-1.5">
              <PreviewButton active={gpuMode === "empty"} onClick={() => setGpuMode("empty")}>Empty</PreviewButton>
              <PreviewButton active={gpuMode === "half"} onClick={() => setGpuMode("half")}>Half</PreviewButton>
              <PreviewButton active={gpuMode === "full"} onClick={() => setGpuMode("full")}>Full</PreviewButton>
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Cooling modules</div>
            <div className="flex gap-1.5">
              <PreviewButton active={coolerMode === "none"} onClick={() => setCoolerMode("none")}>None</PreviewButton>
              <PreviewButton active={coolerMode === "installed"} onClick={() => setCoolerMode("installed")}>Installed</PreviewButton>
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Compute lights</div>
            <div className="flex flex-wrap gap-1.5">
              <PreviewButton active={lightMode === "off"} onClick={() => setLightMode("off")}>Off</PreviewButton>
              <PreviewButton active={lightMode === "mixed"} onClick={() => setLightMode("mixed")}>Mixed</PreviewButton>
              <PreviewButton active={lightMode === GPU_SPLOT_WORKLOAD.training} onClick={() => setLightMode(GPU_SPLOT_WORKLOAD.training)}>Training</PreviewButton>
              <PreviewButton active={lightMode === GPU_SPLOT_WORKLOAD.scraping} onClick={() => setLightMode(GPU_SPLOT_WORKLOAD.scraping)}>Scraping</PreviewButton>
              <PreviewButton active={lightMode === GPU_SPLOT_WORKLOAD.serving} onClick={() => setLightMode(GPU_SPLOT_WORKLOAD.serving)}>Serving</PreviewButton>
            </div>
          </div>

          <label className="flex items-center justify-between rounded border border-white/10 bg-white/5 px-2.5 py-2">
            <span className="font-medium text-zinc-200">Labels</span>
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(event) => setShowLabels(event.currentTarget.checked)}
              className="h-4 w-4 accent-brand-teal"
            />
          </label>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-3 text-[10px] text-zinc-400">
          <div><span className="text-[#f59e0b]">Air</span> ports and fans</div>
          <div><span className="text-[#38bdf8]">Water</span> loops</div>
          <div><span className="text-[#a78bfa]">LN2</span> shell</div>
          <div><span className="text-brand-teal">Pips</span> show tier</div>
          <div><span className="text-[#ff007a]">Training</span> hot pink</div>
          <div><span className="text-[#39ff14]">Scraping</span> green</div>
          <div><span className="text-[#00a3ff]">Serving</span> blue</div>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/dev/racks")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw redirect({ to: "/" });
    }
  },
  component: DevRackGallery,
});

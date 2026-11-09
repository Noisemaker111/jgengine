// @skill jgengine-gameplay
import { Html, Line } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { Group } from "three";
import type { WorldItemRenderConfig } from "@jgengine/core/game/playableGame";
import { resolveWorldItemPresentation } from "@jgengine/core/loot/groundItem";
import { useGameContext } from "@jgengine/react/provider";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { useWorldItems } from "@jgengine/react/hooks";
import { emptyPoseMemo, writePoseIfChanged } from "@jgengine/core/anim/entityPose";
import { POINTER_ENTITY_KEY } from "@jgengine/core/input/pointerService.draw";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";

const DEFAULT_BEAM_HEIGHT = 2.5;
const FALLBACK_COLOR = "#e5e7eb";
const REST_HEIGHT = 0.32;
const SPAWN_DURATION = 0.4;

/**
 * Draw-side form of the marker's meshes: the ground ring and bobbing gem are added under the
 * caller's pose group, which the frame writes the entity pose onto. The beam line and HTML
 * label stay React siblings so they inherit the same pose.
 */
export function worldItemMarkerDraw(getProps: () => {
  ctx: GameContext;
  instanceId: string;
  color: string;
  anchor: Group | null;
}): EngineDraw {
  let anchor: Group | null = null;
  let ring: THREE.Mesh | null = null;
  let ringMaterial: THREE.MeshBasicMaterial | null = null;
  let gem: THREE.Group | null = null;
  let gemMesh: THREE.Mesh | null = null;
  let gemMaterial: THREE.MeshStandardMaterial | null = null;
  const pose = emptyPoseMemo();
  let age = 0;
  return {
    mount() {
      anchor = getProps().anchor;
      if (anchor === null) return;
      ringMaterial = new THREE.MeshBasicMaterial({ color: getProps().color, transparent: true, opacity: 0.85 });
      ring = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.4, 24), ringMaterial);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      gemMaterial = new THREE.MeshStandardMaterial({ color: getProps().color, emissive: getProps().color, emissiveIntensity: 0.6 });
      gem = new THREE.Group();
      gem.position.y = REST_HEIGHT;
      gemMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), gemMaterial);
      gem.add(gemMesh);
      anchor.add(ring, gem);
    },
    update() {
      const color = getProps().color;
      ringMaterial?.color.set(color);
      gemMaterial?.color.set(color);
      if (gemMaterial !== null) gemMaterial.emissive.set(color);
    },
    frame(state: EngineFrameState) {
      const props = getProps();
      if (anchor === null) anchor = props.anchor;
      if (anchor === null) return;
      const live = props.ctx.scene.entity.get(props.instanceId);
      if (live !== null) writePoseIfChanged(anchor, live, pose);
      if (gem === null) return;
      age += state.delta;
      const spawn = age < SPAWN_DURATION ? Math.sin((age / SPAWN_DURATION) * Math.PI) * 0.35 : 0;
      const bob = Math.sin(age * 2.2) * 0.06;
      gem.position.y = REST_HEIGHT + bob + spawn;
      gem.rotation.y = age * 1.6;
    },
    dispose() {
      if (anchor !== null) {
        if (ring !== null) anchor.remove(ring);
        if (gem !== null) anchor.remove(gem);
      }
      ring?.geometry.dispose();
      ringMaterial?.dispose();
      ring = null;
      ringMaterial = null;
      gemMesh?.geometry.dispose();
      gemMaterial?.dispose();
      gem = null;
      gemMesh = null;
      gemMaterial = null;
      anchor = null;
    },
  };
}

function WorldItemMarker({
  instanceId,
  color,
  beam,
  label,
  beamHeight,
}: {
  instanceId: string;
  color: string;
  beam: boolean;
  label: string | undefined;
  beamHeight: number;
}) {
  const ctx = useGameContext();
  const groupRef = useRef<Group>(null);
  const latest = useRef({ ctx, instanceId, color });
  latest.current = { ctx, instanceId, color };
  const beamPoints = useMemo(
    () =>
      [
        [0, 0, 0],
        [0, beamHeight, 0],
      ] as [number, number, number][],
    [beamHeight],
  );
  return (
    <group ref={groupRef} matrixAutoUpdate={false} userData={{ [POINTER_ENTITY_KEY]: instanceId }}>
      <EngineDrawMount
        create={() => worldItemMarkerDraw(() => ({ ...latest.current, anchor: groupRef.current }))}
        deps={[instanceId]}
      />
      {beam ? <Line points={beamPoints} color={color} lineWidth={2} transparent opacity={0.55} /> : null}
      {label !== undefined && label.length > 0 ? (
        <Html position={[0, beamHeight + 0.2, 0]} center distanceFactor={12} zIndexRange={[15, 0]}>
          <div
            className="whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-[11px] font-bold shadow"
            style={{ borderColor: color, color, backgroundColor: "rgba(10,10,14,0.75)" }}
          >
            {label}
          </div>
        </Html>
      ) : null}
    </group>
  );
}

/** Rarity→beam/color/label render binding + loot-filter overlay (#32/#33) for every dropped `worldItem`. */
export function WorldItems({ config }: { config?: WorldItemRenderConfig | undefined }) {
  const ctx = useGameContext();
  const items = useWorldItems();
  const beamHeight = config?.beamHeight ?? DEFAULT_BEAM_HEIGHT;
  return (
    <>
      {items.map((item) => {
        const entity = ctx.scene.entity.get(item.instanceId);
        if (entity === null) return null;
        const presentation = resolveWorldItemPresentation(item, config?.rarityStyle, config?.filter);
        if (presentation.hidden) return null;
        return (
          <WorldItemMarker
            key={item.instanceId}
            instanceId={item.instanceId}
            color={presentation.color ?? FALLBACK_COLOR}
            beam={presentation.beam}
            label={presentation.label}
            beamHeight={beamHeight}
          />
        );
      })}
    </>
  );
}

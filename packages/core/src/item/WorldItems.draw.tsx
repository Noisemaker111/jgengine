/** @jsxImportSource @jgengine/core/ui/jsx */
// @skill jgengine-gameplay
import { useMemo, useRef } from "@jgengine/core/ui/jsx";
import * as THREE from "three";
import type { WorldItemRenderConfig } from "@jgengine/core/game/playableGame";
import { resolveWorldItemPresentation } from "@jgengine/core/loot/groundItem";
import { useGameContext } from "@jgengine/react/provider";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { useWorldItems } from "@jgengine/react/hooks";
import { emptyPoseMemo, writePoseIfChanged } from "@jgengine/core/anim/entityPose";
import { POINTER_ENTITY_KEY } from "@jgengine/core/input/pointerService.draw";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import {
  EngineDrawMount,
  SceneObjectPortal,
  sceneObjectAttachDraw,
  useEngineDraw,
} from "@jgengine/core/frame/useEngineDraw.draw";
import { useEngineHost } from "@jgengine/core/frame/engineHost.draw";
import { useFrameTask } from "@jgengine/core/frame/useFrameTask.draw";
import { CAMERA_POST_FRAME_PRIORITY } from "@jgengine/core/camera/cameraRigs.draw";

const DEFAULT_BEAM_HEIGHT = 2.5;
const FALLBACK_COLOR = "#e5e7eb";
const REST_HEIGHT = 0.32;
const SPAWN_DURATION = 0.4;

/**
 * Draw-side form of the marker's meshes: the ground ring and bobbing gem are added under the
 * caller's pose group, which the frame writes the entity pose onto. The beam line and HTML
 * label stay UI siblings so they inherit the same pose.
 */
export function worldItemMarkerDraw(getProps: () => {
  ctx: GameContext;
  instanceId: string;
  color: string;
  beam: boolean;
  beamHeight: number;
  anchor: THREE.Object3D | null;
}): EngineDraw {
  let anchor: THREE.Object3D | null = null;
  let ring: THREE.Mesh | null = null;
  let ringMaterial: THREE.MeshBasicMaterial | null = null;
  let gem: THREE.Group | null = null;
  let gemMesh: THREE.Mesh | null = null;
  let gemMaterial: THREE.MeshStandardMaterial | null = null;
  let beamMesh: THREE.Mesh | null = null;
  let beamMaterial: THREE.MeshBasicMaterial | null = null;
  let beamKey: string | null = null;
  const pose = emptyPoseMemo();
  let age = 0;
  const syncBeam = () => {
    const props = getProps();
    const key = props.beam ? `${props.color}:${props.beamHeight}` : null;
    if (key === beamKey) return;
    if (beamMesh !== null && anchor !== null) {
      anchor.remove(beamMesh);
      beamMesh.geometry.dispose();
      beamMaterial?.dispose();
      beamMesh = null;
      beamMaterial = null;
    }
    beamKey = key;
    if (key === null || anchor === null) return;
    beamMaterial = new THREE.MeshBasicMaterial({
      color: props.color,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    beamMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, props.beamHeight, 6, 1, true), beamMaterial);
    beamMesh.position.y = props.beamHeight / 2;
    anchor.add(beamMesh);
  };
  return {
    mount() {
      const props = getProps();
      anchor = props.anchor;
      if (anchor === null) return;
      ringMaterial = new THREE.MeshBasicMaterial({ color: props.color, transparent: true, opacity: 0.85 });
      ring = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.4, 24), ringMaterial);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      gemMaterial = new THREE.MeshStandardMaterial({ color: props.color, emissive: props.color, emissiveIntensity: 0.6 });
      gem = new THREE.Group();
      gem.position.y = REST_HEIGHT;
      gemMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), gemMaterial);
      gem.add(gemMesh);
      anchor.add(ring, gem);
      syncBeam();
    },
    update() {
      const props = getProps();
      ringMaterial?.color.set(props.color);
      gemMaterial?.color.set(props.color);
      if (gemMaterial !== null) gemMaterial.emissive.set(props.color);
      beamMaterial?.color.set(props.color);
      syncBeam();
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
        if (beamMesh !== null) anchor.remove(beamMesh);
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
      beamMesh?.geometry.dispose();
      beamMaterial?.dispose();
      beamMesh = null;
      beamMaterial = null;
      beamKey = null;
      anchor = null;
    },
  };
}

/**
 * The marker's UI label, projected each frame with distance scaling
 * `distanceFactor / (2·tan(fov/2)·dist)`.
 */
function WorldItemLabel({
  instanceId,
  label,
  color,
  y,
}: {
  instanceId: string;
  label: string;
  color: string;
  y: number;
}) {
  const ctx = useGameContext();
  const host = useEngineHost();
  const nodeRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef(new THREE.Vector3());
  const cameraRef = useRef(new THREE.Vector3());
  const latest = useRef({ ctx, instanceId, y });
  latest.current = { ctx, instanceId, y };
  useFrameTask(() => {
    const node = nodeRef.current;
    if (node === null) return;
    const { ctx: live, instanceId: id, y: lift } = latest.current;
    const { camera, size } = host.frame;
    const entity = live.scene.entity.get(id);
    if (entity === null) {
      node.style.display = "none";
      return;
    }
    node.style.display = "";
    worldRef.current.set(entity.position[0], entity.position[1] + lift, entity.position[2]);
    const dist = camera.getWorldPosition(cameraRef.current).distanceTo(worldRef.current);
    worldRef.current.project(camera);
    const x = (worldRef.current.x * 0.5 + 0.5) * size.width;
    const py = (-worldRef.current.y * 0.5 + 0.5) * size.height;
    // drei objectScale: perspective → 1/(2·tan(fov/2)·dist), ortho → zoom; × distanceFactor 12.
    const scale =
      camera instanceof THREE.OrthographicCamera
        ? camera.zoom * 12
        : camera instanceof THREE.PerspectiveCamera
          ? 12 / (2 * Math.tan((camera.fov * Math.PI) / 360) * Math.max(dist, 0.001))
          : 12;
    node.style.transform = `translate(${x}px, ${py}px) translate(-50%, -50%) scale(${scale})`;
  }, CAMERA_POST_FRAME_PRIORITY + 0.02);
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 15, pointerEvents: "none" }}>
      <div
        ref={nodeRef}
        style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", whiteSpace: "nowrap" }}
        className="rounded-sm border px-1.5 py-0.5 text-[11px] font-bold shadow"
        data-world-item-label={instanceId}
      >
        <span style={{ borderColor: color, color, backgroundColor: "rgba(10,10,14,0.75)" }}>{label}</span>
      </div>
    </div>
  );
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
  // matrixAutoUpdate=false: the marker draw writes the pose matrix itself via updateMatrix().
  const group = useMemo(() => {
    const next = new THREE.Group();
    next.matrixAutoUpdate = false;
    next.userData = { [POINTER_ENTITY_KEY]: instanceId };
    return next;
  }, [instanceId]);
  const latest = useRef({ ctx, instanceId, color, beam, beamHeight });
  latest.current = { ctx, instanceId, color, beam, beamHeight };
  useEngineDraw(() => sceneObjectAttachDraw(group, true), [group]);
  const showLabel = label !== undefined && label.length > 0;
  return (
    <SceneObjectPortal object={group}>
      <EngineDrawMount
        create={() => worldItemMarkerDraw(() => ({ ...latest.current, anchor: group }))}
        deps={[instanceId]}
      />
      {showLabel ? (
        <WorldItemLabel instanceId={instanceId} label={label ?? ""} color={color} y={beamHeight + 0.2} />
      ) : null}
    </SceneObjectPortal>
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

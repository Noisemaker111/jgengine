import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type ComponentType, type ReactNode } from "react";
import * as THREE from "three";

import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { objectVisualScale, type SceneObject } from "@jgengine/core/scene/objectStore";
import { WORLD_ITEM_ENTITY_NAME } from "@jgengine/core/game/worldItem";
import type { EntitySpriteConfig, ModelConfig, ObjectStyle } from "@jgengine/core/game/playableGame";
import type { PresencePoseRow } from "@jgengine/core/runtime/transport";
import { useGameContext } from "@jgengine/react/provider";
import { useSceneEntityIds, useSceneObjectIds, useGameStore, usePlayer, useTarget } from "@jgengine/react/hooks";

import { colorFromId } from "../worldSky";
import { DefaultSurface, detailMaps } from "../render/defaultSurface";
import { EntitySprite, IsolatedEntityModel } from "../render/SceneModels";
import { resolveModel, resolveEntityModel, tryResolveCatalogModel } from "../render/resolveModel";
import { useRenderVisibility } from "../visibility/CullingProvider";
import { writeEntityPose } from "./entityPose";
import { POINTER_ENTITY_KEY, POINTER_OBJECT_KEY } from "../pointer/pointerService";

const GROUND_SIZE = 160;
const GROUND_SEGMENTS = 80;

function EntityMarker({
  entity,
  custom,
  model,
  sprite,
  isLocal,
  targeted,
  selected,
  onSelect,
}: {
  entity: SceneEntity;
  custom: ReactNode | undefined;
  model: ModelConfig | undefined;
  sprite: EntitySpriteConfig | undefined;
  isLocal: boolean;
  targeted: boolean;
  selected: boolean;
  onSelect: (entity: SceneEntity) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const ctx = useGameContext();
  const visibleRef = useRenderVisibility();
  const entityId = entity.id;
  const role = entity.role;
  const name = entity.name;
  const color = isLocal ? "#4ade80" : role === "npc" ? colorFromId(name) : "#9ca3af";

  useFrame(() => {
    const group = groupRef.current;
    if (group === null) return;
    const live = ctx.scene.entity.get(entityId);
    if (live === null) return;
    writeEntityPose(group, live);
    group.visible = visibleRef.current(entityId);
  });

  return (
    <group
      ref={groupRef}
      userData={{ [POINTER_ENTITY_KEY]: entityId }}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (isLocal) return;
        const live = ctx.scene.entity.get(entityId);
        if (live !== null) onSelect(live);
      }}
    >
      {selected ? (
        <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
          <ringGeometry args={[0.8, 0.95, 32]} />
          <meshBasicMaterial color="#34d399" transparent opacity={0.9} />
        </mesh>
      ) : null}
      {custom !== undefined && custom !== null ? (
        custom
      ) : model !== undefined ? (
        <IsolatedEntityModel
          model={model}
          instanceId={entityId}
          fallback={sprite !== undefined ? <EntitySprite sprite={sprite} /> : undefined}
        />
      ) : sprite !== undefined ? (
        <EntitySprite sprite={sprite} />
      ) : role === "prop" ? (
        <mesh position-y={0.5} castShadow receiveShadow>
          <sphereGeometry args={[0.45, 24, 24]} />
          <DefaultSurface color={color} />
        </mesh>
      ) : (
        <group scale={ctx.scene.entity.visualScaleOf(entityId)}>
          <mesh position-y={0.95} castShadow receiveShadow>
            <capsuleGeometry args={[0.35, 1.1, 6, 14]} />
            <DefaultSurface color={color} roughness={0.6} />
          </mesh>
          <mesh position={[0, 1.35, 0.32]}>
            <boxGeometry args={[0.16, 0.16, 0.16]} />
            <meshStandardMaterial color="#f8fafc" />
          </mesh>
        </group>
      )}
      {targeted ? (
        <mesh rotation-x={-Math.PI / 2} position-y={0.03}>
          <ringGeometry args={[0.6, 0.75, 28]} />
          <meshBasicMaterial color="#f87171" />
        </mesh>
      ) : null}
    </group>
  );
}

function ObjectMarker({
  object,
  custom,
  model,
  style,
}: {
  object: SceneObject;
  custom: ReactNode | undefined;
  model: ModelConfig | undefined;
  style: ObjectStyle | undefined;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const ctx = useGameContext();
  const visibleRef = useRenderVisibility();
  const instanceId = object.instanceId;
  const [scaleX, scaleY, scaleZ] = objectVisualScale(object.visual);
  const color = object.visual?.color ?? style?.color ?? colorFromId(object.catalogId);
  const opacity = object.visual?.opacity ?? style?.opacity ?? 1;

  useFrame(() => {
    const group = groupRef.current;
    if (group === null) return;
    const live = ctx.scene.object.get(instanceId);
    if (live === null) return;
    writeEntityPose(group, live);
    group.visible = visibleRef.current(instanceId);
  });

  return (
    <group ref={groupRef} userData={{ [POINTER_OBJECT_KEY]: instanceId }}>
      {custom !== undefined && custom !== null ? (
        custom
      ) : model !== undefined ? (
        <IsolatedEntityModel model={model} instanceId={instanceId} />
      ) : style?.hidden === true ? null : (
        <mesh position-y={0.5 * scaleY} scale={[scaleX, scaleY, scaleZ]} castShadow receiveShadow>
          <boxGeometry args={[1, 1, 1]} />
          <DefaultSurface color={color} transparent={opacity < 1} opacity={opacity} />
        </mesh>
      )}
    </group>
  );
}

function GroundPlane() {
  const geometry = useMemo(() => {
    const next = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, GROUND_SEGMENTS, GROUND_SEGMENTS);
    const positions = next.attributes.position;
    const base = new THREE.Color("#33452f");
    const high = new THREE.Color("#4a5c3a");
    const colors = new Float32Array(positions.count * 3);
    const tmp = new THREE.Color();
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      const height =
        Math.sin(x * 0.16) * 0.12 +
        Math.cos(y * 0.11) * 0.1 +
        Math.sin((x + y) * 0.05) * 0.16;
      positions.setZ(index, height);
      const blend = 0.5 + Math.sin(x * 0.21) * 0.25 + Math.cos(y * 0.17) * 0.25;
      tmp.copy(base).lerp(high, Math.min(1, Math.max(0, blend)));
      colors[index * 3] = tmp.r;
      colors[index * 3 + 1] = tmp.g;
      colors[index * 3 + 2] = tmp.b;
    }
    next.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    next.computeVertexNormals();
    return next;
  }, []);
  const material = useMemo(() => {
    const normal = detailMaps().normal.clone();
    normal.repeat.set(48, 48);
    normal.needsUpdate = true;
    return new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0,
      normalMap: normal,
      normalScale: new THREE.Vector2(0.8, 0.8),
      envMapIntensity: 0.4,
    });
  }, []);
  useEffect(() => () => material.dispose(), [material]);

  return <mesh rotation-x={-Math.PI / 2} geometry={geometry} material={material} receiveShadow />;
}

function RockField() {
  const rocks = useMemo(
    () =>
      Array.from({ length: 18 }, (_, index) => {
        const angle = index * 2.399963229728653;
        const radius = 10 + ((index * 17) % 58);
        return {
          id: `rock-${index}`,
          x: Math.cos(angle) * radius,
          z: Math.sin(angle) * radius,
          scale: 0.45 + ((index * 13) % 11) / 10,
          rotation: angle,
        };
      }),
    [],
  );

  return (
    <>
      {rocks.map((rock) => (
        <mesh
          key={rock.id}
          position={[rock.x, 0.25 * rock.scale, rock.z]}
          rotation={[0.1, rock.rotation, -0.08]}
          scale={[rock.scale * 1.4, rock.scale * 0.7, rock.scale]}
          castShadow
          receiveShadow
        >
          <dodecahedronGeometry args={[0.8, 1]} />
          <DefaultSurface color="#6b6f63" roughness={0.95} />
        </mesh>
      ))}
    </>
  );
}

function WorldEnvironment({ environment: Environment }: { environment: ComponentType | undefined }) {
  if (Environment !== undefined) return <Environment />;
  return (
    <>
      <GroundPlane />
      <RockField />
    </>
  );
}

function WorldActors({
  entitySprites,
  entityModels,
  objectModels,
  objectStyles,
  assets,
  renderEntity,
  renderObject,
  selectedIds,
  hideLocalActor,
}: {
  entitySprites: Record<string, EntitySpriteConfig> | undefined;
  entityModels: Record<string, string | ModelConfig> | undefined;
  objectModels: Record<string, string | ModelConfig> | undefined;
  objectStyles: Record<string, ObjectStyle> | undefined;
  assets: AssetCatalog;
  renderEntity: ((entity: SceneEntity) => ReactNode) | undefined;
  renderObject: ((object: SceneObject) => ReactNode) | undefined;
  selectedIds: ReadonlySet<string>;
  hideLocalActor: boolean;
}) {
  const ctx = useGameContext();
  const entityIds = useSceneEntityIds();
  const objectIds = useSceneObjectIds();
  const player = usePlayer();
  const targetId = useTarget(player.userId);
  const controlledId = useGameStore((c) => c.player.possession.active(player.userId));
  const handleSelect = (entity: SceneEntity) => {
    const relation = ctx.scene.entity.canReceive(entity.id, "damage") === null ? "hostile" : "friendly";
    ctx.scene.entity.setTarget(controlledId, relation === "hostile" || entity.role === "npc" ? entity.id : null);
  };
  return (
    <>
      {entityIds.map((entityId) => {
        const entity = ctx.scene.entity.get(entityId);
        if (entity === null || entity.name === WORLD_ITEM_ENTITY_NAME) return null;
        if (hideLocalActor && entityId === controlledId) return null;
        return (
          <EntityMarker
            key={entityId}
            entity={entity}
            custom={renderEntity?.(entity)}
            model={resolveEntityModel(entityModels?.[entity.name], assets, entity.name)}
            sprite={entitySprites?.[entity.name]}
            isLocal={entityId === controlledId}
            targeted={entityId === targetId}
            selected={selectedIds.has(entityId)}
            onSelect={handleSelect}
          />
        );
      })}
      {objectIds.map((instanceId) => {
        const object = ctx.scene.object.get(instanceId);
        if (object === null) return null;
        const model =
          resolveModel(objectModels?.[object.catalogId], assets, {
            seam: "objectModels",
            key: object.catalogId,
          }) ?? tryResolveCatalogModel(object.catalogId, assets);
        return (
          <ObjectMarker
            key={instanceId}
            object={object}
            custom={renderObject?.(object)}
            model={model}
            style={objectStyles?.[object.catalogId]}
          />
        );
      })}
    </>
  );
}

export function WorldView({
  entitySprites,
  entityModels,
  objectModels,
  objectStyles,
  environment,
  assets,
  renderEntity,
  renderObject,
  selectedIds,
  hideLocalActor,
}: {
  entitySprites: Record<string, EntitySpriteConfig> | undefined;
  entityModels: Record<string, string | ModelConfig> | undefined;
  objectModels: Record<string, string | ModelConfig> | undefined;
  objectStyles: Record<string, ObjectStyle> | undefined;
  environment: ComponentType | undefined;
  assets: AssetCatalog;
  renderEntity: ((entity: SceneEntity) => ReactNode) | undefined;
  renderObject: ((object: SceneObject) => ReactNode) | undefined;
  selectedIds: ReadonlySet<string>;
  hideLocalActor: boolean;
}) {
  return (
    <>
      <WorldEnvironment environment={environment} />
      <WorldActors
        entitySprites={entitySprites}
        entityModels={entityModels}
        objectModels={objectModels}
        objectStyles={objectStyles}
        assets={assets}
        renderEntity={renderEntity}
        renderObject={renderObject}
        selectedIds={selectedIds}
        hideLocalActor={hideLocalActor}
      />
    </>
  );
}

export function RemotePlayers({ rows }: { rows: PresencePoseRow[] }) {
  return (
    <>
      {rows.map((row) => (
        <group
          key={row.userId}
          position={[row.position.x, row.position.y, row.position.z]}
          rotation-y={row.rotationY}
        >
          <mesh position-y={0.95}>
            <capsuleGeometry args={[0.35, 1.1, 6, 14]} />
            <meshStandardMaterial color={colorFromId(row.userId)} />
          </mesh>
          <mesh position={[0, 1.35, 0.32]}>
            <boxGeometry args={[0.16, 0.16, 0.16]} />
            <meshStandardMaterial color="#f8fafc" />
          </mesh>
        </group>
      ))}
    </>
  );
}

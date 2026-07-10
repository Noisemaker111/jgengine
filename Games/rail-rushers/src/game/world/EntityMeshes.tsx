import type { SceneEntity } from "@jgengine/core/scene/entityStore";

import { HANDCAR_ENTITY, trainCatalogId } from "../entities/catalog";
import { TRAINS, trainById, type TrainDef } from "../rail/schedule";

const POSTER_BRASS = "#a98467";
const POSTER_CREAM = "#f2e8cf";
const POSTER_COAL = "#6b705c";

function HandcarMesh() {
  return (
    <group>
      <mesh position-y={0.42} castShadow>
        <boxGeometry args={[1.3, 0.14, 1.9]} />
        <meshStandardMaterial color={POSTER_BRASS} roughness={0.75} metalness={0.15} />
      </mesh>
      {[
        [-0.55, -0.75],
        [0.55, -0.75],
        [-0.55, 0.75],
        [0.55, 0.75],
      ].map(([x, z], index) => (
        <mesh key={index} position={[x!, 0.22, z!]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.22, 0.22, 0.16, 12]} />
          <meshStandardMaterial color={POSTER_COAL} roughness={0.9} metalness={0.1} />
        </mesh>
      ))}
      <mesh position={[-0.32, 0.85, 0]} castShadow>
        <boxGeometry args={[0.1, 0.7, 0.1]} />
        <meshStandardMaterial color={POSTER_COAL} roughness={0.6} metalness={0.3} />
      </mesh>
      <mesh position={[0.32, 0.85, 0]} castShadow>
        <boxGeometry args={[0.1, 0.7, 0.1]} />
        <meshStandardMaterial color={POSTER_COAL} roughness={0.6} metalness={0.3} />
      </mesh>
      <mesh position={[0, 1.18, 0]} castShadow>
        <boxGeometry args={[0.9, 0.1, 0.14]} />
        <meshStandardMaterial color="#bc4749" roughness={0.5} metalness={0.35} />
      </mesh>
      <mesh position={[0, 0.5, 0.75]} castShadow>
        <boxGeometry args={[1.1, 0.55, 0.06]} />
        <meshStandardMaterial color={POSTER_CREAM} roughness={0.7} />
      </mesh>
    </group>
  );
}

function TrainMesh({ train }: { train: TrainDef }) {
  const bodyLength = train.role === "express" ? 5.4 : train.role === "local" ? 4.2 : 3.6;
  const bodyHeight = train.role === "freight" ? 1.5 : 1.7;
  return (
    <group>
      <mesh position-y={bodyHeight / 2 + 0.35} castShadow>
        <boxGeometry args={[1.7, bodyHeight, bodyLength]} />
        <meshStandardMaterial color={train.livery.body} roughness={0.55} metalness={0.25} />
      </mesh>
      <mesh position={[0, bodyHeight + 0.35, bodyLength / 2 - 0.6]} castShadow>
        <boxGeometry args={[1.5, 0.55, 1.1]} />
        <meshStandardMaterial color={train.livery.trim} roughness={0.6} metalness={0.15} />
      </mesh>
      {train.role !== "freight" && (
        <mesh position={[0, bodyHeight + 0.9, bodyLength / 2 + 0.3]} castShadow>
          <cylinderGeometry args={[0.28, 0.34, 0.9, 12]} />
          <meshStandardMaterial color={POSTER_COAL} roughness={0.7} metalness={0.2} />
        </mesh>
      )}
      <mesh position={[0, bodyHeight + 0.55, -bodyLength / 2 - 0.05]}>
        <sphereGeometry args={[0.16, 10, 10]} />
        <meshStandardMaterial color={train.livery.lantern} emissive={train.livery.lantern} emissiveIntensity={1.4} />
      </mesh>
      <mesh position={[0, bodyHeight + 0.55, bodyLength / 2 + 0.05]}>
        <sphereGeometry args={[0.16, 10, 10]} />
        <meshStandardMaterial color={train.livery.lantern} emissive={train.livery.lantern} emissiveIntensity={1.4} />
      </mesh>
      {[
        [-0.9, -bodyLength / 3],
        [0.9, -bodyLength / 3],
        [-0.9, 0],
        [0.9, 0],
        [-0.9, bodyLength / 3],
        [0.9, bodyLength / 3],
      ].map(([x, z], index) => (
        <mesh key={index} position={[x!, 0.32, z!]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.32, 0.32, 0.2, 14]} />
          <meshStandardMaterial color="#101014" roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

const TRAIN_CATALOG_IDS = new Set(TRAINS.map((train) => trainCatalogId(train.id)));

export function renderMover(entity: SceneEntity) {
  if (entity.name === HANDCAR_ENTITY) return <HandcarMesh />;
  if (TRAIN_CATALOG_IDS.has(entity.name)) {
    const trainId = entity.name.replace("train_", "");
    return <TrainMesh train={trainById(trainId)} />;
  }
  return null;
}

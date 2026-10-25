import {
  getBuildPropMaterialPresentation,
  type BuildPropMaterialPresentation,
} from "@llmville/game/build/build";
import type { BuildDirection, PlaceableBuildItemId } from "@llmville/game/build/catalog";
import { AssetFrameGizmo, useShowAssetFrames } from "@/scene/components/AssetFrameGizmo";
import { SceneModel } from "@/scene/components/SceneModel";
import { resolveWebBuildItemPlacementBounds3d } from "@/scene/buildItemBounds";
import { getWorldModelAsset } from "@llmville/game/world/worldModelCatalog";

interface BuildPropProps {
  itemId: PlaceableBuildItemId;
  x: number;
  y: number;
  z: number;
  direction: BuildDirection;
  ghost?: boolean;
  isValid?: boolean;
}

function BuildPropShape({
  itemId,
  style,
  ghost,
  direction,
}: {
  itemId: PlaceableBuildItemId;
  style: BuildPropMaterialPresentation;
  ghost: boolean;
  direction: BuildDirection;
}) {
  const modelAsset = getWorldModelAsset(itemId);
  if (!ghost && modelAsset?.modelPath) {
    return <SceneModel asset={modelAsset} placementDirection={direction} />;
  }

  if (itemId === "neon_sign") {
    return (
      <>
        <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.15, 1.1, 0.12]} />
          <meshStandardMaterial {...style} metalness={0.7} roughness={0.2} />
        </mesh>
        <mesh position={[0, 1.15, 0.06]} castShadow>
          <boxGeometry args={[0.95, 0.48, 0.08]} />
          <meshStandardMaterial {...style} emissiveIntensity={style.emissiveIntensity + 0.2} metalness={0.4} roughness={0.25} />
        </mesh>
      </>
    );
  }

  if (itemId === "potted_plant") {
    return (
      <>
        <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.23, 0.3, 0.35, 16]} />
          <meshStandardMaterial {...style} color={style.transparent ? style.color : "#7c2d12"} emissive={style.emissive} />
        </mesh>
        <mesh position={[0, 0.62, 0]} castShadow>
          <sphereGeometry args={[0.28, 18, 12]} />
          <meshStandardMaterial
            {...style}
            color={style.transparent ? style.color : "#16a34a"}
            emissive={style.transparent ? style.emissive : "#16a34a"}
            emissiveIntensity={style.transparent ? style.emissiveIntensity : 0.35}
          />
        </mesh>
      </>
    );
  }

  if (itemId === "holo_poster") {
    return (
      <>
        <mesh position={[0, 0.7, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.08, 1.4, 0.08]} />
          <meshStandardMaterial {...style} metalness={0.8} roughness={0.2} />
        </mesh>
        <mesh position={[0, 1.2, 0.12]} castShadow>
          <boxGeometry args={[1.1, 0.75, 0.05]} />
          <meshStandardMaterial {...style} emissiveIntensity={style.emissiveIntensity + 0.25} metalness={0.3} roughness={0.15} />
        </mesh>
      </>
    );
  }

  if (itemId === "beanbag_corner") {
    return (
      <mesh position={[0, 0.25, 0]} scale={[1.2, 0.65, 1]} castShadow receiveShadow>
        <sphereGeometry args={[0.5, 24, 16]} />
        <meshStandardMaterial
          {...style}
          color={style.transparent ? style.color : "#f59e0b"}
          emissive={style.transparent ? style.emissive : "#f59e0b"}
          emissiveIntensity={style.transparent ? style.emissiveIntensity : 0.15}
          roughness={0.55}
        />
      </mesh>
    );
  }

  if (itemId === "coffee_cart") {
    return (
      <>
        <mesh position={[0, 0.4, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.95, 0.55, 0.55]} />
          <meshStandardMaterial {...style} color={style.transparent ? style.color : "#334155"} emissive={style.emissive} metalness={0.5} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.74, 0]} castShadow>
          <boxGeometry args={[1.05, 0.08, 0.65]} />
          <meshStandardMaterial {...style} color={style.transparent ? style.color : "#cbd5e1"} emissive={style.emissive} />
        </mesh>
        {[
          [-0.35, 0.12, -0.22],
          [0.35, 0.12, -0.22],
          [-0.35, 0.12, 0.22],
          [0.35, 0.12, 0.22],
        ].map(([wheelX, wheelY, wheelZ]) => (
          <mesh key={`${wheelX}-${wheelZ}`} position={[wheelX, wheelY, wheelZ]} castShadow>
            <cylinderGeometry args={[0.08, 0.08, 0.06, 12]} />
            <meshStandardMaterial {...style} color={style.transparent ? style.color : "#0f172a"} emissive={style.emissive} />
          </mesh>
        ))}
      </>
    );
  }

  return (
    <>
      <mesh position={[0, 0.6, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.1, 1.2, 0.1]} />
        <meshStandardMaterial {...style} metalness={0.7} roughness={0.2} />
      </mesh>
      <mesh position={[0, 1.05, 0.08]} castShadow>
        <boxGeometry args={[1.25, 0.78, 0.05]} />
        <meshStandardMaterial
          {...style}
          color={style.transparent ? style.color : "#e2e8f0"}
          emissive={style.transparent ? style.emissive : "#22d3ee"}
          emissiveIntensity={style.transparent ? style.emissiveIntensity : 0.2}
        />
      </mesh>
    </>
  );
}

function BuildPlacementWireframe({
  itemId,
  x,
  y,
  z,
  direction,
  isValid,
}: {
  itemId: PlaceableBuildItemId;
  x: number;
  y: number;
  z: number;
  direction: BuildDirection;
  isValid: boolean;
}) {
  const modelAsset = getWorldModelAsset(itemId);
  if (!modelAsset?.modelPath) return null;

  const bounds3d = resolveWebBuildItemPlacementBounds3d(itemId, { x, z }, direction, y);
  if (!bounds3d) return null;

  const cx = (bounds3d.minX + bounds3d.maxX) / 2;
  const cy = (bounds3d.minY + bounds3d.maxY) / 2;
  const cz = (bounds3d.minZ + bounds3d.maxZ) / 2;
  const w = bounds3d.maxX - bounds3d.minX;
  const h = bounds3d.maxY - bounds3d.minY;
  const d = bounds3d.maxZ - bounds3d.minZ;

  return (
    <mesh position={[cx - x, cy - y, cz - z]}>
      <boxGeometry args={[w, h, d]} />
      <meshBasicMaterial color={isValid ? "#f59e0b" : "#fb7185"} transparent opacity={0.35} wireframe />
    </mesh>
  );
}

export default function BuildProp({ itemId, x, y, z, direction, ghost = false, isValid = true }: BuildPropProps) {
  const style = getBuildPropMaterialPresentation(ghost, isValid);
  const modelAsset = getWorldModelAsset(itemId);
  const showFrames = useShowAssetFrames();

  return (
    <group position={[x, y, z]}>
      <BuildPropShape itemId={itemId} style={style} ghost={ghost} direction={direction} />
      {ghost && (
        <BuildPlacementWireframe
          itemId={itemId}
          x={x}
          y={y}
          z={z}
          direction={direction}
          isValid={isValid}
        />
      )}
      {showFrames && modelAsset && (
        <AssetFrameGizmo footprint={modelAsset.footprint} direction={direction} label={itemId} />
      )}
    </group>
  );
}

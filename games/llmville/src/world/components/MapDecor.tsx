import { Component, Suspense, useEffect, type ErrorInfo, type ReactNode } from "react";
import {
  getDecorModelId,
  getDecorRotation,
  getDecorWorldPosition,
} from "@llmville/game/world/mapDecor";
import type { DecorItemSpec } from "@llmville/game/world/mapTypes";
import { clearWorldModelDiagnostic, reportWorldModelDiagnostic } from "@/scene/worldModelDiagnostics";
import { rotationYToCardinal } from "@llmville/game/world/cardinal";
import { AssetFrameGizmo, useShowAssetFrames } from "@/scene/components/AssetFrameGizmo";
import { getWorldModelAsset, type WorldModelAsset } from "@llmville/game/world/worldModelCatalog";
import type { GridFootprint, MapGridSpec } from "@llmville/game/world/grid";
import { getProceduralProp, ProceduralProp } from "@/world/diorama/props";

import { SceneModel } from "@/scene/components/SceneModel";

/**
 * Renders a tree of DecorItemSpec nodes from a JSON map file.
 * Supports box, plane, cylinder, sphere, and nested groups.
 */
type ModelLoadingFallback = "decor" | "none";

export function MapDecor({
  items,
  grid,
  modelLoadingFallback = "decor",
}: {
  items: readonly DecorItemSpec[];
  grid?: MapGridSpec | null;
  modelLoadingFallback?: ModelLoadingFallback;
}) {
    return (
        <>
            {items.map((item, index) => (
                <DecorNode key={index} spec={item} grid={grid} modelLoadingFallback={modelLoadingFallback} />
            ))}
        </>
    );
}

function DecorNode({
  spec,
  grid,
  modelLoadingFallback,
}: {
  spec: DecorItemSpec;
  grid?: MapGridSpec | null;
  modelLoadingFallback: ModelLoadingFallback;
}) {
  const modelId = getDecorModelId(spec);
  const modelAsset = getWorldModelAsset(modelId);
  const position = getDecorWorldPosition(spec, grid);
  const rotation = getDecorRotation(spec);
  const showFrames = useShowAssetFrames();
  const rotationY = rotation?.[1] ?? 0;
  const direction = rotationYToCardinal(rotationY);
  const scale = typeof spec.scale === "number" ? [spec.scale, spec.scale, spec.scale] as [number, number, number] : spec.scale;

  // Canonical GLB from worldModelCatalog — bounds and render share SceneModel.
  if (modelAsset?.modelPath) {
    const fallback = <DecorFallbackNode spec={spec} grid={grid} />;
    const loadingFallback = modelLoadingFallback === "none" ? null : fallback;
    return (
      <>
        <DecorModelBoundary
          key={modelAsset.modelPath}
          diagnosticKey={spec.id ?? modelAsset.modelPath}
          label={spec.id ?? modelAsset.label}
          modelPath={modelAsset.modelPath}
          fallback={fallback}
        >
          <Suspense fallback={loadingFallback}>
            <DecorModelContent
              diagnosticKey={spec.id ?? modelAsset.modelPath}
              asset={modelAsset}
              position={position}
              rotation={rotation}
              scale={typeof spec.scale === "number" ? [spec.scale, spec.scale, spec.scale] : spec.scale}
              castShadow={spec.castShadow ?? true}
              receiveShadow={spec.receiveShadow ?? true}
              footprint={spec.footprint}
            />
          </Suspense>
        </DecorModelBoundary>
        {showFrames && (
          <group position={position}>
            <AssetFrameGizmo
              footprint={spec.footprint ?? modelAsset.footprint}
              direction={direction}
              label={spec.id ?? modelAsset.label}
            />
          </group>
        )}
      </>
    );
  }

  // Legacy procedural diorama — only when no catalog GLB exists.
  if (modelId && getProceduralProp(modelId)) {
    return (
      <>
        <ProceduralProp
          modelKey={modelId}
          position={position}
          rotation={rotation}
          scale={scale}
          castShadow={spec.castShadow ?? true}
          receiveShadow={spec.receiveShadow ?? true}
        />
        {showFrames && (
          <group position={position}>
            <AssetFrameGizmo
              footprint={spec.footprint ?? modelAsset?.footprint}
              direction={direction}
              label={spec.id ?? modelAsset?.label ?? modelId}
            />
          </group>
        )}
      </>
    );
  }

  return <DecorFallbackNode spec={spec} grid={grid} />;
}

function DecorFallbackNode({ spec, grid }: { spec: DecorItemSpec; grid?: MapGridSpec | null }) {
  const position = getDecorWorldPosition(spec, grid);
  const rotation = getDecorRotation(spec);
  const scale = typeof spec.scale === "number" ? [spec.scale, spec.scale, spec.scale] as [number, number, number] : spec.scale;
  const fallbackColor = spec.color ?? (spec.type === "model" ? "#64748b" : "#94a3b8");

  if (spec.type === "group") {
    return (
      <group
        position={position}
        rotation={rotation}
        scale={scale}
      >
        {spec.children?.map((child, index) => (
          <DecorFallbackNode key={index} spec={child} grid={grid} />
        ))}
      </group>
    );
  }

  return (
    <mesh
      position={position}
      rotation={rotation}
      scale={scale}
      castShadow={spec.castShadow ?? false}
      receiveShadow={spec.receiveShadow ?? false}
    >
      <DecorGeometry spec={spec} />
            <meshStandardMaterial
                color={fallbackColor}
                roughness={spec.roughness ?? 0.8}
                metalness={spec.metalness ?? 0}
                emissive={spec.emissive}
                emissiveIntensity={spec.emissiveIntensity}
                side={spec.doubleSide ? 2 : 0}
            />
        </mesh>
    );
}

function DecorModelContent({
    diagnosticKey,
    asset,
    position,
    rotation,
    scale,
    castShadow,
    receiveShadow,
    footprint,
}: {
  diagnosticKey: string;
  asset: WorldModelAsset;
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number] | number;
  castShadow: boolean;
  receiveShadow: boolean;
  footprint?: GridFootprint;
}) {
  useEffect(() => {
    clearWorldModelDiagnostic(diagnosticKey);
    }, [diagnosticKey]);

    return (
        <SceneModel
            asset={asset}
            position={position}
            rotation={rotation}
            scale={scale}
            castShadow={castShadow}
            receiveShadow={receiveShadow}
            footprint={footprint}
        />
  );
}

interface DecorModelBoundaryProps {
  diagnosticKey: string;
  label: string;
  modelPath: string;
  fallback: ReactNode;
  children: ReactNode;
}

interface DecorModelBoundaryState {
  hasError: boolean;
}

class DecorModelBoundary extends Component<DecorModelBoundaryProps, DecorModelBoundaryState> {
  override state: DecorModelBoundaryState = { hasError: false };

  static getDerivedStateFromError(): DecorModelBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown, _errorInfo: ErrorInfo) {
    const message = error instanceof Error ? error.message : "Unknown world model failure.";
    reportWorldModelDiagnostic({
      key: this.props.diagnosticKey,
      label: this.props.label,
      modelPath: this.props.modelPath,
      message,
    });
  }

  override render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}

export function collectDecorModelPaths(items: readonly DecorItemSpec[]): readonly string[] {
  const paths = new Set<string>();

  const visit = (item: DecorItemSpec) => {
    const modelId = getDecorModelId(item);
    const modelAsset = getWorldModelAsset(modelId);
    if (modelId && getProceduralProp(modelId) && !modelAsset?.modelPath) {
      item.children?.forEach(visit);
      return;
    }
    if (modelAsset?.modelPath) {
      paths.add(modelAsset.modelPath);
    }

    item.children?.forEach(visit);
  };

  items.forEach(visit);

  return Array.from(paths);
}

function DecorGeometry({ spec }: { spec: DecorItemSpec }) {
    const args = spec.args ?? [];
    switch (spec.type) {
        case "box":
            return <boxGeometry args={args as [number, number, number]} />;
        case "plane":
            return <planeGeometry args={args as [number, number]} />;
        case "cylinder":
            return <cylinderGeometry args={args as [number, number, number, number]} />;
        case "sphere":
            return <sphereGeometry args={args as [number, number, number]} />;
        case "model":
            return <boxGeometry args={(args.length >= 3 ? args : [1, 1, 1]) as [number, number, number]} />;
        default:
            return null;
    }
}

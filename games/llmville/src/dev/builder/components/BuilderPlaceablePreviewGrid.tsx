import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import { useThree } from "@react-three/fiber";
import { Box3, Group, OrthographicCamera, Vector3 } from "three";

import { cn } from "@/components/ui/cn";
import {
  DomViewportCanvas,
  DomViewportScrollProvider,
} from "@/dev/builder/components/DomViewportCanvas";
import { BUILDER_CSS } from "@/dev/builder/components/builderStyles";
import { centerDecorAtOrigin } from "@llmville/game/builder/placement";
import { BuilderStore } from "@/dev/builder/builderStore";
import type { BuilderPlaceableItem } from "@/dev/builder/builderPlaceableCatalog";
import { collectDecorModelPaths, MapDecor } from "@/world/components/MapDecor";
import { preloadSceneModel } from "@/scene/components/SceneModel";
import { getModelBoundsSnapshot, subscribeModelBounds } from "@/scene/modelBoundsCache";
import { getWorldModelAsset } from "@llmville/game/world/worldModelCatalog";
import type { DecorItemSpec } from "@llmville/game/world/mapTypes";
import type { MapGridSpec } from "@llmville/game/world/grid";

const PREVIEW_GRID: MapGridSpec = {
  tileSize: 1,
  tilesX: 10,
  tilesZ: 10,
  originX: 0,
  originZ: 0,
  wallThicknessTiles: 1,
};

export type BuilderPreviewSection = {
  label: string;
  items: readonly BuilderPlaceableItem[];
  onItemClick: (item: BuilderPlaceableItem) => void;
  isItemActive: (item: BuilderPlaceableItem) => boolean;
};

/** Preloads models and provides scroll context for lazy preview canvases. */
export function BuilderAssetPreviewRoot({
  children,
  preloadItems,
  scrollRef,
}: {
  children: ReactNode;
  preloadItems: readonly BuilderPlaceableItem[];
  scrollRef?: RefObject<HTMLElement | null>;
}) {
  useEffect(() => {
    for (const path of collectPlaceableModelPaths(preloadItems)) {
      preloadSceneModel(path);
    }
  }, [preloadItems]);

  return (
    <DomViewportScrollProvider scrollRef={scrollRef}>
      {children}
    </DomViewportScrollProvider>
  );
}

export function BuilderPlaceablePreviewSection({
  label,
  items,
  onItemClick,
  isItemActive,
  hideLabel = false,
}: {
  label: string;
  items: readonly BuilderPlaceableItem[];
  onItemClick: (item: BuilderPlaceableItem) => void;
  isItemActive: (item: BuilderPlaceableItem) => boolean;
  hideLabel?: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <section>
      {!hideLabel && label ? (
        <p className={cn(BUILDER_CSS.propsSectionLabel, "mb-2")}>{label}</p>
      ) : null}
      <ul className={BUILDER_CSS.previewCardGrid}>
        {items.map((item) => (
          <li key={item.id} className="min-w-0">
            <PlaceablePreviewButton
              item={item}
              active={isItemActive(item)}
              onClick={() => onItemClick(item)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function BuilderPlaceablePreviewGrid({
  items,
  selectedId,
  sections,
  hideSectionLabels = false,
  scrollRef,
}: {
  items?: readonly BuilderPlaceableItem[];
  selectedId?: string;
  sections?: readonly BuilderPreviewSection[];
  hideSectionLabels?: boolean;
  scrollRef?: RefObject<HTMLElement | null>;
}) {
  const flatItems = useMemo(() => {
    if (sections) return sections.flatMap((section) => section.items);
    return items ?? [];
  }, [items, sections]);

  const resolvedSections = useMemo((): BuilderPreviewSection[] => {
    if (sections) return [...sections];
    return [{
      label: "",
      items: items ?? [],
      onItemClick: (item) => BuilderStore.setSelectedPlaceable(item.id),
      isItemActive: (item) => item.id === selectedId,
    }];
  }, [items, sections, selectedId]);

  if (flatItems.length === 0) return null;

  return (
    <BuilderAssetPreviewRoot preloadItems={flatItems} scrollRef={scrollRef}>
      {resolvedSections.map((section) => (
        <BuilderPlaceablePreviewSection
          key={section.label || "items"}
          label={section.label}
          items={section.items}
          onItemClick={section.onItemClick}
          isItemActive={section.isItemActive}
          hideLabel={hideSectionLabels}
        />
      ))}
    </BuilderAssetPreviewRoot>
  );
}

function PlaceablePreviewButton({
  item,
  active,
  onClick,
}: {
  item: BuilderPlaceableItem;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        BUILDER_CSS.previewCard,
        "hover:opacity-90",
        active && BUILDER_CSS.previewCardActive,
      )}
      aria-pressed={active}
    >
      <DomViewportCanvas className={BUILDER_CSS.previewCardViewport}>
        <PlaceablePreviewScene item={item} />
      </DomViewportCanvas>
      <span
        className={cn(
          BUILDER_CSS.previewCardLabel,
          "line-clamp-1",
          active && BUILDER_CSS.previewCardLabelActive,
        )}
      >
        {item.label}
      </span>
    </button>
  );
}

function PlaceablePreviewScene({ item }: { item: BuilderPlaceableItem }) {
  return (
    <>
      <ambientLight intensity={1.1} />
      <hemisphereLight args={["#fff6e6", "#1f2937", 1.1]} />
      <directionalLight position={[3, 5, 4]} intensity={2.2} />
      <group rotation={[0, -Math.PI / 4, 0]}>
        <PreviewFramedContent frameKey={item.id}>
          <Suspense fallback={<PreviewLoadingPlaceholder />}>
            <PlaceablePreview item={item} />
          </Suspense>
        </PreviewFramedContent>
      </group>
    </>
  );
}

const PREVIEW_VIEW_PADDING = 1.12;
const _previewBox = new Box3();
const _previewCenter = new Vector3();
const _previewSize = new Vector3();
const _previewCorner = new Vector3();
const _previewCorners: Vector3[] = Array.from({ length: 8 }, () => new Vector3());

type PreviewFrameLayout = {
  offset: [number, number, number];
  scale: number;
};

const DEFAULT_PREVIEW_LAYOUT: PreviewFrameLayout = {
  offset: [0, 0, 0],
  scale: 1,
};

function PreviewFramedContent({
  children,
  frameKey,
}: {
  children: ReactNode;
  frameKey: string;
}) {
  const { camera, size, invalidate } = useThree();
  const layoutRef = useRef<Group>(null);
  const contentRef = useRef<Group>(null);
  const lastVolumeRef = useRef(-1);
  const lastViewKeyRef = useRef("");
  const modelBoundsSnapshot = useSyncExternalStore(
    subscribeModelBounds,
    getModelBoundsSnapshot,
    getModelBoundsSnapshot,
  );

  const applyPreviewLayout = useCallback(() => {
    const layout = layoutRef.current;
    const content = contentRef.current;
    if (!layout || !content || !(camera instanceof OrthographicCamera)) return false;

    const viewWidth = Math.round(size.width);
    const viewHeight = Math.round(size.height);
    if (viewWidth <= 0 || viewHeight <= 0) return false;

    const viewKey = `${viewWidth}x${viewHeight}@${camera.zoom}`;
    layout.position.set(0, 0, 0);
    layout.scale.setScalar(1);
    layout.updateWorldMatrix(true, true);
    content.updateWorldMatrix(true, true);

    _previewBox.setFromObject(content);
    if (_previewBox.isEmpty()) {
      lastVolumeRef.current = -1;
      return false;
    }

    _previewBox.getSize(_previewSize);
    const volume = _previewSize.x * _previewSize.y * _previewSize.z;
    const volumeChanged = lastVolumeRef.current < 0 || Math.abs(volume - lastVolumeRef.current) > 0.0005;
    const viewChanged = viewKey !== lastViewKeyRef.current;
    if (!volumeChanged && !viewChanged) return false;

    lastVolumeRef.current = volume;
    lastViewKeyRef.current = viewKey;

    const nextLayout = computePreviewLayout(
      _previewBox,
      camera,
      viewWidth,
      viewHeight,
      PREVIEW_VIEW_PADDING,
    );
    layout.position.set(...nextLayout.offset);
    layout.scale.setScalar(nextLayout.scale);
    return true;
  }, [camera, size.height, size.width]);

  useLayoutEffect(() => {
    lastVolumeRef.current = -1;
    lastViewKeyRef.current = "";
    const layout = layoutRef.current;
    if (layout) {
      layout.position.set(0, 0, 0);
      layout.scale.setScalar(1);
    }
    if (applyPreviewLayout()) invalidate();
  }, [applyPreviewLayout, frameKey, invalidate]);

  useEffect(() => {
    lastVolumeRef.current = -1;
    if (applyPreviewLayout()) invalidate();
  }, [applyPreviewLayout, invalidate, modelBoundsSnapshot]);

  return (
    <group ref={layoutRef}>
      <group ref={contentRef}>{children}</group>
    </group>
  );
}

function computePreviewLayout(
  box: Box3,
  camera: OrthographicCamera,
  viewWidth: number,
  viewHeight: number,
  padding: number,
): PreviewFrameLayout {
  box.getCenter(_previewCenter);
  writeBoxCorners(box, _previewCorners);

  camera.updateMatrixWorld();
  const cameraWorldInverse = camera.matrixWorldInverse;

  let maxAbsX = 0;
  let maxAbsY = 0;
  for (const corner of _previewCorners) {
    _previewCorner.copy(corner).sub(_previewCenter).applyMatrix4(cameraWorldInverse);
    maxAbsX = Math.max(maxAbsX, Math.abs(_previewCorner.x));
    maxAbsY = Math.max(maxAbsY, Math.abs(_previewCorner.y));
  }

  const projectedWidth = Math.max(maxAbsX * 2, 0.001);
  const projectedHeight = Math.max(maxAbsY * 2, 0.001);
  const visibleWidth = viewWidth / camera.zoom;
  const visibleHeight = viewHeight / camera.zoom;
  const scale = Math.min(
    visibleWidth / (projectedWidth * padding),
    visibleHeight / (projectedHeight * padding),
  );

  return {
    offset: [-_previewCenter.x, -_previewCenter.y, -_previewCenter.z],
    scale: Number.isFinite(scale) && scale > 0 ? scale : DEFAULT_PREVIEW_LAYOUT.scale,
  };
}

function writeBoxCorners(box: Box3, corners: readonly Vector3[]) {
  const { min, max } = box;
  corners[0].set(min.x, min.y, min.z);
  corners[1].set(min.x, min.y, max.z);
  corners[2].set(min.x, max.y, min.z);
  corners[3].set(min.x, max.y, max.z);
  corners[4].set(max.x, min.y, min.z);
  corners[5].set(max.x, min.y, max.z);
  corners[6].set(max.x, max.y, min.z);
  corners[7].set(max.x, max.y, max.z);
}

function PreviewLoadingPlaceholder() {
  return (
    <mesh position={[0, 0.18, 0]}>
      <boxGeometry args={[0.32, 0.32, 0.32]} />
      <meshStandardMaterial color="#3a4654" roughness={0.88} metalness={0.04} />
    </mesh>
  );
}

function PlaceablePreview({ item }: { item: BuilderPlaceableItem }) {
  switch (item.source.kind) {
    case "catalog":
      return <CatalogPreview modelKey={item.source.modelKey} />;
    case "decor":
      return <DecorPreview template={item.source.template} />;
  }
}

function CatalogPreview({ modelKey }: { modelKey: string }) {
  const asset = getWorldModelAsset(modelKey);
  const spec = useMemo<DecorItemSpec>(() => centerDecorAtOrigin({
    type: "model",
    assetType: "model",
    modelKey,
    footprint: asset?.footprint ?? { width: 1, depth: 1 },
    position: [0, 0, 0],
    castShadow: false,
    receiveShadow: false,
  }, PREVIEW_GRID), [asset?.footprint, modelKey]);

  if (!asset?.modelPath) {
    return <GenericCatalogPreview />;
  }

  return <MapDecor items={[spec]} grid={PREVIEW_GRID} modelLoadingFallback="none" />;
}

function DecorPreview({ template }: { template: DecorItemSpec }) {
  const item = useMemo<DecorItemSpec>(() => centerDecorAtOrigin({
    ...template,
    id: undefined,
    gridX: undefined,
    gridZ: undefined,
    position: [0, template.position?.[1] ?? 0, 0],
    castShadow: false,
    receiveShadow: false,
  }, PREVIEW_GRID), [template]);

  return <MapDecor items={[item]} grid={PREVIEW_GRID} modelLoadingFallback="none" />;
}

function GenericCatalogPreview() {
  return (
    <group position={[0, -0.04, 0]}>
      <mesh position={[0, 0.08, 0]}>
        <boxGeometry args={[1.45, 0.16, 0.82]} />
        <meshStandardMaterial color="#2f6f7a" roughness={0.58} metalness={0.18} />
      </mesh>
      <mesh position={[-0.48, 0.22, 0]}>
        <boxGeometry args={[0.36, 0.16, 0.62]} />
        <meshStandardMaterial color="#8fbec4" roughness={0.42} metalness={0.28} />
      </mesh>
      <mesh position={[0.2, 0.24, 0]}>
        <boxGeometry args={[0.62, 0.2, 0.5]} />
        <meshStandardMaterial color="#172033" roughness={0.5} metalness={0.35} />
      </mesh>
    </group>
  );
}

function collectPlaceableModelPaths(items: readonly BuilderPlaceableItem[]): readonly string[] {
  const paths = new Set<string>();
  for (const item of items) {
    if (item.source.kind === "catalog") {
      const path = getWorldModelAsset(item.source.modelKey)?.modelPath;
      if (path) paths.add(path);
      continue;
    }
    if (item.source.kind === "decor") {
      for (const path of collectDecorModelPaths([item.source.template])) {
        paths.add(path);
      }
    }
  }
  return Array.from(paths);
}
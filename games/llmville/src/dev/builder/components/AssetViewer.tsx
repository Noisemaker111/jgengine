import { Loader2 } from "lucide-react";
import { useMemo, useRef } from "react";

import {
  BuilderAssetPreviewRoot,
  BuilderPlaceablePreviewSection,
} from "@/dev/builder/components/BuilderPlaceablePreviewGrid";
import { BUILDER_CSS } from "@/dev/builder/components/builderStyles";
import {
  BuilderStore,
  recentAssetStatus,
  useBuilderState,
  type BuilderActivePlacement,
  type BuilderRecentAsset,
} from "@/dev/builder/builderStore";
import {
  ASSET_VIEWER_SECTIONS,
  type BuilderPlaceableItem,
} from "@/dev/builder/builderPlaceableCatalog";
import { cn } from "@/components/ui/cn";

function isStampPlacementActive(
  item: BuilderPlaceableItem,
  activePlacement: BuilderActivePlacement | null,
): boolean {
  if (!activePlacement) return false;
  switch (item.source.kind) {
    case "catalog":
      return activePlacement.kind === "catalog" && activePlacement.modelKey === item.source.modelKey;
    case "decor":
      return activePlacement.kind === "decor" && activePlacement.idBase === item.id;
    default:
      return false;
  }
}

function isPlaceableActive(
  item: BuilderPlaceableItem,
  selectedPlaceableId: string,
  activePlacement: BuilderActivePlacement | null,
): boolean {
  if (isStampPlacementActive(item, activePlacement)) return true;
  return selectedPlaceableId === item.id;
}

function isRecentActive(
  asset: BuilderRecentAsset,
  editingPlacedDecorId: string | null,
  activeRecentId: string | null,
): boolean {
  if (editingPlacedDecorId === asset.id) return true;
  if (activeRecentId === asset.id) return true;
  return false;
}

export function AssetViewer() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const state = useBuilderState();

  const activeRecentId =
    state.activePlacement?.kind === "recent" ? state.activePlacement.recentId : null;

  const catalogSections = useMemo(
    () =>
      ASSET_VIEWER_SECTIONS.map((section) => ({
        label: section.label,
        items: section.items,
        onItemClick: (item: BuilderPlaceableItem) => {
          BuilderStore.armPlaceableForStamp(item);
        },
        isItemActive: (item: BuilderPlaceableItem) =>
          isPlaceableActive(item, state.selectedPlaceableId, state.activePlacement),
      })),
    [state.selectedPlaceableId, state.activePlacement],
  );

  const readyGenerated = state.recentGeneratedAssets.filter(
    (asset) => recentAssetStatus(asset) === "ready" && asset.decor,
  );
  const pendingOrError = state.recentGeneratedAssets.filter(
    (asset) => recentAssetStatus(asset) !== "ready" || !asset.decor,
  );

  const generatedPreviewItems = useMemo<BuilderPlaceableItem[]>(
    () =>
      readyGenerated
        .filter((asset): asset is BuilderRecentAsset & { decor: NonNullable<BuilderRecentAsset["decor"]> } =>
          asset.decor !== undefined,
        )
        .map((asset) => ({
          id: asset.id,
          label: asset.label,
          category: "asset" as const,
          source: { kind: "decor" as const, template: asset.decor },
        })),
    [readyGenerated],
  );

  const libraryItems = useMemo(
    () => state.library.map((entry) => ({
      id: entry.id,
      label: entry.label,
      kind: entry.kind,
    })),
    [state.library],
  );

  const preloadItems = useMemo(
    () => [...catalogSections.flatMap((section) => section.items), ...generatedPreviewItems],
    [catalogSections, generatedPreviewItems],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <BuilderAssetPreviewRoot preloadItems={preloadItems} scrollRef={scrollRef}>
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-3">
          <div className="flex flex-col gap-4">
          {catalogSections.map((section) => (
            <BuilderPlaceablePreviewSection
              key={section.label}
              label={section.label}
              items={section.items}
              onItemClick={section.onItemClick}
              isItemActive={section.isItemActive}
            />
          ))}

          <section>
            <p className={cn(BUILDER_CSS.propsSectionLabel, "mb-2")}>Saved library</p>
            {libraryItems.length === 0 ? (
              <p className={BUILDER_CSS.emptyState}>
                Saved street segments and assets appear here after you use Save in the builder.
              </p>
            ) : (
              <ul className={BUILDER_CSS.previewCardGrid}>
                {libraryItems.map((entry) => {
                  const active = state.editingLibraryEntryId === entry.id;
                  return (
                    <li key={entry.id} className="min-w-0">
                      <button
                        type="button"
                        onClick={() => BuilderStore.armLibraryEntry(entry.id)}
                        className={cn(BUILDER_CSS.previewCard, active && BUILDER_CSS.previewCardActive)}
                        aria-pressed={active}
                      >
                        <span className={cn(BUILDER_CSS.previewCardViewport, "grid place-items-center px-2 text-center")}>
                          <span className="font-mono text-[9px] uppercase tracking-wide text-[var(--brand-cream-dim)]">
                            {entry.kind}
                          </span>
                        </span>
                        <span
                          className={cn(
                            BUILDER_CSS.previewCardLabel,
                            "line-clamp-2",
                            active && BUILDER_CSS.previewCardLabelActive,
                          )}
                        >
                          {entry.label}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <p className={cn(BUILDER_CSS.propsSectionLabel, "mb-2")}>3D generated objects</p>
            {state.recentGeneratedAssets.length === 0 ? (
              <p className={BUILDER_CSS.emptyState}>
                Generated assets appear here. Fire off prompts and keep working while they load.
              </p>
            ) : (
              <>
                {pendingOrError.length > 0 ? (
                  <ul className={cn(BUILDER_CSS.previewCardGrid, "mb-2.5")}>
                    {pendingOrError.map((asset) => {
                      const status = recentAssetStatus(asset);
                      const active = isRecentActive(asset, state.editingPlacedDecorId, activeRecentId);
                      return (
                        <li key={asset.id} className="min-w-0">
                          <button
                            type="button"
                            disabled={status === "pending"}
                            onClick={() => {
                              if (status === "ready") BuilderStore.armRecentAsset(asset.id);
                            }}
                            className={cn(
                              BUILDER_CSS.previewCard,
                              status === "pending" && BUILDER_CSS.previewCardDisabled,
                              status === "error" && BUILDER_CSS.previewCardError,
                              active && BUILDER_CSS.previewCardActive,
                            )}
                            aria-pressed={active}
                          >
                            <span className={cn(BUILDER_CSS.previewCardViewport, "grid place-items-center")}>
                              {status === "pending" ? (
                                <Loader2 className="h-5 w-5 animate-spin text-[var(--brand-teal)]" />
                              ) : (
                                <span className="font-game text-[10px] font-bold text-[var(--destructive)]">
                                  Failed
                                </span>
                              )}
                            </span>
                            <span
                              className={cn(
                                BUILDER_CSS.previewCardLabel,
                                "line-clamp-1",
                                active && BUILDER_CSS.previewCardLabelActive,
                              )}
                            >
                              {asset.label}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
                {generatedPreviewItems.length > 0 ? (
                  <BuilderPlaceablePreviewSection
                    label=""
                    items={generatedPreviewItems}
                    hideLabel
                    onItemClick={(item) => BuilderStore.armRecentAsset(item.id)}
                    isItemActive={(item) => {
                      const asset = readyGenerated.find((entry) => entry.id === item.id);
                      return asset
                        ? isRecentActive(asset, state.editingPlacedDecorId, activeRecentId)
                        : false;
                    }}
                  />
                ) : null}
              </>
            )}
          </section>
          </div>
        </div>
      </BuilderAssetPreviewRoot>
    </div>
  );
}
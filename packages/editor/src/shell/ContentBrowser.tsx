import { useMemo, useRef, useState, type DragEvent } from "react";

import type { EditorSession } from "@jgengine/core/editor/index";

import {
  ASSET_DRAG_MIME,
  MATERIAL_DRAG_MIME,
  encodeAssetDragPayload,
  type EditorAssetEntry,
} from "../AssetBrowser";
import { TERRAIN_MATERIALS } from "../uiStore";
import { AssetThumbnail } from "./AssetThumbnail";
import { Icon, type IconName } from "./icons";
import type { BrowserViewMode } from "./layoutStore";
import { FOCUS_RING, INPUT_CLS, MICRO_LABEL } from "./theme";
import { EmptyState, IconButton, Segmented } from "./ui";

type BrowserFolder = { id: string; label: string; icon: IconName; count: number };

const ASSET_KIND_ICON: Record<EditorAssetEntry["kind"], IconName> = {
  model: "cube",
  catalog: "layers",
  marker: "pin",
};

const MODEL_ACCEPT = ".glb,.gltf,model/gltf-binary,model/gltf+json";

/**
 * Content Browser dock tab: folder rail + searchable asset grid/list over the game's real asset
 * catalog, plus the terrain material palette (drag chips onto objects or the viewport). Assets are
 * draggable into the viewport for placement (and still double-click / Place). Model cards with a URL
 * get a real offscreen-GLB thumbnail (cached); catalog/marker rows and failed loads keep typed
 * glyphs — never a fabricated screenshot. Import reuses the standalone editor's host importer.
 */
export function ContentBrowser({
  assets,
  session,
  onPlace,
  view,
  onSetView,
  onImportModels,
  importBusy = false,
}: {
  assets: readonly EditorAssetEntry[];
  session: EditorSession;
  onPlace: (entry: EditorAssetEntry) => void;
  view: BrowserViewMode;
  onSetView: (view: BrowserViewMode) => void;
  /** When set, enables Import + drop-to-import for `.glb`/`.gltf` model files. */
  onImportModels?: (files: readonly File[]) => void | Promise<void>;
  /** True while an import is in flight (disables the Import control). */
  importBusy?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const folders = useMemo<BrowserFolder[]>(() => {
    const kinds = new Map<string, number>();
    for (const asset of assets) kinds.set(asset.kind, (kinds.get(asset.kind) ?? 0) + 1);
    return [
      { id: "all", label: "All assets", icon: "folder", count: assets.length },
      ...[...kinds.entries()].map(([kind, count]) => ({
        id: `kind:${kind}`,
        label: kind === "model" ? "Models" : kind === "catalog" ? "Catalog" : "Markers",
        icon: ASSET_KIND_ICON[kind as EditorAssetEntry["kind"]] ?? "cube",
        count,
      })),
      { id: "materials", label: "Materials", icon: "sphere", count: TERRAIN_MATERIALS.length },
    ];
  }, [assets]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let list = assets;
    if (folder.startsWith("kind:")) {
      const kind = folder.slice(5);
      list = list.filter((asset) => asset.kind === kind);
    }
    if (needle.length === 0) return list;
    return list.filter(
      (asset) => asset.id.toLowerCase().includes(needle) || asset.label.toLowerCase().includes(needle),
    );
  }, [assets, folder, query]);

  const selected = filtered.find((asset) => asset.id === selectedId) ?? null;
  const activeFolder = folders.find((entry) => entry.id === folder) ?? folders[0]!;
  const showMaterials = folder === "materials";
  const canImport = onImportModels !== undefined;

  const takeDroppedFiles = (event: DragEvent) => {
    if (!canImport || event.dataTransfer === null) return;
    const files = Array.from(event.dataTransfer.files);
    if (files.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    setDropActive(false);
    void onImportModels(files);
  };

  return (
    <div
      className={`flex min-h-0 flex-1 ${dropActive ? "ring-2 ring-inset ring-cyan-400/40" : ""}`}
      onDragEnter={(event) => {
        if (!canImport || event.dataTransfer === null) return;
        if (![...event.dataTransfer.types].includes("Files")) return;
        event.preventDefault();
        setDropActive(true);
      }}
      onDragOver={(event) => {
        if (!canImport || event.dataTransfer === null) return;
        if (![...event.dataTransfer.types].includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDropActive(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setDropActive(false);
      }}
      onDrop={takeDroppedFiles}
    >
      <nav aria-label="Asset folders" className="flex w-40 shrink-0 flex-col gap-0.5 overflow-auto border-r border-white/[0.06] p-1.5">
        <div className={`px-1.5 pb-1 ${MICRO_LABEL}`}>Folders</div>
        {folders.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => {
              setFolder(entry.id);
              setSelectedId(null);
            }}
            aria-current={entry.id === folder}
            className={`flex items-center gap-1.5 rounded-[5px] px-1.5 py-1 text-left text-[11px] transition-colors ${FOCUS_RING} ${
              entry.id === folder ? "bg-cyan-500/15 text-cyan-100" : "text-neutral-400 hover:bg-white/[0.05] hover:text-neutral-200"
            }`}
          >
            <Icon name={entry.icon} size={13} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">{entry.label}</span>
            <span className="text-[9px] tabular-nums text-neutral-600">{entry.count}</span>
          </button>
        ))}
      </nav>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-white/[0.06] px-2">
          <div className="flex items-center gap-1 text-[11px] text-neutral-500">
            <span>Assets</span>
            <Icon name="chevronRight" size={9} />
            <span className="text-neutral-300">{activeFolder.label}</span>
          </div>
          {canImport ? (
            <>
              <button
                type="button"
                disabled={importBusy}
                onClick={() => importInputRef.current?.click()}
                className={`ml-auto flex h-6.5 items-center gap-1 rounded-[5px] bg-cyan-500/15 px-2 text-[11px] text-cyan-100 ring-1 ring-inset ring-cyan-400/30 transition-colors hover:bg-cyan-500/25 disabled:pointer-events-none disabled:opacity-50 ${FOCUS_RING}`}
                title="Import .glb / .gltf models into the placeable catalog"
              >
                <Icon name="import" size={12} />
                {importBusy ? "Importing…" : "Import"}
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept={MODEL_ACCEPT}
                multiple
                className="hidden"
                onChange={(event) => {
                  const files = event.target.files;
                  if (files !== null && files.length > 0) void onImportModels(Array.from(files));
                  event.target.value = "";
                }}
              />
            </>
          ) : null}
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search assets…"
            aria-label="Search assets"
            className={`${canImport ? "" : "ml-auto "}h-6.5 w-52 px-2 ${INPUT_CLS}`}
          />
          <Segmented
            ariaLabel="Browser layout"
            value={view}
            onChange={onSetView}
            options={[
              { value: "grid", label: "Grid view", icon: "gridView", iconOnly: true },
              { value: "list", label: "List view", icon: "list", iconOnly: true },
            ]}
          />
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="min-h-0 min-w-0 flex-1 overflow-auto p-2">
            {showMaterials ? (
              <div className="flex flex-wrap gap-1.5">
                {TERRAIN_MATERIALS.map((material) => (
                  <div
                    key={material.id}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData(MATERIAL_DRAG_MIME, material.id);
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                    title={`Drag ${material.label} onto an object or the viewport to assign/paint it`}
                    className="flex cursor-grab items-center gap-2 rounded-[6px] border border-white/[0.08] bg-[#191d24] px-2.5 py-1.5 text-[11px] text-neutral-300 active:cursor-grabbing"
                  >
                    <span className="h-4 w-4 rounded-full ring-1 ring-inset ring-white/20" style={{ backgroundColor: material.color }} />
                    {material.label}
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon="image"
                title={query.length > 0 ? "No assets match" : "No assets in this catalog"}
                description={
                  query.length > 0
                    ? `Nothing in ${activeFolder.label} matches “${query}”.`
                    : canImport
                      ? "Drop .glb / .gltf files here, or use Import, to add placeable models."
                      : "This game registers no placeable assets. Register models in the game's asset catalog, or drop .glb files into the standalone editor."
                }
              />
            ) : view === "grid" ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-1.5">
                {filtered.map((asset) => {
                  const isSelected = asset.id === selectedId;
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData(ASSET_DRAG_MIME, encodeAssetDragPayload(asset));
                        event.dataTransfer.effectAllowed = "copy";
                      }}
                      onClick={() => setSelectedId(asset.id)}
                      onDoubleClick={() => onPlace(asset)}
                      title={`${asset.label} — drag into viewport or double-click to place`}
                      className={`group flex cursor-grab flex-col overflow-hidden rounded-[6px] border text-left transition-colors active:cursor-grabbing ${FOCUS_RING} ${
                        isSelected
                          ? "border-cyan-400/50 bg-cyan-500/10"
                          : "border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04]"
                      }`}
                    >
                      <div className="flex h-14 items-center justify-center overflow-hidden border-b border-white/[0.05] bg-black/25 text-neutral-500 group-hover:text-neutral-300">
                        <AssetThumbnail asset={asset} size={22} />
                      </div>
                      <div className="p-1.5">
                        <div className="truncate text-[10px] text-neutral-200">{asset.label}</div>
                        <div className="mt-0.5 flex items-center gap-1">
                          <span className="rounded-[3px] bg-white/[0.06] px-1 py-px text-[8px] uppercase tracking-wider text-neutral-500">
                            {asset.kind}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-0.5">
                {filtered.map((asset) => {
                  const isSelected = asset.id === selectedId;
                  return (
                    <div
                      key={asset.id}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData(ASSET_DRAG_MIME, encodeAssetDragPayload(asset));
                        event.dataTransfer.effectAllowed = "copy";
                      }}
                      className={`group flex cursor-grab items-center gap-2 rounded-[5px] px-1.5 py-1 transition-colors active:cursor-grabbing ${
                        isSelected ? "bg-cyan-500/10 ring-1 ring-inset ring-cyan-400/30" : "hover:bg-white/[0.04]"
                      }`}
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-[4px] border border-white/[0.06] bg-black/30">
                        <AssetThumbnail asset={asset} size={14} />
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedId(asset.id)}
                        onDoubleClick={() => onPlace(asset)}
                        className={`min-w-0 flex-1 truncate text-left text-[11px] text-neutral-200 ${FOCUS_RING}`}
                      >
                        {asset.label}
                        <span className="ml-2 text-[10px] text-neutral-600">{asset.id}</span>
                      </button>
                      <span className="rounded-[3px] bg-white/[0.06] px-1 py-px text-[8px] uppercase tracking-wider text-neutral-500">
                        {asset.kind}
                      </span>
                      <button
                        type="button"
                        onClick={() => onPlace(asset)}
                        className={`shrink-0 rounded-[4px] bg-cyan-500/20 px-2 py-0.5 text-[10px] text-cyan-200 opacity-0 ring-1 ring-inset ring-cyan-400/30 transition-all hover:bg-cyan-500/30 focus-visible:opacity-100 group-hover:opacity-100 ${FOCUS_RING}`}
                      >
                        Place
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {selected !== null && !showMaterials ? (
            <aside className="w-48 shrink-0 overflow-auto border-l border-white/[0.06] p-2.5" aria-label="Asset details">
              <div className="flex h-16 items-center justify-center overflow-hidden rounded-[6px] border border-white/[0.07] bg-black/25 text-neutral-400">
                <AssetThumbnail asset={selected} size={26} />
              </div>
              <div className="mt-2 truncate text-[12px] font-medium text-neutral-100">{selected.label}</div>
              <dl className="mt-1.5 space-y-1 text-[10px]">
                <div className="flex justify-between gap-2">
                  <dt className="text-neutral-600">Type</dt>
                  <dd className="text-neutral-400">{selected.kind}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-neutral-600">Id</dt>
                  <dd className="truncate text-neutral-400">{selected.id}</dd>
                </div>
                {selected.url !== undefined ? (
                  <div className="flex justify-between gap-2">
                    <dt className="text-neutral-600">Source</dt>
                    <dd className="truncate text-neutral-400" title={selected.url}>
                      {selected.url.split("/").pop()}
                    </dd>
                  </div>
                ) : null}
              </dl>
              <button
                type="button"
                onClick={() => onPlace(selected)}
                className={`mt-2.5 w-full rounded-[5px] bg-cyan-600 px-2 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-cyan-500 ${FOCUS_RING}`}
              >
                Place in scene
              </button>
            </aside>
          ) : null}
        </div>

        <div className="flex h-7 shrink-0 items-center gap-2 border-t border-white/[0.06] px-2 text-[10px] text-neutral-600">
          <span className="tabular-nums">
            {showMaterials ? `${TERRAIN_MATERIALS.length} materials` : `${filtered.length} of ${assets.length} assets`}
          </span>
          {selected !== null ? <span className="truncate text-neutral-500">{selected.id} selected</span> : null}
          {canImport && !showMaterials ? (
            <span className="truncate text-neutral-600">Drop .glb here or Import</span>
          ) : null}
          <div className="ml-auto">
            <IconButton
              icon="pin"
              label="Add empty marker at origin"
              size={12}
              onClick={() =>
                session.dispatch({
                  type: "addMarker",
                  marker: {
                    id: `marker_${Date.now().toString(36)}`,
                    kind: "prop",
                    position: { x: 0, y: 0, z: 0 },
                    label: "New marker",
                    color: "#e2e8f0",
                  },
                })
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

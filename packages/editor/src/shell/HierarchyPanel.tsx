import { memo, useEffect, useMemo, useRef, useState, type DragEvent } from "react";

import { isEditorObjectLocked, type EditorSession } from "@jgengine/core/editor/index";

import { MATERIAL_DRAG_MIME } from "../AssetBrowser";
import { flattenOutliner } from "../outlinerModel";
import type { EditorHostApi } from "../session";
import { shallowArrayEqual, useStoreSelector, virtualWindow } from "../useStoreSelector";
import { Icon, kindIcon } from "./icons";
import { FOCUS_RING, INPUT_CLS, NUMERIC } from "./theme";
import { IconButton, Segmented } from "./ui";

const ROW_HEIGHT = 26;

/** HTML5 drag payload for hierarchy reparenting via `set_parent`. */
export const OBJECT_DRAG_MIME = "application/x-jgengine-editor-object";

function dataTransferHas(types: readonly string[], mime: string): boolean {
  return types.includes(mime);
}

/**
 * Redesigned world outliner: searchable, virtualized, kind-iconed rows generated from the live
 * document. Group headers carry real per-kind visibility toggles (the editor's layer system);
 * rows locked through a locked collection show a lock indicator. Tree view supports drag-and-drop
 * reparenting through the existing `set_parent` RPC. Selector-subscribed and memoized, so UI-only
 * churn never rerenders it.
 */
export const HierarchyPanel = memo(function HierarchyPanel({
  session,
  api,
  onAdd,
}: {
  session: EditorSession;
  api: EditorHostApi;
  /** Opens the add flow (command palette pre-filtered to Add commands). */
  onAdd: () => void;
}) {
  const document = useStoreSelector(session, (state) => state.document);
  const selection = useStoreSelector(session, (state) => state.selection, shallowArrayEqual);
  const selectedId = selection[0];

  const [view, setView] = useState<"kind" | "tree">("kind");
  const [query, setQuery] = useState("");
  const [collapsedKinds, setCollapsedKinds] = useState<Record<string, boolean>>({});
  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({});
  const [visibilityTick, setVisibilityTick] = useState(0);
  useEffect(() => api.subscribeVisibility(() => setVisibilityTick((value) => value + 1)), [api]);
  void visibilityTick;
  const visibility = api.getVisibility();

  const rows = useMemo(
    () => flattenOutliner(document, { view, query, collapsedKinds, collapsedNodes }),
    [document, view, query, collapsedKinds, collapsedNodes],
  );

  const total = document.markers.length + document.volumes.length + document.paths.length + document.annotations.length;

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(320);
  useEffect(() => {
    const element = scrollRef.current;
    if (element === null) return;
    const measure = () => setViewportHeight(element.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const win = virtualWindow(scrollTop, viewportHeight, ROW_HEIGHT, rows.length);
  const visible = rows.slice(win.start, win.end);

  const selectRow = (id: string, additive: boolean) => {
    if (additive) {
      const current = session.getState().selection;
      const next = current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id];
      session.dispatch({ type: "select", ids: next });
      return;
    }
    session.dispatch({ type: "select", ids: [id] });
    api.handle({ method: "camera_goto", id });
  };

  const [materialDropTarget, setMaterialDropTarget] = useState<string | null>(null);
  const [reparentDropTarget, setReparentDropTarget] = useState<string | null>(null);
  const [draggingObjectId, setDraggingObjectId] = useState<string | null>(null);

  const acceptMaterialDrop = (event: DragEvent, ids: readonly string[], key: string) => {
    if (!dataTransferHas(event.dataTransfer.types, MATERIAL_DRAG_MIME)) return false;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (materialDropTarget !== key) setMaterialDropTarget(key);
    return true;
  };

  const commitMaterialDrop = (event: DragEvent, ids: readonly string[]) => {
    const materialId = event.dataTransfer.getData(MATERIAL_DRAG_MIME);
    if (materialId.length === 0) return false;
    event.preventDefault();
    setMaterialDropTarget(null);
    api.handle({ method: "assign_material", ids: [...ids], materialId });
    return true;
  };

  const acceptReparentDrop = (event: DragEvent, key: string) => {
    if (!dataTransferHas(event.dataTransfer.types, OBJECT_DRAG_MIME)) return false;
    if (dataTransferHas(event.dataTransfer.types, MATERIAL_DRAG_MIME)) return false;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    if (reparentDropTarget !== key) setReparentDropTarget(key);
    return true;
  };

  const commitReparentDrop = (event: DragEvent, parentId: string | null) => {
    const objectId = event.dataTransfer.getData(OBJECT_DRAG_MIME);
    if (objectId.length === 0) return false;
    event.preventDefault();
    event.stopPropagation();
    setReparentDropTarget(null);
    setDraggingObjectId(null);
    if (parentId === objectId) return true;
    api.handle({ method: "set_parent", ids: [objectId], parentId });
    return true;
  };

  const rowLocked = (ids: readonly string[]) => ids.some((id) => isEditorObjectLocked(document, id));

  return (
    <>
      <div className="space-y-1.5 border-b border-white/[0.06] p-2">
        <div className="flex items-center gap-1.5">
          <div className="relative min-w-0 flex-1">
            <Icon name="search" size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-neutral-600" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search…"
              aria-label="Search scene objects"
              className={`h-7 w-full pl-7 pr-2 ${INPUT_CLS}`}
            />
          </div>
          <IconButton icon="plus" label="Add object…" onClick={onAdd} />
        </div>
        <div className="flex items-center gap-1.5">
          <Segmented
            ariaLabel="Outliner grouping"
            value={view}
            onChange={setView}
            options={[
              { value: "kind", label: "By kind", icon: "layers" },
              { value: "tree", label: "Tree", icon: "folder" },
            ]}
          />
          <span className={`ml-auto text-[10px] text-neutral-600 ${NUMERIC}`}>{total} objects</span>
        </div>
        {view === "tree" ? (
          <p className="px-0.5 text-[10px] text-neutral-600">Drag rows to reparent · drop on empty list to unparent</p>
        ) : null}
      </div>
      <div
        ref={scrollRef}
        className={`min-h-0 flex-1 overflow-auto px-1.5 py-1 ${
          reparentDropTarget === "__root__" ? "bg-cyan-500/10 ring-1 ring-inset ring-cyan-400/30" : ""
        }`}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        onDragOver={
          view === "tree"
            ? (event) => {
                acceptReparentDrop(event, "__root__");
              }
            : undefined
        }
        onDragLeave={
          view === "tree"
            ? () => setReparentDropTarget((current) => (current === "__root__" ? null : current))
            : undefined
        }
        onDrop={
          view === "tree"
            ? (event) => {
                commitReparentDrop(event, null);
              }
            : undefined
        }
      >
        {rows.length === 0 ? (
          <div className="p-4 text-center text-[11px] text-neutral-600">
            {query.length > 0 ? "No matching objects." : "No objects yet — use Add or place assets from the Content Browser."}
          </div>
        ) : (
          <div style={{ height: win.totalHeight, position: "relative" }}>
            <div style={{ transform: `translateY(${win.offsetTop}px)` }}>
              {visible.map((row) => {
                if (row.type === "group") {
                  const kindVisible = visibility[row.kind] !== false;
                  return (
                    <div key={row.key} style={{ height: ROW_HEIGHT }} className="group flex items-center gap-0.5 pr-0.5">
                      <button
                        type="button"
                        className={`flex h-full min-w-0 flex-1 items-center gap-1 rounded-[5px] px-1 text-left text-[11px] font-semibold text-neutral-300 transition-colors hover:bg-white/[0.05] ${FOCUS_RING}`}
                        onClick={() => setCollapsedKinds((previous) => ({ ...previous, [row.kind]: !(previous[row.kind] === true) }))}
                        aria-expanded={!row.collapsed}
                      >
                        <Icon name={row.collapsed ? "chevronRight" : "chevronDown"} size={10} className="shrink-0 text-neutral-600" />
                        <Icon name={row.collapsed ? "folder" : "folderOpen"} size={13} className="shrink-0 text-neutral-500" />
                        <span className="truncate">{row.kind}</span>
                        <span className={`ml-auto pr-1 text-[10px] font-normal text-neutral-600 ${NUMERIC}`}>{row.total}</span>
                      </button>
                      <button
                        type="button"
                        aria-label={kindVisible ? `Hide ${row.kind} layer` : `Show ${row.kind} layer`}
                        aria-pressed={kindVisible}
                        title={kindVisible ? `Hide ${row.kind} layer` : `Show ${row.kind} layer`}
                        onClick={() => api.setVisibility({ ...api.getVisibility(), [row.kind]: !kindVisible })}
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] transition-colors hover:bg-white/[0.08] ${FOCUS_RING} ${
                          kindVisible ? "text-neutral-500 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" : "text-neutral-600"
                        }`}
                      >
                        <Icon name={kindVisible ? "eye" : "eyeOff"} size={12} />
                      </button>
                    </div>
                  );
                }
                if (row.type === "kindItem") {
                  const rowSelected = selectedId !== undefined && row.ids.includes(selectedId);
                  const cycleIndex = rowSelected ? row.ids.indexOf(selectedId) + 1 : 0;
                  const dropActive = materialDropTarget === row.key;
                  const locked = rowLocked(row.ids);
                  return (
                    <button
                      key={row.key}
                      type="button"
                      style={{ height: ROW_HEIGHT }}
                      className={`flex w-full items-center gap-1.5 rounded-[5px] pl-6 pr-1.5 text-left text-[11px] transition-colors ${FOCUS_RING} ${
                        dropActive
                          ? "bg-cyan-500/25 ring-1 ring-inset ring-cyan-300/50"
                          : rowSelected
                            ? "bg-cyan-500/15 text-cyan-100 ring-1 ring-inset ring-cyan-400/25"
                            : "text-neutral-300 hover:bg-white/[0.05]"
                      }`}
                      onClick={(event) => selectRow(row.ids[0]!, event.ctrlKey || event.metaKey || event.shiftKey)}
                      onDragOver={(event) => {
                        acceptMaterialDrop(event, row.ids, row.key);
                      }}
                      onDragLeave={() => setMaterialDropTarget((current) => (current === row.key ? null : current))}
                      onDrop={(event) => {
                        commitMaterialDrop(event, row.ids);
                      }}
                    >
                      <Icon name={kindIcon(row.kind)} size={13} className={`shrink-0 ${rowSelected ? "text-cyan-300" : "text-neutral-500"}`} />
                      <span className="min-w-0 flex-1 truncate">
                        {row.label}
                        {row.ids.length > 1 ? (
                          <span className={`text-neutral-500 ${NUMERIC}`}>
                            {" "}×{row.ids.length}
                            {rowSelected ? ` · ${cycleIndex}/${row.ids.length} · N next` : ""}
                          </span>
                        ) : null}
                      </span>
                      {locked ? (
                        <Icon name="lock" size={11} className="shrink-0 text-amber-400/70" aria-label="Locked via collection" />
                      ) : null}
                    </button>
                  );
                }
                const rowSelected = selection.includes(row.id);
                const materialDrop = materialDropTarget === row.key;
                const reparentDrop = reparentDropTarget === row.key && draggingObjectId !== row.id;
                const locked = isEditorObjectLocked(document, row.id);
                const dragging = draggingObjectId === row.id;
                return (
                  <div key={row.key} style={{ height: ROW_HEIGHT, paddingLeft: `${row.depth * 12}px` }} className="flex items-center">
                    {row.hasChildren ? (
                      <button
                        type="button"
                        aria-label={collapsedNodes[row.id] === true ? "Expand children" : "Collapse children"}
                        className={`flex h-4 w-4 shrink-0 items-center justify-center text-neutral-500 transition-colors hover:text-neutral-200 ${FOCUS_RING}`}
                        onClick={() => setCollapsedNodes((previous) => ({ ...previous, [row.id]: !(previous[row.id] === true) }))}
                      >
                        <Icon name={collapsedNodes[row.id] === true ? "chevronRight" : "chevronDown"} size={10} />
                      </button>
                    ) : (
                      <span className="w-4 shrink-0" />
                    )}
                    <button
                      type="button"
                      draggable
                      className={`flex h-full min-w-0 flex-1 items-center gap-1.5 truncate rounded-[5px] px-1.5 text-left text-[11px] transition-colors ${FOCUS_RING} ${
                        materialDrop || reparentDrop
                          ? "bg-cyan-500/25 ring-1 ring-inset ring-cyan-300/50"
                          : rowSelected
                            ? "bg-cyan-500/15 text-cyan-100 ring-1 ring-inset ring-cyan-400/25"
                            : "text-neutral-300 hover:bg-white/[0.05]"
                      } ${dragging ? "opacity-50" : ""}`}
                      onClick={(event) => selectRow(row.id, event.ctrlKey || event.metaKey || event.shiftKey)}
                      title={`${row.id} — drag to reparent`}
                      onDragStart={(event) => {
                        event.dataTransfer.setData(OBJECT_DRAG_MIME, row.id);
                        event.dataTransfer.effectAllowed = "move";
                        setDraggingObjectId(row.id);
                      }}
                      onDragEnd={() => {
                        setDraggingObjectId(null);
                        setReparentDropTarget(null);
                      }}
                      onDragOver={(event) => {
                        if (acceptMaterialDrop(event, [row.id], row.key)) return;
                        acceptReparentDrop(event, row.key);
                      }}
                      onDragLeave={() => {
                        setMaterialDropTarget((current) => (current === row.key ? null : current));
                        setReparentDropTarget((current) => (current === row.key ? null : current));
                      }}
                      onDrop={(event) => {
                        if (commitMaterialDrop(event, [row.id])) return;
                        commitReparentDrop(event, row.id);
                      }}
                    >
                      <Icon name={kindIcon(row.kind)} size={13} className={`shrink-0 ${rowSelected ? "text-cyan-300" : "text-neutral-500"}`} />
                      <span className="min-w-0 flex-1 truncate">{row.label}</span>
                      <span className="text-[9px] text-neutral-600">{row.kind}</span>
                      {locked ? <Icon name="lock" size={11} className="shrink-0 text-amber-400/70" aria-label="Locked via collection" /> : null}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
});

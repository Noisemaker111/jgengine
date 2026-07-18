import { memo, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";

import {
  isEditorObjectCollectionLocked,
  isEditorObjectHidden,
  isEditorObjectLocked,
  isEditorObjectSelfLocked,
  type EditorSession,
} from "@jgengine/core/editor/index";

import { MATERIAL_DRAG_MIME } from "../AssetBrowser";
import { flattenOutliner } from "../outlinerModel";
import type { EditorHostApi } from "../session";
import { shallowArrayEqual, useStoreSelector, virtualWindow } from "../useStoreSelector";
import {
  hierarchyActiveDescendantId,
  hierarchyRowDomId,
  selectableIds,
} from "./hierarchyA11y";
import { Icon, kindIcon } from "./icons";
import { renameEditorObject } from "./renameObject";
import { FOCUS_RING, INPUT_CLS, NUMERIC } from "./theme";
import { IconButton, Segmented } from "./ui";

export {
  hierarchyActiveDescendantId,
  hierarchyRowDomId,
  selectableIds,
} from "./hierarchyA11y";

const ROW_HEIGHT = 26;

/** HTML5 drag payload for hierarchy reparenting via `set_parent`. */
export const OBJECT_DRAG_MIME = "application/x-jgengine-editor-object";

function dataTransferHas(types: readonly string[], mime: string): boolean {
  return types.includes(mime);
}

/**
 * Mouse activation of row chrome must not steal focus from the tree container — focus stays on
 * the list for roving tabindex / `aria-activedescendant`. Rename inputs still take focus.
 */
function preventFocusSteal(event: MouseEvent): void {
  const target = event.target;
  if (target instanceof HTMLElement && target.closest("input") !== null) return;
  event.preventDefault();
}

/**
 * Redesigned world outliner: searchable, virtualized, kind-iconed rows generated from the live
 * document. Group headers carry real per-kind visibility toggles (the editor's layer system);
 * rows expose per-object eye/lock toggles (`setObjectFlags` → document `hidden`/`locked`) and show
 * a lock affordance when a locked collection also owns the id. Tree view supports drag-and-drop
 * reparenting through the existing `set_parent` RPC. Keyboard navigation uses a single tab stop
 * on the list (roving active row via `aria-activedescendant`; arrows / Home / End / Enter / F2),
 * double-click rename, and row context menus (frame / duplicate / delete / prefab / parent to… /
 * unparent) are supported. Selector-subscribed and memoized, so UI-only churn never rerenders it.
 */
export const HierarchyPanel = memo(function HierarchyPanel({
  session,
  api,
  onAdd,
  onRowContextMenu,
}: {
  session: EditorSession;
  api: EditorHostApi;
  /** Opens the add flow (command palette pre-filtered to Add commands). */
  onAdd: () => void;
  /** Right-click a row — host opens the shared editor context menu at the pointer. */
  onRowContextMenu?: (event: { clientX: number; clientY: number }, id: string) => void;
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

  const navigableIds = useMemo(() => selectableIds(rows), [rows]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeId !== null && !navigableIds.includes(activeId)) setActiveId(navigableIds[0] ?? null);
  }, [activeId, navigableIds]);

  useEffect(() => {
    if (renamingId !== null) renameInputRef.current?.focus();
  }, [renamingId]);

  const focusTree = () => {
    scrollRef.current?.focus({ preventScroll: true });
  };

  const scrollRowIntoView = (id: string) => {
    const rowIndex = rows.findIndex(
      (row) =>
        (row.type === "kindItem" && row.ids[0] === id) || (row.type === "treeItem" && row.id === id),
    );
    if (rowIndex < 0 || scrollRef.current === null) return;
    const top = rowIndex * ROW_HEIGHT;
    const bottom = top + ROW_HEIGHT;
    const viewTop = scrollRef.current.scrollTop;
    const viewBottom = viewTop + scrollRef.current.clientHeight;
    if (top < viewTop) scrollRef.current.scrollTop = top;
    else if (bottom > viewBottom) scrollRef.current.scrollTop = bottom - scrollRef.current.clientHeight;
  };

  const activateId = (id: string, additive: boolean) => {
    setActiveId(id);
    selectRow(id, additive);
    scrollRowIntoView(id);
  };

  const beginRename = (id: string, label: string) => {
    setRenamingId(id);
    setRenameDraft(label);
    setActiveId(id);
  };

  const endRename = () => {
    setRenamingId(null);
    // Restore the single tree tab stop after the rename input unmounts.
    queueMicrotask(focusTree);
  };

  const commitRename = () => {
    if (renamingId === null) return;
    renameEditorObject(session, renamingId, renameDraft);
    endRename();
  };

  const cancelRename = () => endRename();

  const onListFocus = () => {
    if (renamingId !== null) return;
    if (activeId !== null && navigableIds.includes(activeId)) return;
    const seed =
      selectedId !== undefined && navigableIds.includes(selectedId)
        ? selectedId
        : (navigableIds[0] ?? null);
    if (seed !== null) setActiveId(seed);
  };

  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (renamingId !== null) return;
    if (navigableIds.length === 0) return;
    const currentIndex = activeId === null ? -1 : navigableIds.indexOf(activeId);

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex =
        currentIndex < 0
          ? event.key === "ArrowDown"
            ? 0
            : navigableIds.length - 1
          : Math.max(0, Math.min(navigableIds.length - 1, currentIndex + delta));
      activateId(navigableIds[nextIndex]!, event.shiftKey);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      activateId(navigableIds[0]!, event.shiftKey);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      activateId(navigableIds[navigableIds.length - 1]!, event.shiftKey);
      return;
    }

    if (event.key === "Enter" && activeId !== null) {
      event.preventDefault();
      api.handle({ method: "camera_goto", id: activeId });
      return;
    }

    if (event.key === "F2" && activeId !== null) {
      event.preventDefault();
      const row = rows.find(
        (entry) =>
          (entry.type === "kindItem" && entry.ids[0] === activeId) ||
          (entry.type === "treeItem" && entry.id === activeId),
      );
      if (row !== undefined && (row.type === "kindItem" || row.type === "treeItem")) {
        beginRename(activeId, row.label);
      }
    }
  };

  const [materialDropTarget, setMaterialDropTarget] = useState<string | null>(null);
  const [reparentDropTarget, setReparentDropTarget] = useState<string | null>(null);
  const [draggingObjectId, setDraggingObjectId] = useState<string | null>(null);

  const acceptMaterialDrop = (event: DragEvent, _ids: readonly string[], key: string) => {
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
  const rowHidden = (ids: readonly string[]) => ids.some((id) => isEditorObjectHidden(document, id));

  const toggleHidden = (ids: readonly string[]) => {
    const nextHidden = !rowHidden(ids);
    session.dispatch({ type: "setObjectFlags", ids: [...ids], patch: { hidden: nextHidden } });
  };

  /**
   * Toggle object-level lock. When the object is only locked via a collection, do not silently
   * invent an object lock — leave collection locks to the Collections panel.
   */
  const toggleLocked = (ids: readonly string[]) => {
    const anySelfLocked = ids.some((id) => isEditorObjectSelfLocked(document, id));
    if (anySelfLocked) {
      session.dispatch({ type: "setObjectFlags", ids: [...ids], patch: { locked: false } });
      return;
    }
    const onlyCollection = ids.every(
      (id) => isEditorObjectCollectionLocked(document, id) && !isEditorObjectSelfLocked(document, id),
    );
    if (onlyCollection) return;
    session.dispatch({ type: "setObjectFlags", ids: [...ids], patch: { locked: true } });
  };

  const activeDescendant = hierarchyActiveDescendantId(activeId, navigableIds);

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
          <p className="px-0.5 text-[10px] text-neutral-600">Drag rows to reparent · drop on empty list to unparent · F2 rename</p>
        ) : null}
      </div>
      <div
        ref={scrollRef}
        className={`min-h-0 flex-1 overflow-auto px-1.5 py-1 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-cyan-400/40 ${
          reparentDropTarget === "__root__" ? "bg-cyan-500/10 ring-1 ring-inset ring-cyan-400/30" : ""
        }`}
        tabIndex={0}
        role="tree"
        aria-label="Scene hierarchy"
        aria-multiselectable="true"
        aria-activedescendant={activeDescendant}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        onFocus={onListFocus}
        onKeyDown={onListKeyDown}
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
          <div style={{ height: win.totalHeight, position: "relative" }} role="none">
            <div style={{ transform: `translateY(${win.offsetTop}px)` }} role="none">
              {visible.map((row) => {
                if (row.type === "group") {
                  const kindVisible = visibility[row.kind] !== false;
                  return (
                    <div
                      key={row.key}
                      role="presentation"
                      style={{ height: ROW_HEIGHT }}
                      className="group flex items-center gap-0.5 pr-0.5"
                    >
                      <button
                        type="button"
                        tabIndex={-1}
                        className={`flex h-full min-w-0 flex-1 items-center gap-1 rounded-[5px] px-1 text-left text-[11px] font-semibold text-neutral-300 transition-colors hover:bg-white/[0.05] ${FOCUS_RING}`}
                        onMouseDown={preventFocusSteal}
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
                        tabIndex={-1}
                        aria-label={kindVisible ? `Hide ${row.kind} layer` : `Show ${row.kind} layer`}
                        aria-pressed={kindVisible}
                        title={kindVisible ? `Hide ${row.kind} layer` : `Show ${row.kind} layer`}
                        onMouseDown={preventFocusSteal}
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
                  const primaryId = row.ids[0]!;
                  const rowSelected = selectedId !== undefined && row.ids.includes(selectedId);
                  const cycleIndex = rowSelected ? row.ids.indexOf(selectedId) + 1 : 0;
                  const dropActive = materialDropTarget === row.key;
                  const locked = rowLocked(row.ids);
                  const hidden = rowHidden(row.ids);
                  const collectionOnlyLock =
                    locked &&
                    row.ids.every(
                      (id) =>
                        isEditorObjectCollectionLocked(document, id) && !isEditorObjectSelfLocked(document, id),
                    );
                  const active = activeId === primaryId;
                  const renaming = renamingId === primaryId && row.ids.length === 1;
                  return (
                    <div
                      key={row.key}
                      id={hierarchyRowDomId(primaryId)}
                      role="treeitem"
                      aria-selected={rowSelected}
                      aria-level={2}
                      style={{ height: ROW_HEIGHT }}
                      className={`group flex w-full items-center gap-0.5 rounded-[5px] pl-6 pr-0.5 text-[11px] transition-colors ${
                        dropActive
                          ? "bg-cyan-500/25 ring-1 ring-inset ring-cyan-300/50"
                          : rowSelected || active
                            ? "bg-cyan-500/15 text-cyan-100 ring-1 ring-inset ring-cyan-400/25"
                            : "text-neutral-300 hover:bg-white/[0.05]"
                      } ${hidden ? "opacity-55" : ""}`}
                      onDragOver={(event) => {
                        acceptMaterialDrop(event, row.ids, row.key);
                      }}
                      onDragLeave={() => setMaterialDropTarget((current) => (current === row.key ? null : current))}
                      onDrop={(event) => {
                        commitMaterialDrop(event, row.ids);
                      }}
                    >
                      <button
                        type="button"
                        tabIndex={-1}
                        className={`flex h-full min-w-0 flex-1 items-center gap-1.5 truncate rounded-[5px] pr-1 text-left ${FOCUS_RING}`}
                        onMouseDown={preventFocusSteal}
                        onClick={(event) => {
                          setActiveId(primaryId);
                          selectRow(primaryId, event.ctrlKey || event.metaKey || event.shiftKey);
                          focusTree();
                        }}
                        onDoubleClick={() => {
                          if (row.ids.length === 1) beginRename(primaryId, row.label);
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          setActiveId(primaryId);
                          onRowContextMenu?.(
                            { clientX: event.clientX, clientY: event.clientY },
                            primaryId,
                          );
                        }}
                      >
                        <Icon name={kindIcon(row.kind)} size={13} className={`shrink-0 ${rowSelected || active ? "text-cyan-300" : "text-neutral-500"}`} />
                        {renaming ? (
                          <input
                            ref={renameInputRef}
                            value={renameDraft}
                            onChange={(event) => setRenameDraft(event.target.value)}
                            onBlur={commitRename}
                            onKeyDown={(event) => {
                              event.stopPropagation();
                              if (event.key === "Enter") {
                                event.preventDefault();
                                commitRename();
                              } else if (event.key === "Escape") {
                                event.preventDefault();
                                cancelRename();
                              }
                            }}
                            onClick={(event) => event.stopPropagation()}
                            className={`min-w-0 flex-1 rounded-[3px] border border-cyan-400/40 bg-black/40 px-1 py-0 text-[11px] text-neutral-100 outline-none ${FOCUS_RING}`}
                            aria-label="Rename object"
                          />
                        ) : (
                          <span className="min-w-0 flex-1 truncate">
                            {row.label}
                            {row.ids.length > 1 ? (
                              <span className={`text-neutral-500 ${NUMERIC}`}>
                                {" "}×{row.ids.length}
                                {rowSelected ? ` · ${cycleIndex}/${row.ids.length} · N next` : ""}
                              </span>
                            ) : null}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-label={hidden ? "Show object in viewport" : "Hide object in viewport"}
                        aria-pressed={!hidden}
                        title={hidden ? "Show in viewport" : "Hide in viewport"}
                        onMouseDown={preventFocusSteal}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleHidden(row.ids);
                        }}
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] transition-colors hover:bg-white/[0.08] ${FOCUS_RING} ${
                          hidden
                            ? "text-neutral-500"
                            : "text-neutral-500 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        }`}
                      >
                        <Icon name={hidden ? "eyeOff" : "eye"} size={12} />
                      </button>
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-label={
                          collectionOnlyLock
                            ? "Locked by collection"
                            : locked
                              ? "Unlock object"
                              : "Lock object"
                        }
                        aria-pressed={locked}
                        title={
                          collectionOnlyLock
                            ? "Locked by collection — unlock in Collections panel"
                            : locked
                              ? "Unlock object"
                              : "Lock object"
                        }
                        disabled={collectionOnlyLock}
                        onMouseDown={preventFocusSteal}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleLocked(row.ids);
                        }}
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING} ${
                          locked
                            ? "text-amber-400/80"
                            : "text-neutral-500 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        }`}
                      >
                        <Icon name={locked ? "lock" : "unlock"} size={11} />
                      </button>
                    </div>
                  );
                }
                const rowSelected = selection.includes(row.id);
                const materialDrop = materialDropTarget === row.key;
                const reparentDrop = reparentDropTarget === row.key && draggingObjectId !== row.id;
                const locked = isEditorObjectLocked(document, row.id);
                const hidden = isEditorObjectHidden(document, row.id);
                const collectionOnlyLock =
                  isEditorObjectCollectionLocked(document, row.id) && !isEditorObjectSelfLocked(document, row.id);
                const dragging = draggingObjectId === row.id;
                const active = activeId === row.id;
                const renaming = renamingId === row.id;
                const expanded = row.hasChildren ? collapsedNodes[row.id] !== true : undefined;
                return (
                  <div
                    key={row.key}
                    id={hierarchyRowDomId(row.id)}
                    role="treeitem"
                    aria-selected={rowSelected}
                    aria-level={row.depth + 1}
                    aria-expanded={expanded}
                    style={{ height: ROW_HEIGHT, paddingLeft: `${row.depth * 12}px` }}
                    className={`group flex items-center ${hidden ? "opacity-55" : ""}`}
                  >
                    {row.hasChildren ? (
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-label={collapsedNodes[row.id] === true ? "Expand children" : "Collapse children"}
                        className={`flex h-4 w-4 shrink-0 items-center justify-center text-neutral-500 transition-colors hover:text-neutral-200 ${FOCUS_RING}`}
                        onMouseDown={preventFocusSteal}
                        onClick={() => setCollapsedNodes((previous) => ({ ...previous, [row.id]: !(previous[row.id] === true) }))}
                      >
                        <Icon name={collapsedNodes[row.id] === true ? "chevronRight" : "chevronDown"} size={10} />
                      </button>
                    ) : (
                      <span className="w-4 shrink-0" aria-hidden="true" />
                    )}
                    <button
                      type="button"
                      tabIndex={-1}
                      draggable
                      className={`flex h-full min-w-0 flex-1 items-center gap-1.5 truncate rounded-[5px] px-1.5 text-left text-[11px] transition-colors ${FOCUS_RING} ${
                        materialDrop || reparentDrop
                          ? "bg-cyan-500/25 ring-1 ring-inset ring-cyan-300/50"
                          : rowSelected || active
                            ? "bg-cyan-500/15 text-cyan-100 ring-1 ring-inset ring-cyan-400/25"
                            : "text-neutral-300 hover:bg-white/[0.05]"
                      } ${dragging ? "opacity-50" : ""}`}
                      onMouseDown={preventFocusSteal}
                      onClick={(event) => {
                        setActiveId(row.id);
                        selectRow(row.id, event.ctrlKey || event.metaKey || event.shiftKey);
                        focusTree();
                      }}
                      onDoubleClick={() => beginRename(row.id, row.label)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setActiveId(row.id);
                        onRowContextMenu?.(
                          { clientX: event.clientX, clientY: event.clientY },
                          row.id,
                        );
                      }}
                      title={`${row.id} — drag to reparent · F2 rename · Enter frame · right-click menu`}
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
                      <Icon name={kindIcon(row.kind)} size={13} className={`shrink-0 ${rowSelected || active ? "text-cyan-300" : "text-neutral-500"}`} />
                      {renaming ? (
                        <input
                          ref={renameInputRef}
                          value={renameDraft}
                          onChange={(event) => setRenameDraft(event.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(event) => {
                            event.stopPropagation();
                            if (event.key === "Enter") {
                              event.preventDefault();
                              commitRename();
                            } else if (event.key === "Escape") {
                              event.preventDefault();
                              cancelRename();
                            }
                          }}
                          onClick={(event) => event.stopPropagation()}
                          className={`min-w-0 flex-1 rounded-[3px] border border-cyan-400/40 bg-black/40 px-1 py-0 text-[11px] text-neutral-100 outline-none ${FOCUS_RING}`}
                          aria-label="Rename object"
                        />
                      ) : (
                        <span className="min-w-0 flex-1 truncate">{row.label}</span>
                      )}
                      <span className="text-[9px] text-neutral-600">{row.kind}</span>
                    </button>
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label={hidden ? "Show object in viewport" : "Hide object in viewport"}
                      aria-pressed={!hidden}
                      title={hidden ? "Show in viewport" : "Hide in viewport"}
                      onMouseDown={preventFocusSteal}
                      onClick={() => toggleHidden([row.id])}
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] transition-colors hover:bg-white/[0.08] ${FOCUS_RING} ${
                        hidden
                          ? "text-neutral-500"
                          : "text-neutral-500 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                      }`}
                    >
                      <Icon name={hidden ? "eyeOff" : "eye"} size={12} />
                    </button>
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label={
                        collectionOnlyLock ? "Locked by collection" : locked ? "Unlock object" : "Lock object"
                      }
                      aria-pressed={locked}
                      title={
                        collectionOnlyLock
                          ? "Locked by collection — unlock in Collections panel"
                          : locked
                            ? "Unlock object"
                            : "Lock object"
                      }
                      disabled={collectionOnlyLock}
                      onMouseDown={preventFocusSteal}
                      onClick={() => toggleLocked([row.id])}
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING} ${
                        locked
                          ? "text-amber-400/80"
                          : "text-neutral-500 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                      }`}
                    >
                      <Icon name={locked ? "lock" : "unlock"} size={11} />
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

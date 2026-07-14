import { memo, useEffect, useMemo, useRef, useState } from "react";

import type { EditorSession } from "@jgengine/core/editor/index";

import { flattenOutliner } from "./outlinerModel";
import type { EditorHostApi } from "./session";
import { shallowArrayEqual, useStoreSelector, virtualWindow } from "./useStoreSelector";

const ROW_HEIGHT = 26;
const INPUT =
  "rounded-md border border-white/10 bg-black/40 px-2 py-1 outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-400/60 focus:bg-black/60";

/**
 * The scene outliner as an isolated, selector-subscribed, virtualized panel. It reads only the
 * document + selection slices via `useStoreSelector`, so UI-only churn (gizmo mode, snapping, tool
 * changes) never rerenders it, and it windows its row list with `virtualWindow`, so a scene with
 * thousands of objects only ever mounts the visible handful of rows. Memoized against its stable
 * `session`/`api` props.
 * @internal — mounted by `EditorChrome`.
 */
export const OutlinerPanel = memo(function OutlinerPanel({
  session,
  api,
}: {
  session: EditorSession;
  api: EditorHostApi;
}) {
  const document = useStoreSelector(session, (state) => state.document);
  const selection = useStoreSelector(session, (state) => state.selection, shallowArrayEqual);
  const selectedId = selection[0];

  const [view, setView] = useState<"kind" | "tree">("kind");
  const [query, setQuery] = useState("");
  const [collapsedKinds, setCollapsedKinds] = useState<Record<string, boolean>>({});
  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({});

  const rows = useMemo(
    () => flattenOutliner(document, { view, query, collapsedKinds, collapsedNodes }),
    [document, view, query, collapsedKinds, collapsedNodes],
  );

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

  return (
    <>
      <div className="space-y-1.5 border-b border-white/[0.08] p-2">
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search objects and kinds…" className={`w-full ${INPUT} px-2.5 py-1.5`} />
        <div className="flex gap-0.5 rounded-md bg-black/40 p-0.5 ring-1 ring-inset ring-white/[0.06]">
          {(["kind", "tree"] as const).map((mode) => (
            <button key={mode} type="button" className={`flex-1 rounded px-2 py-0.5 text-[10px] transition-colors ${view === mode ? "bg-cyan-500/80 text-white" : "text-neutral-400 hover:text-neutral-200"}`} onClick={() => setView(mode)}>{mode === "kind" ? "By kind" : "Tree"}</button>
          ))}
        </div>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto p-2" onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
        {rows.length === 0 ? (
          <div className="p-3 text-center text-neutral-600">{query.length > 0 ? "No matching objects" : "No objects yet"}</div>
        ) : (
          <div style={{ height: win.totalHeight, position: "relative" }}>
            <div style={{ transform: `translateY(${win.offsetTop}px)` }}>
              {visible.map((row) => {
                if (row.type === "group") {
                  return (
                    <button key={row.key} type="button" style={{ height: ROW_HEIGHT }} className="flex w-full items-center gap-1 rounded-md px-1.5 text-left font-semibold text-neutral-300 transition-colors hover:bg-white/[0.06]" onClick={() => setCollapsedKinds((previous) => ({ ...previous, [row.kind]: !(previous[row.kind] === true) }))}>
                      <span className="w-3 text-neutral-500">{row.collapsed ? "▸" : "▾"}</span><span>{row.kind}</span><span className="ml-auto text-neutral-500">{row.total}</span>
                    </button>
                  );
                }
                if (row.type === "kindItem") {
                  const rowSelected = selectedId !== undefined && row.ids.includes(selectedId);
                  const cycleIndex = rowSelected ? row.ids.indexOf(selectedId) + 1 : 0;
                  return (
                    <button key={row.key} type="button" style={{ height: ROW_HEIGHT }} className={`block w-full truncate rounded-md pl-5 pr-1.5 text-left transition-colors ${rowSelected ? "bg-cyan-500/15 text-cyan-100 ring-1 ring-inset ring-cyan-400/20" : "text-neutral-300 hover:bg-white/[0.06]"}`} onClick={(event) => selectRow(row.ids[0]!, event.ctrlKey || event.metaKey || event.shiftKey)}>
                      {row.label}{row.ids.length > 1 ? <span className="text-neutral-500"> ×{row.ids.length}{rowSelected ? ` · ${cycleIndex}/${row.ids.length} · N next` : ""}</span> : null}
                    </button>
                  );
                }
                const rowSelected = selection.includes(row.id);
                return (
                  <div key={row.key} style={{ height: ROW_HEIGHT, paddingLeft: `${row.depth * 12}px` }} className="flex items-center">
                    {row.hasChildren ? (
                      <button type="button" className="w-4 shrink-0 text-neutral-500 transition-colors hover:text-neutral-200" onClick={() => setCollapsedNodes((previous) => ({ ...previous, [row.id]: !(previous[row.id] === true) }))}>{collapsedNodes[row.id] === true ? "▸" : "▾"}</button>
                    ) : <span className="w-4 shrink-0" />}
                    <button type="button" className={`flex-1 truncate rounded-md px-1.5 text-left transition-colors ${rowSelected ? "bg-cyan-500/15 text-cyan-100 ring-1 ring-inset ring-cyan-400/20" : "text-neutral-300 hover:bg-white/[0.06]"}`} onClick={(event) => selectRow(row.id, event.ctrlKey || event.metaKey || event.shiftKey)} title={row.id}>
                      {row.label}<span className="ml-1 text-[9px] text-neutral-600">{row.kind}</span>
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

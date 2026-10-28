import { useEffect, useMemo, useState } from "react";

import { libraryLicenseLabel, libraryTagCounts, searchLibrary, type LibraryEntry } from "@jgengine/assets/library/assetLibrary";
import { licenseRequiresCredit } from "@jgengine/assets/library/libraryLicense";
import { LIBRARY_KINDS, librarySource, type LibraryKind } from "@jgengine/assets/library/librarySources";

import { encodeLibraryDragPayload, isPlaceableLibraryKind, LIBRARY_DRAG_MIME } from "../libraryDrag";
import { Icon } from "./icons";
import { FOCUS_RING, INPUT_CLS, MICRO_LABEL } from "./theme";
import { EmptyState } from "./ui";

/** Loads the shared asset library index; lazy so the editor bundle never carries it until opened. */
export type LibraryLoader = () => Promise<readonly LibraryEntry[]>;

const defaultLoader: LibraryLoader = () => import("@jgengine/assets/library/libraryIndex").then((module) => module.assetLibrary());

const KIND_LABEL: Record<LibraryKind, string> = {
  model: "Models",
  character: "Characters",
  animation: "Animations",
  material: "Materials",
  decal: "Decals",
  hdri: "HDRIs",
  icon: "Icons",
};

/** How many cards the grid renders at once; the footer counts the rest. */
const PAGE = 240;

function formatSize(size: readonly [number, number, number]): string {
  return size.map((value) => (value >= 10 ? value.toFixed(0) : value.toFixed(2))).join(" × ");
}

/**
 * The shared asset library inside the Content Browser: search thousands of licensed models,
 * characters, materials, decals, HDRIs and icons by words, kind and tag, with provider thumbnails,
 * licence and credit on every card. `onAdd` serves the picked asset in the running game (the dev
 * server pulls it through the shared asset store); without it the panel offers the key to copy.
 * Model and character cards drag onto the viewport, which pulls and places them.
 * @internal — mounted by `ContentBrowser` as its Library folder.
 */
export function AssetLibraryBrowser({
  loadLibrary = defaultLoader,
  onAdd,
  initialQuery = "",
  initialKind = "all",
}: {
  loadLibrary?: LibraryLoader;
  onAdd?: (entry: LibraryEntry) => Promise<string | null>;
  initialQuery?: string;
  initialKind?: LibraryKind | "all";
}) {
  const [library, setLibrary] = useState<readonly LibraryEntry[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const [kind, setKind] = useState<LibraryKind | "all">(initialKind);
  const [tags, setTags] = useState<readonly string[]>([]);
  const [noCredit, setNoCredit] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [status, setStatus] = useState<Record<string, string>>({});

  useEffect(() => {
    let live = true;
    loadLibrary().then(
      (entries) => {
        if (live) setLibrary(entries);
      },
      (error: unknown) => {
        if (live) setFailed(error instanceof Error ? error.message : String(error));
      },
    );
    return () => {
      live = false;
    };
  }, [loadLibrary]);

  const kindCounts = useMemo(() => {
    const counts = new Map<LibraryKind, number>();
    for (const entry of library ?? []) counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1);
    return counts;
  }, [library]);

  const hits = useMemo(
    () =>
      library === null
        ? []
        : searchLibrary(library, query, {
            ...(kind === "all" ? {} : { kind }),
            ...(tags.length === 0 ? {} : { tags }),
            ...(noCredit ? { noCredit: true } : {}),
            limit: 0,
          }).map((hit) => hit.entry),
    [library, query, kind, tags, noCredit],
  );
  const topTags = useMemo(() => libraryTagCounts(hits, 18).filter((row) => !tags.includes(row.tag)), [hits, tags]);
  const selected = hits.find((entry) => entry.key === selectedKey) ?? null;

  const add = async (entry: LibraryEntry) => {
    if (onAdd === undefined) return;
    setStatus((current) => ({ ...current, [entry.key]: "Adding…" }));
    const url = await onAdd(entry).catch(() => null);
    setStatus((current) => ({ ...current, [entry.key]: url === null ? "Could not add" : `Served at ${url}` }));
  };

  if (failed !== null) return <EmptyState icon="warning" title="Asset library unavailable" description={failed} />;
  if (library === null) return <EmptyState icon="clock" title="Loading the asset library…" description="Reading the index of licensed models, materials, HDRIs and icons." />;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-asset-library="">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-white/[0.06] px-2 py-1.5">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${library.length.toLocaleString()} assets…`}
          aria-label="Search the asset library"
          className={`h-6.5 w-56 px-2 ${INPUT_CLS}`}
        />
        <div role="tablist" aria-label="Asset kind" className="flex flex-wrap gap-0.5">
          {(["all", ...LIBRARY_KINDS] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={kind === value}
              onClick={() => {
                setKind(value);
                setTags([]);
              }}
              className={`rounded-[4px] px-1.5 py-0.5 text-[10px] transition-colors ${FOCUS_RING} ${
                kind === value ? "bg-cyan-500/20 text-cyan-100" : "text-neutral-400 hover:bg-white/[0.05] hover:text-neutral-200"
              }`}
            >
              {value === "all" ? "All" : KIND_LABEL[value]}
              <span className="ml-1 tabular-nums text-neutral-600">{value === "all" ? library.length : (kindCounts.get(value) ?? 0)}</span>
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-1 text-[10px] text-neutral-400">
          <input type="checkbox" checked={noCredit} onChange={(event) => setNoCredit(event.target.checked)} />
          No credit needed (CC0)
        </label>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-white/[0.04] px-2 py-1">
        <span className={MICRO_LABEL}>Tags</span>
        {tags.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => setTags(tags.filter((other) => other !== tag))}
            className={`flex items-center gap-0.5 rounded-full bg-cyan-500/20 px-1.5 py-px text-[10px] text-cyan-100 ${FOCUS_RING}`}
            title="Remove tag filter"
          >
            {tag}
            <Icon name="close" size={8} />
          </button>
        ))}
        {topTags.map((row) => (
          <button
            key={row.tag}
            type="button"
            onClick={() => setTags([...tags, row.tag])}
            className={`rounded-full bg-white/[0.05] px-1.5 py-px text-[10px] text-neutral-400 hover:bg-white/10 hover:text-neutral-200 ${FOCUS_RING}`}
          >
            {row.tag}
            <span className="ml-0.5 tabular-nums text-neutral-600">{row.count}</span>
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 min-w-0 flex-1 overflow-auto p-2">
          {hits.length === 0 ? (
            <EmptyState icon="search" title="Nothing matches" description={`No ${kind === "all" ? "asset" : KIND_LABEL[kind].toLowerCase()} matches “${query}”${tags.length > 0 ? ` with ${tags.join(", ")}` : ""}.`} />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-1.5">
              {hits.slice(0, PAGE).map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  data-library-key={entry.key}
                  onClick={() => setSelectedKey(entry.key)}
                  onDoubleClick={() => void add(entry)}
                  draggable={isPlaceableLibraryKind(entry.kind)}
                  onDragStart={(event) => {
                    if (!isPlaceableLibraryKind(entry.kind)) return;
                    event.dataTransfer.setData(LIBRARY_DRAG_MIME, encodeLibraryDragPayload(entry));
                    event.dataTransfer.effectAllowed = "copy";
                  }}
                  title={`${entry.title} — ${entry.author} (${libraryLicenseLabel(entry.license)})${isPlaceableLibraryKind(entry.kind) ? " · drag onto the viewport to place" : ""}`}
                  className={`group flex flex-col overflow-hidden rounded-[6px] border text-left transition-colors ${FOCUS_RING} ${
                    entry.key === selectedKey ? "border-cyan-400/50 bg-cyan-500/10" : "border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04]"
                  }`}
                >
                  <div className="flex h-[72px] items-center justify-center overflow-hidden border-b border-white/[0.05] bg-black/30 text-neutral-500">
                    {entry.thumbnail === undefined ? (
                      <Icon name={entry.kind === "material" ? "sphere" : entry.kind === "icon" ? "image" : entry.kind === "animation" ? "film" : "cube"} size={22} />
                    ) : (
                      <img
                        src={entry.thumbnail}
                        alt=""
                        loading="lazy"
                        draggable={false}
                        className={entry.kind === "icon" ? "h-12 w-12 rounded-[4px]" : "h-full w-full object-cover"}
                      />
                    )}
                  </div>
                  <div className="p-1.5">
                    <div className="truncate text-[10px] text-neutral-200">{entry.title}</div>
                    <div className="mt-0.5 flex items-center gap-1">
                      <span
                        className={`rounded-[3px] px-1 py-px text-[8px] uppercase tracking-wider ${
                          licenseRequiresCredit(entry.license) ? "bg-amber-500/15 text-amber-200/80" : "bg-emerald-500/15 text-emerald-200/80"
                        }`}
                      >
                        {libraryLicenseLabel(entry.license)}
                      </span>
                      <span className="truncate text-[8px] text-neutral-600">{librarySource(entry.source)?.title ?? entry.source}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {selected !== null ? (
          <aside className="w-56 shrink-0 overflow-auto border-l border-white/[0.06] p-2.5" aria-label="Library asset details">
            <div className="flex h-28 items-center justify-center overflow-hidden rounded-[6px] border border-white/[0.07] bg-black/30">
              {selected.thumbnail === undefined ? <Icon name="cube" size={28} /> : <img src={selected.thumbnail} alt="" className="h-full w-full object-contain" />}
            </div>
            <div className="mt-2 text-[12px] font-medium text-neutral-100">{selected.title}</div>
            <dl className="mt-1.5 space-y-1 text-[10px]">
              {(
                [
                  ["Kind", selected.kind],
                  ["Author", selected.author],
                  ["Licence", libraryLicenseLabel(selected.license) + (licenseRequiresCredit(selected.license) ? " · credit added" : "")],
                  ["Source", librarySource(selected.source)?.title ?? selected.source],
                  ["Key", selected.key],
                  ...(selected.triangles === undefined ? [] : [["Triangles", selected.triangles.toLocaleString()] as const]),
                  ...(selected.size === undefined ? [] : [["Size (m)", formatSize(selected.size)] as const]),
                  ...(selected.rigged === true ? [["Rig", "rigged"] as const] : []),
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex justify-between gap-2">
                  <dt className="shrink-0 text-neutral-600">{label}</dt>
                  <dd className="min-w-0 truncate text-right text-neutral-300" title={value}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            {selected.tags.length > 0 ? <div className="mt-1.5 text-[9px] leading-relaxed text-neutral-500">{selected.tags.slice(0, 14).join(" · ")}</div> : null}
            <a href={selected.page} target="_blank" rel="noreferrer" className="mt-1.5 block truncate text-[10px] text-cyan-300 hover:underline">
              Source page
            </a>
            {onAdd !== undefined ? (
              <button
                type="button"
                onClick={() => void add(selected)}
                className={`mt-2.5 w-full rounded-[5px] bg-cyan-600 px-2 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-cyan-500 ${FOCUS_RING}`}
              >
                Add to game
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void navigator.clipboard?.writeText(`"${selected.key}"`)}
              className={`mt-1.5 w-full rounded-[5px] bg-white/[0.06] px-2 py-1 text-[10px] text-neutral-300 hover:bg-white/10 ${FOCUS_RING}`}
              title="Quote this key in the game's source; provisioning pulls it"
            >
              Copy key
            </button>
            {status[selected.key] !== undefined ? <div className="mt-1.5 break-all text-[10px] text-neutral-400">{status[selected.key]}</div> : null}
          </aside>
        ) : null}
      </div>

      <div className="flex h-7 shrink-0 items-center gap-2 border-t border-white/[0.06] px-2 text-[10px] text-neutral-600">
        <span className="tabular-nums">
          {Math.min(hits.length, PAGE).toLocaleString()} shown of {hits.length.toLocaleString()} matches · {library.length.toLocaleString()} in the library
        </span>
        <span className="ml-auto truncate">CC0, public domain, MIT and CC BY only · credits generate from each asset</span>
      </div>
    </div>
  );
}

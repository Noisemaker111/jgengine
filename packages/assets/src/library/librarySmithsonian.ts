import type { LibraryRecord } from "./assetLibrary";
import { cleanTags, type IngestOptions } from "./libraryIngest";

/** The Smithsonian Open Access search for every item with a 3D model. */
const SEARCH = "https://api.si.edu/openaccess/api/v1.0/search";
const PAGE_ROWS = 1000;
/** Pulls stay game-sized: a model whose smallest GLB is larger is left out. */
const MAX_GLB_BYTES = 40_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function at(value: unknown, ...path: string[]): unknown {
  let current = value;
  for (const key of path) current = isRecord(current) ? current[key] : undefined;
  return current;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** A resource's flattened attribute list (`[{ UNITS }, { FILE_SIZE }]`). */
function attributes(resource: unknown): Record<string, unknown> {
  return Object.assign({}, ...list(at(resource, "attributes")).filter(isRecord));
}

/**
 * The GLB a game pulls from one 3D package: a Draco-compressed one when offered (the engine decodes
 * Draco), else the smallest plain one, under the size cap.
 */
function chooseGlb(resources: readonly unknown[]): string | undefined {
  const glbs = resources.flatMap((resource) => {
    const file = text(at(resource, "filename"));
    const size = attributes(resource)["FILE_SIZE"];
    if (file === undefined || !/\.glb$/i.test(file)) return [];
    // Many packages list no size; those rank after the measured ones and are not capped.
    return [{ file, size: typeof size === "number" ? size : MAX_GLB_BYTES, draco: /draco/i.test(`${file} ${String(attributes(resource)["MODEL_FILE_TYPE"])}`) }];
  });
  return glbs
    .filter((glb) => glb.size <= MAX_GLB_BYTES)
    .sort((a, b) => Number(b.draco) - Number(a.draco) || a.size - b.size)[0]?.file;
}

function words(value: string): string[] {
  return value.split(/[^A-Za-z0-9]+/).filter((word) => word.length > 2);
}

/**
 * Library records for one Open Access search row: one per 3D package whose own usage is CC0 and
 * that offers a GLB. The item's data source is credited beside the Smithsonian.
 *
 * @internal
 */
export function smithsonianRecords(row: unknown): LibraryRecord[] {
  const content = at(row, "content");
  const title = text(at(row, "title")) ?? text(at(content, "descriptiveNonRepeating", "title", "content"));
  if (title === undefined) return [];
  const unit = text(at(content, "descriptiveNonRepeating", "data_source"));
  const structured = at(content, "indexedStructured");
  const topics = ["topic", "object_type", "place"].flatMap((key) => list(at(structured, key)).flatMap((value) => (typeof value === "string" ? [value] : [])));
  const media = list(at(content, "descriptiveNonRepeating", "online_media", "media")).filter((item) => at(item, "type") === "3d_voyager");
  return media.flatMap((item, index): LibraryRecord[] => {
    if (at(item, "usage", "access") !== "CC0") return [];
    const id = /^3d_package:([0-9a-f-]{36})$/i.exec(text(at(item, "id")) ?? "")?.[1];
    const file = chooseGlb(list(at(item, "resources")));
    if (id === undefined || file === undefined) return [];
    const part = media.length > 1 ? ` (part ${index + 1})` : "";
    return [
      {
        id,
        title: `${title}${part}`.slice(0, 100),
        kind: "model",
        tags: cleanTags(["scan", "museum", "smithsonian", ...topics, ...words(title)]),
        author: unit === undefined ? "Smithsonian Institution" : `${unit}, Smithsonian Institution`,
        license: "CC0-1.0",
        file,
      },
    ];
  });
}

/**
 * Smithsonian Open Access: every 3D package its API marks CC0, checked package by package, with the
 * GLB a pull fetches. Reads the api.data.gov key from `SI_API_KEY` (the shared `DEMO_KEY` works for
 * the two requests a full ingest makes).
 *
 * @internal
 */
export async function ingestSmithsonian(options: IngestOptions & { apiKey?: string } = {}): Promise<LibraryRecord[]> {
  const fetchImpl = options.fetchImpl ?? ((url: string, init?: { headers?: Record<string, string> }) => fetch(url, init));
  const key = options.apiKey ?? process.env["SI_API_KEY"] ?? "DEMO_KEY";
  const records: LibraryRecord[] = [];
  const seen = new Set<string>();
  for (let start = 0, total = Number.POSITIVE_INFINITY; start < total; start += PAGE_ROWS) {
    const url = `${SEARCH}?q=${encodeURIComponent('online_media_type:"3D Models"')}&rows=${PAGE_ROWS}&start=${start}&api_key=${encodeURIComponent(key)}`;
    const response = await fetchImpl(url, { headers: { "user-agent": "jgengine-asset-library" } });
    if (!response.ok) throw new Error(`Smithsonian Open Access search: HTTP ${response.status}`);
    const body: unknown = await response.json();
    const rows = list(at(body, "response", "rows"));
    const count = at(body, "response", "rowCount");
    total = typeof count === "number" ? count : 0;
    for (const row of rows) {
      for (const record of smithsonianRecords(row)) {
        if (seen.has(record.id)) continue;
        seen.add(record.id);
        records.push(record);
      }
    }
    options.log?.(`smithsonian: ${records.length} CC0 models from ${Math.min(start + PAGE_ROWS, total)} of ${total} items`);
    if (rows.length === 0) break;
  }
  return options.limit === undefined ? records : records.slice(0, options.limit);
}

/** Where a Smithsonian entry's GLB downloads from. @internal */
export function smithsonianGlbUrl(entry: { id: string; file?: string | undefined }): string {
  if (entry.file === undefined) throw new Error(`smithsonian:${entry.id} names no GLB`);
  return `https://3d-api.si.edu/content/document/3d_package:${entry.id}/resources/${encodeURIComponent(entry.file)}`;
}

import type { CreditsDocument, CreditsSection } from "@jgengine/core/menu/credits";

import { EXCLUDED_PROVIDERS, isLibraryLicense, licenseRequiresCredit, type LibraryLicense } from "./libraryLicense";
import { fillLibraryTemplate, LIBRARY_KINDS, librarySource, type LibraryKind, type LibrarySourceId } from "./librarySources";

/**
 * One indexed asset as ingest writes it: only what differs from its source's defaults. Committed as
 * JSON under `library/generated/`; the bytes stay upstream until `assets pull <key>`.
 */
export interface LibraryRecord {
  /** The provider's own id (`ArmChair_01`, `lorc/broadsword`, a Sketchfab uid). */
  id: string;
  title: string;
  kind: LibraryKind;
  tags: readonly string[];
  author?: string;
  license?: LibraryLicense;
  thumbnail?: string;
  page?: string;
  /** Stored triangle count the provider reports. */
  triangles?: number;
  /** Bounding size in metres, `[width, height, depth]`. */
  size?: readonly [number, number, number];
  rigged?: boolean;
  /** The `AssetSource` pack whose archive holds the bytes (KayKit, Quaternius, game-icons). */
  pack?: string;
  /** The entry's file inside {@link pack}. */
  file?: string;
}

/** A committed ingest result: one source's records. */
export interface LibraryRecordFile {
  source: LibrarySourceId;
  /** When ingest last read the upstream (ISO date). */
  ingested: string;
  records: readonly LibraryRecord[];
}

/** One asset in the shared library, with its source defaults filled in. */
export interface LibraryEntry extends LibraryRecord {
  /** `<source>:<id>`: the stable key games quote and `assets pull` takes. */
  key: string;
  source: LibrarySourceId;
  license: LibraryLicense;
  author: string;
  page: string;
}

function field<T>(value: unknown, check: (candidate: unknown) => candidate is T): T | undefined {
  return check(value) ? value : undefined;
}

const isString = (value: unknown): value is string => typeof value === "string";
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isKind = (value: unknown): value is LibraryKind => typeof value === "string" && LIBRARY_KINDS.some((kind) => kind === value);
const isSourceId = (value: unknown): value is LibrarySourceId => typeof value === "string" && librarySource(value) !== undefined;

/**
 * Reads one committed ingest file from untyped JSON, refusing a record whose id, title, kind, tags or
 * licence is malformed. Optional fields of the wrong type are dropped.
 *
 * @internal
 */
export function readLibraryRecordFile(value: unknown): LibraryRecordFile {
  if (typeof value !== "object" || value === null || !("source" in value) || !("records" in value)) throw new Error("library file: expected { source, records }");
  const source = field(value.source, isSourceId);
  if (source === undefined) throw new Error(`library file: unknown source ${String(value.source)}`);
  const ingested = "ingested" in value && isString(value.ingested) ? value.ingested : "unknown";
  const raw: unknown = value.records;
  if (!Array.isArray(raw)) throw new Error(`library file ${source}: records is not an array`);
  const records = raw.map((item: unknown, index): LibraryRecord => {
    const get = (key: string): unknown => (typeof item === "object" && item !== null && key in item ? Object.getOwnPropertyDescriptor(item, key)?.value : undefined);
    const id = field(get("id"), isString);
    const title = field(get("title"), isString);
    const kind = field(get("kind"), isKind);
    const tagsRaw = get("tags");
    if (id === undefined || title === undefined || kind === undefined || !Array.isArray(tagsRaw)) throw new Error(`library file ${source}: record ${index} is malformed`);
    const record: LibraryRecord = { id, title, kind, tags: tagsRaw.filter(isString) };
    const license = get("license");
    if (license !== undefined) {
      if (!isLibraryLicense(license)) throw new Error(`library file ${source}: ${id} has licence ${String(license)}, which the library refuses`);
      record.license = license;
    }
    const author = field(get("author"), isString);
    if (author !== undefined) record.author = author;
    const thumbnail = field(get("thumbnail"), isString);
    if (thumbnail !== undefined) record.thumbnail = thumbnail;
    const page = field(get("page"), isString);
    if (page !== undefined) record.page = page;
    const triangles = field(get("triangles"), isNumber);
    if (triangles !== undefined) record.triangles = triangles;
    const size = get("size");
    if (Array.isArray(size) && size.length === 3) {
      const [x, y, z] = size;
      if (isNumber(x) && isNumber(y) && isNumber(z)) record.size = [x, y, z];
    }
    if (get("rigged") === true) record.rigged = true;
    const pack = field(get("pack"), isString);
    if (pack !== undefined) record.pack = pack;
    const file = field(get("file"), isString);
    if (file !== undefined) record.file = file;
    return record;
  });
  return { source, ingested, records };
}

/**
 * The {@link LibraryKind} a string names, or undefined.
 *
 * @internal
 */
export function parseLibraryKind(value: string | undefined): LibraryKind | undefined {
  return isKind(value) ? value : undefined;
}

/**
 * The {@link LibrarySourceId} a string names, or undefined.
 *
 * @internal
 */
export function parseLibrarySourceId(value: string | undefined): LibrarySourceId | undefined {
  return isSourceId(value) ? value : undefined;
}

/**
 * Fills a record's source defaults into a {@link LibraryEntry}. Throws for an unknown source.
 *
 * @internal
 */
export function expandLibraryRecord(source: LibrarySourceId, record: LibraryRecord): LibraryEntry {
  const info = librarySource(source);
  if (info === undefined) throw new Error(`unknown library source: ${source}`);
  const templated = info.thumbnail !== undefined && (info.thumbnailKinds === undefined || info.thumbnailKinds.includes(record.kind));
  const thumbnail = record.thumbnail ?? (templated && info.thumbnail !== undefined ? fillLibraryTemplate(info.thumbnail, record.id) : undefined);
  return {
    ...record,
    key: `${source}:${record.id}`,
    source,
    license: record.license ?? info.license,
    author: record.author ?? info.author,
    page: record.page ?? fillLibraryTemplate(info.page, record.id),
    ...(thumbnail === undefined ? {} : { thumbnail }),
  };
}

/**
 * Expands every record of each committed file.
 *
 * @internal
 */
export function expandLibraryFiles(files: readonly LibraryRecordFile[]): LibraryEntry[] {
  return files.flatMap((file) => file.records.map((record) => expandLibraryRecord(file.source, record)));
}

/** One reason a library entry is refused. */
export interface LibraryIssue {
  key: string;
  problem: string;
}

/**
 * Checks every entry carries an accepted licence, an author, a page and a credit-ready title, that
 * kinds are known, keys are unique and tags are lowercase. An empty array means the library is clean.
 *
 * @capability library-validate check every library entry has an allowed licence and full credit fields
 */
export function validateLibrary(entries: readonly LibraryEntry[]): LibraryIssue[] {
  const issues: LibraryIssue[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const flag = (problem: string) => issues.push({ key: entry.key, problem });
    if (seen.has(entry.key)) flag("duplicate key");
    seen.add(entry.key);
    if (!isLibraryLicense(entry.license)) flag(`licence "${String(entry.license)}" is not CC0, public domain, MIT or CC BY`);
    if (entry.author.trim() === "") flag("no author");
    if (EXCLUDED_PROVIDERS.test(`${entry.author} ${entry.title} ${entry.tags.join(" ")}`)) flag("comes from an excluded provider");
    if (entry.title.trim() === "") flag("no title");
    if (!/^https:\/\//.test(entry.page)) flag("no https page");
    if (entry.thumbnail !== undefined && !/^https:\/\//.test(entry.thumbnail)) flag("thumbnail is not an https URL");
    if (!LIBRARY_KINDS.includes(entry.kind)) flag(`unknown kind "${entry.kind}"`);
    if (librarySource(entry.source) === undefined) flag(`unknown source "${entry.source}"`);
    for (const tag of entry.tags) if (tag !== tag.toLowerCase() || tag.trim() !== tag || tag === "") flag(`tag "${tag}" is not lowercase and trimmed`);
  }
  return issues;
}

/** Filters for {@link searchLibrary}. */
export interface LibrarySearchOptions {
  kind?: LibraryKind | readonly LibraryKind[];
  source?: LibrarySourceId;
  /** Every tag must be present. */
  tags?: readonly string[];
  /** Keep only entries that need no visible credit (CC0 and public domain). */
  noCredit?: boolean;
  /** Most results returned. Default 60; 0 returns every match. */
  limit?: number;
}

/** A ranked {@link searchLibrary} hit. */
export interface LibraryHit {
  entry: LibraryEntry;
  score: number;
}

const haystacks = new WeakMap<LibraryEntry, { words: readonly string[]; text: string }>();

function words(value: string): string[] {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 0);
}

function haystack(entry: LibraryEntry): { words: readonly string[]; text: string } {
  let cached = haystacks.get(entry);
  if (cached === undefined) {
    const all = [...words(entry.title), ...entry.tags.flatMap(words), ...words(entry.id)];
    cached = { words: all, text: `${entry.title} ${entry.tags.join(" ")} ${entry.id}`.toLowerCase() };
    haystacks.set(entry, cached);
  }
  return cached;
}

function scoreTerm(entry: LibraryEntry, term: string): number {
  const titleWords = words(entry.title);
  if (titleWords.includes(term)) return 10;
  if (entry.tags.includes(term)) return 7;
  const hay = haystack(entry);
  if (hay.words.includes(term)) return 5;
  if (term.length >= 3 && hay.words.some((word) => word.startsWith(term))) return 3;
  if (term.length >= 4 && hay.text.includes(term)) return 1;
  // A plural query finds the singular title ("swords" → "sword").
  if (term.length > 3 && term.endsWith("s") && hay.words.includes(term.slice(0, -1))) return 4;
  return 0;
}

/**
 * Ranks library entries against free text. Every word must match the title, a tag or the id; a whole
 * title word ranks above a tag, a tag above a prefix. An empty query lists the filtered entries in
 * index order.
 *
 * @capability library-search search thousands of licensed models, materials, HDRIs and icons by words and tags
 */
export function searchLibrary(entries: readonly LibraryEntry[], query: string, options: LibrarySearchOptions = {}): LibraryHit[] {
  const kinds = options.kind === undefined ? undefined : new Set<LibraryKind>(typeof options.kind === "string" ? [options.kind] : options.kind);
  const terms = words(query);
  const limit = options.limit ?? 60;
  const hits: LibraryHit[] = [];
  for (const entry of entries) {
    if (kinds !== undefined && !kinds.has(entry.kind)) continue;
    if (options.source !== undefined && entry.source !== options.source) continue;
    if (options.noCredit === true && licenseRequiresCredit(entry.license)) continue;
    if (options.tags !== undefined && !options.tags.every((tag) => entry.tags.includes(tag))) continue;
    let score = 0;
    let matched = true;
    for (const term of terms) {
      const termScore = scoreTerm(entry, term);
      if (termScore === 0) {
        matched = false;
        break;
      }
      score += termScore;
    }
    if (matched) hits.push({ entry, score });
  }
  if (terms.length > 0) hits.sort((a, b) => b.score - a.score || a.entry.title.length - b.entry.title.length || a.entry.title.localeCompare(b.entry.title));
  return limit === 0 ? hits : hits.slice(0, limit);
}

/** How many entries carry each tag, most common first: the browser's tag chips. */
export function libraryTagCounts(entries: readonly LibraryEntry[], limit = 40): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const entry of entries) for (const tag of entry.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, limit);
}

/**
 * The entry with this key (`polyhaven:ArmChair_01`), or undefined.
 *
 * @internal
 */
export function findLibraryEntry(entries: readonly LibraryEntry[], key: string): LibraryEntry | undefined {
  return entries.find((entry) => entry.key === key);
}

const LICENSE_LABEL: Record<LibraryLicense, string> = {
  "CC0-1.0": "CC0",
  "public-domain": "Public domain",
  MIT: "MIT",
  "CC-BY-3.0": "CC BY 3.0",
  "CC-BY-4.0": "CC BY 4.0",
};

/** A short human label for a licence (`CC BY 3.0`). */
export function libraryLicenseLabel(license: LibraryLicense): string {
  return LICENSE_LABEL[license];
}

/**
 * Credit sections for the library entries a game ships: one section per source, one line per
 * credited author (game-icons.net's "Icons made by …" rule) with the entries listed, and one line
 * per CC0 source. Fold it into the game's own credits with `mergeCredits`.
 *
 * @capability library-credits generate in-game credits from the library assets a game ships
 */
export function libraryCreditSections(used: readonly LibraryEntry[]): CreditsSection[] {
  const bySource = new Map<LibrarySourceId, LibraryEntry[]>();
  for (const entry of used) {
    const list = bySource.get(entry.source) ?? [];
    if (!list.some((other) => other.key === entry.key)) list.push(entry);
    bySource.set(entry.source, list);
  }
  const sections: CreditsSection[] = [];
  for (const [sourceId, list] of bySource) {
    const source = librarySource(sourceId);
    if (source === undefined) continue;
    const byAuthor = new Map<string, LibraryEntry[]>();
    for (const entry of list) {
      const key = `${entry.author}\u0000${entry.license}`;
      byAuthor.set(key, [...(byAuthor.get(key) ?? []), entry]);
    }
    const entries = [...byAuthor.values()].flatMap((group) => {
      const [first] = group;
      if (first === undefined) return [];
      const names = group.map((entry) => entry.title).sort();
      const shown = names.length > 6 ? `${names.slice(0, 6).join(", ")} and ${names.length - 6} more` : names.join(", ");
      const label = sourceId === "gameicons" ? `Icons made by ${first.author}` : first.author;
      return [{
        label,
        detail: `${shown} · ${libraryLicenseLabel(first.license)}`,
        href: group.length === 1 ? first.page : source.homepage,
      }];
    });
    sections.push({ heading: source.title, entries: entries.sort((a, b) => a.label.localeCompare(b.label)) });
  }
  return sections;
}

/**
 * {@link libraryCreditSections} as a ready {@link CreditsDocument}.
 *
 * @capability library-credits-document a ready credits document from the library assets a game ships
 */
export function libraryCredits(used: readonly LibraryEntry[], options: { title?: string; notice?: string } = {}): CreditsDocument {
  return { title: options.title, sections: libraryCreditSections(used), notice: options.notice };
}

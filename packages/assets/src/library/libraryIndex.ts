import { generatedBySource } from "../generated";
import { sourceById } from "../sources";
import { expandLibraryFiles, readLibraryRecordFile, type LibraryEntry, type LibraryRecord, type LibraryRecordFile } from "./assetLibrary";
import { libraryRecordFiles } from "./generated";
import { isLibraryLicense } from "./libraryLicense";
import type { LibrarySourceId } from "./librarySources";

function titleOf(stem: string): string {
  return stem
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Library records for the KayKit and Quaternius packs the pack index already measured (`assets
 * reindex`), so their sizes, triangle counts and rigs come from the real files.
 *
 * @internal
 */
export function packLibraryRecordFiles(): LibraryRecordFile[] {
  const bySource = new Map<LibrarySourceId, LibraryRecord[]>();
  for (const [packId, entries] of Object.entries(generatedBySource)) {
    const pack = sourceById.get(packId);
    if (pack === undefined || (pack.provider !== "kaykit" && pack.provider !== "quaternius") || !isLibraryLicense(pack.license)) continue;
    const records = bySource.get(pack.provider) ?? [];
    for (const entry of entries) {
      const stem = entry.id.slice(packId.length + 1);
      const rigged = (entry.clips?.length ?? 0) > 0;
      const record: LibraryRecord = {
        id: entry.id,
        title: titleOf(stem),
        kind: rigged && entry.categories.includes("character") ? "character" : "model",
        tags: [...new Set([...entry.categories, ...titleOf(stem).toLowerCase().split(" ")])].filter((tag) => tag.length > 1 && !/^\d+$/.test(tag)),
        pack: packId,
        file: entry.file,
        ...(pack.homepage === undefined ? {} : { page: pack.homepage }),
      };
      if (rigged) record.rigged = true;
      if (entry.metrics !== undefined) record.triangles = entry.metrics.triangles;
      if (entry.dims !== undefined) {
        const height = entry.dims.maxY === undefined ? undefined : entry.dims.maxY - entry.dims.minY;
        if (height !== undefined) record.size = [round(entry.dims.footprint.w), round(height), round(entry.dims.footprint.d)];
      }
      records.push(record);
    }
    bySource.set(pack.provider, records);
  }
  return [...bySource.entries()].map(([source, records]) => ({ source, ingested: "pack-index", records }));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

let cached: readonly LibraryEntry[] | undefined;

/**
 * Every entry in the shared asset library: the committed ingest files plus the measured packs. Built
 * once on first call. Import this module lazily from a browser (`await import(...)`): the index is a
 * few megabytes of metadata.
 *
 * @capability asset-library thousands of licensed models, characters, materials, HDRIs and icons with credit data
 */
export function assetLibrary(): readonly LibraryEntry[] {
  cached ??= expandLibraryFiles([...libraryRecordFiles.map(readLibraryRecordFile), ...packLibraryRecordFiles()]);
  return cached;
}

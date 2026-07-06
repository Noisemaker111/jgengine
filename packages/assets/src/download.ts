import { unzipSync } from "fflate";

import { isScrapeDownload, type AssetSource } from "./manifest";

export interface ExtractedGlb {
  file: string;
  bytes: Uint8Array;
}

function resolveRelative(path: string, pageUrl: string): string {
  try {
    return new URL(path, pageUrl).toString();
  } catch {
    return path;
  }
}

export function findArchiveUrl(html: string, pageUrl: string): string | null {
  const matches = html.match(/[^\s"'()<>]+\.zip/gi);
  if (matches === null) return null;
  const ranked = matches.sort((a, b) => score(b) - score(a));
  const best = ranked[0];
  return best === undefined ? null : resolveRelative(best, pageUrl);
}

function score(candidate: string): number {
  let value = 0;
  if (candidate.includes("/media/")) value += 2;
  if (candidate.includes("download")) value += 1;
  if (candidate.startsWith("http") || candidate.startsWith("/")) value += 1;
  return value;
}

export async function resolveArchiveUrl(source: AssetSource): Promise<string> {
  const download = source.download;
  if (!isScrapeDownload(download)) return download.url;
  const response = await fetch(download.scrape, { redirect: "follow" });
  if (!response.ok) throw new Error(`scrape ${download.scrape} -> HTTP ${response.status}`);
  const html = await response.text();
  const url = findArchiveUrl(html, download.scrape);
  if (url === null) {
    throw new Error(
      `no downloadable .zip found at ${download.scrape} (provider may require manual download)`,
    );
  }
  return url;
}

export async function downloadArchive(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`download ${url} -> HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

export function extractGlbs(archive: Uint8Array): ExtractedGlb[] {
  const entries = unzipSync(archive, {
    filter: (file) => /\.glb$/i.test(file.name),
  });
  const byName = new Map<string, Uint8Array>();
  for (const [path, bytes] of Object.entries(entries)) {
    const base = path.split("/").pop();
    if (base === undefined || base.length === 0) continue;
    if (!byName.has(base)) byName.set(base, bytes);
  }
  return Array.from(byName, ([file, bytes]) => ({ file, bytes })).sort((a, b) =>
    a.file.localeCompare(b.file),
  );
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

import { resolveArchiveUrl, downloadArchive } from "../packages/assets/src/download";
import { sources } from "../packages/assets/src/sources";
import type { AssetSource } from "../packages/assets/src/manifest";

const TAG = "packs";
const repo = process.env.GITHUB_REPOSITORY ?? "Noisemaker111/jgengine";
const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error("mirror-assets: GITHUB_TOKEN is required");
  process.exit(1);
}

const api = async (path: string, init: RequestInit = {}): Promise<Response> =>
  fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      ...init.headers,
    },
  });

async function ensureRelease(): Promise<{ id: number; assets: { name: string }[] }> {
  const existing = await api(`/repos/${repo}/releases/tags/${TAG}`);
  if (existing.ok) {
    const release = (await existing.json()) as { id: number };
    const assets: { name: string }[] = [];
    for (let page = 1; ; page += 1) {
      const response = await api(`/repos/${repo}/releases/${release.id}/assets?per_page=100&page=${page}`);
      const batch = (await response.json()) as { name: string }[];
      assets.push(...batch);
      if (batch.length < 100) break;
    }
    return { id: release.id, assets };
  }
  const created = await api(`/repos/${repo}/releases`, {
    method: "POST",
    body: JSON.stringify({
      tag_name: TAG,
      name: "Asset packs",
      body: "Mirror of the CC0/CC-BY asset packs in packages/assets/src/sources. Each zip keeps its original license files. Synced by .github/workflows/mirror-assets.yml.",
    }),
  });
  if (!created.ok) throw new Error(`create release failed: HTTP ${created.status} ${await created.text()}`);
  return { id: ((await created.json()) as { id: number }).id, assets: [] };
}

function isPriority(source: AssetSource): boolean {
  const kind = source.kind ?? "model";
  return kind === "model" || kind === "sprite";
}

const release = await ensureRelease();
const have = new Set(release.assets.map((asset) => asset.name));
let uploaded = 0;
const softFailures: string[] = [];
const hardFailures: string[] = [];

for (const source of sources) {
  const assetName = `${source.provider}-${source.id}.zip`;
  if (have.has(assetName)) continue;
  try {
    const url = await resolveArchiveUrl(source);
    const archive = await downloadArchive(url);
    const upload = await fetch(
      `https://uploads.github.com/repos/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(assetName)}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/zip",
        },
        body: archive,
      },
    );
    if (!upload.ok) throw new Error(`upload HTTP ${upload.status} ${await upload.text()}`);
    uploaded += 1;
    console.log(`mirrored ${assetName} (${(archive.byteLength / 1_048_576).toFixed(1)} MB) from ${url}`);
  } catch (error) {
    const line = `${assetName}: ${error instanceof Error ? error.message : String(error)}`;
    if (isPriority(source)) hardFailures.push(line);
    else softFailures.push(line);
  }
}

console.log(
  `mirror-assets: ${sources.length} catalog packs, ${have.size} already mirrored, ${uploaded} uploaded, ${hardFailures.length} hard fails, ${softFailures.length} soft fails (materials)`,
);
for (const failure of softFailures) console.warn(`  ~ ${failure}`);
for (const failure of hardFailures) console.error(`  - ${failure}`);
// Materials 404s (stale ambientCG ids) must not block model/sprite mirroring.
if (hardFailures.length > 0) process.exit(1);

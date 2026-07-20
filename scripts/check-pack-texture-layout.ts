import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

/**
 * Gate: a committed model pack's on-disk texture files must sit where its GLBs
 * point. GLTFLoader resolves each `images[].uri` as a URL relative to the `.glb`,
 * so a texture the GLB names `Bark_NormalTree.png` must exist *beside* the model;
 * if the PNG is stashed under a `Textures/` subfolder (or anywhere the URI does
 * not resolve to) every consuming game 404s that map and renders white/near-black
 * foliage. That exact layout mismatch (`quaternius-stylized-nature`) broke foliage
 * and decor across ~5 games (#1338). The flat "texture beside the model" layout is
 * the pack pipeline's contract — `extractGlbs` normalizes URIs to basenames and
 * writes each referenced map into the pack root — and every other committed pack
 * already follows it. This check parses each GLB's raw image URIs, resolves them
 * the way GLTFLoader would, and fails if any referenced texture is missing on disk,
 * so a nested layout can never silently recommit.
 *
 * Deliberately parses the GLB JSON chunk with the *raw* (unflattened) URI rather
 * than reusing `externalGlbImages` (which flattens to a basename) — the raw URI is
 * what the loader actually resolves, so this catches both a flat URI whose file was
 * nested and a nested URI whose file was flattened.
 */

const DEFAULT_MODELS_ROOT = join(process.cwd(), "apps", "dev", "public", "models");

const GLB_MAGIC = 0x46546c67; // "glTF"
const JSON_CHUNK_TYPE = 0x4e4f534a; // "JSON"

interface GltfImages {
  images?: { uri?: string }[];
}

/** Raw `images[].uri` values from a GLB's JSON chunk (data: URIs skipped, percent-decoding preserved by the caller). */
function rawGlbImageUris(bytes: Uint8Array): string[] {
  if (bytes.byteLength < 12) return [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) return [];
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const dataStart = offset + 8;
    if (dataStart + chunkLength > bytes.byteLength) break;
    if (chunkType === JSON_CHUNK_TYPE) {
      const text = new TextDecoder().decode(bytes.subarray(dataStart, dataStart + chunkLength));
      let json: GltfImages;
      try {
        json = JSON.parse(text) as GltfImages;
      } catch {
        return [];
      }
      return (json.images ?? [])
        .map((image) => image.uri)
        .filter((uri): uri is string => uri !== undefined && uri.length > 0 && !uri.startsWith("data:"));
    }
    offset = dataStart + chunkLength + (chunkLength % 4 === 0 ? 0 : 4 - (chunkLength % 4));
  }
  return [];
}

/** Resolve a glTF relative image URI against its GLB, the way GLTFLoader does. */
function resolveTexturePath(glbPath: string, uri: string): string {
  const decoded = decodeURIComponent(uri.replace(/\\/g, "/"));
  return resolve(dirname(glbPath), decoded);
}

interface PackReport {
  pack: string;
  referenced: number;
  resolved: number;
  missing: string[];
}

function auditPack(packDir: string, packName: string): PackReport {
  const missing: string[] = [];
  let referenced = 0;
  let resolved = 0;
  for (const file of readdirSync(packDir)) {
    if (!file.toLowerCase().endsWith(".glb")) continue;
    const glbPath = join(packDir, file);
    for (const uri of rawGlbImageUris(readFileSync(glbPath))) {
      referenced += 1;
      if (existsSync(resolveTexturePath(glbPath, uri))) {
        resolved += 1;
      } else {
        missing.push(`${packName}/${file} -> "${uri}" (expected at ${relative(process.cwd(), resolveTexturePath(glbPath, uri))})`);
      }
    }
  }
  return { pack: packName, referenced, resolved, missing };
}

function main(argv: string[]): number {
  // Optional models-root override so the gate can be exercised against a temp copy in tests.
  const modelsRoot = argv[0] !== undefined ? resolve(argv[0]) : DEFAULT_MODELS_ROOT;
  if (!existsSync(modelsRoot)) {
    console.error(`check-pack-texture-layout: models root not found at ${modelsRoot}`);
    return 1;
  }
  const packs = readdirSync(modelsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const reports = packs
    .map((pack) => ({ pack, dir: join(modelsRoot, pack) }))
    .filter(({ dir }) => statSync(dir).isDirectory())
    .map(({ pack, dir }) => auditPack(dir, pack));

  const totalReferenced = reports.reduce((sum, r) => sum + r.referenced, 0);
  const totalResolved = reports.reduce((sum, r) => sum + r.resolved, 0);
  const allMissing = reports.flatMap((r) => r.missing);

  if (allMissing.length > 0) {
    console.error(
      `\ncheck-pack-texture-layout: ${allMissing.length} GLB texture reference(s) do not resolve on disk:\n` +
        allMissing.map((m) => `  - ${m}`).join("\n") +
        `\n\nRule: GLTFLoader resolves each GLB's images[].uri relative to the .glb file, so every referenced\n` +
        `texture must sit beside its model (the flat layout extractGlbs / 'assets pull' produce — never a\n` +
        `nested Textures/ subfolder). A mismatch 404s the map and renders white/near-black foliage in every\n` +
        `consuming game (#1338). Flatten the pack so each PNG is a sibling of the GLBs that name it.\n`,
    );
    return 1;
  }

  console.log(
    `check-pack-texture-layout: clean — ${reports.length} pack(s), ${totalResolved}/${totalReferenced} GLB texture reference(s) resolve beside their models`,
  );
  return 0;
}

process.exit(main(process.argv.slice(2)));

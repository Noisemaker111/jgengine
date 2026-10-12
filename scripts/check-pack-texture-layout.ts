import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

/**
 * Audit raw GLB image URIs against each committed pack's files, including authored
 * subdirectories. A mismatched layout broke foliage across games (#1338).
 * `externalGlbImages` flattens URIs, so it cannot validate the loader's actual path.
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
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const glbPath = join(dir, entry.name);
      if (entry.isDirectory()) { walk(glbPath); continue; }
      if (!entry.name.toLowerCase().endsWith(".glb")) continue;
      const model = `${packName}/${relative(packDir, glbPath).replaceAll("\\", "/")}`;
      for (const uri of rawGlbImageUris(readFileSync(glbPath))) {
        referenced += 1;
        if (decodeURIComponent(uri.replace(/\\/g, "/")).startsWith("/")) {
          missing.push(`${model} -> "${uri}" (root-relative image URI; use a path relative to the GLB)`);
          continue;
        }
        const texturePath = resolveTexturePath(glbPath, uri);
        if (existsSync(texturePath)) {
          resolved += 1;
        } else {
          missing.push(`${model} -> "${uri}" (expected at ${relative(process.cwd(), texturePath)})`);
        }
      }
    }
  };
  walk(packDir);
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
        `\n\nRule: GLTFLoader resolves each GLB's images[].uri relative to the .glb file. Keep generated\n` +
        `packs flat; authored subdirectories must carry matching relative image URIs. Root-relative\n` +
        `image paths are not portable between games. A mismatch 404s the map (#1338).\n`,
    );
    return 1;
  }

  console.log(
    `check-pack-texture-layout: clean — ${reports.length} pack(s), ${totalResolved}/${totalReferenced} GLB texture reference(s) resolve relative to their models`,
  );
  return 0;
}

process.exit(main(process.argv.slice(2)));

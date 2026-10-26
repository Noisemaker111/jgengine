import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";

/**
 * GPU-compressed (KTX2 / Basis UASTC) twins of a game's textures, kept in the shared asset store's
 * `.ktx2/` folder and named by the source file's content hash, so every checkout, worktree and game
 * holding the same bytes shares one encode. `compressTextures.ts` writes them where the store is
 * provisioned; a server answers a request with a twin when one exists and with the original file
 * otherwise, so a checkout without the cache (CI, a fresh clone) serves exactly what it always did.
 *
 *   `name.glb` / `name.gltf`   the model with its textures as `KHR_texture_basisu` (originals kept as fallback)
 *   `name.png?ktx2=<role>,<orient>`   that image as KTX2; `role` is `color`, `data`, `normal` or `auto`
 *                                     (read from the file name), `orient` is `top` (glTF rows) or `flip`
 */

/** Bumped whenever the encoder's settings change, so stale twins are never served. */
export const TEXTURE_VARIANT_VERSION = 1;
/** The query parameter a client adds to ask for an image's KTX2 twin. */
export const KTX2_PARAM = "ktx2";

export type TextureRole = "color" | "data" | "normal";
export type TextureOrient = "top" | "flip";

export interface ImageVariantRequest {
  role: TextureRole;
  orient: TextureOrient;
}

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"]);
const MODEL_EXTENSIONS = new Set([".gltf", ".glb"]);

/** The folder holding every twin for one asset store. */
export function textureVariantDir(storeRoot: string): string {
  return join(storeRoot, ".ktx2");
}

/** A map's role read from its file name: normal maps, colour maps, and everything else linear. */
export function roleFromName(file: string): TextureRole {
  const name = basename(file).toLowerCase();
  if (/normal|(^|[^a-z])nrm([^a-z]|$)|_n\.(png|jpe?g)$/.test(name)) return "normal";
  if (/color|colour|albedo|diffuse|basecolor|base_color|emissive|emission|(^|[^a-z])col([^a-z]|$)/.test(name)) return "color";
  if (/rough|metal|occlusion|height|displace|opacity|specular|gloss|(^|[^a-z])(ao|orm|arm|mask|disp|spec)([^a-z]|$)/.test(name)) return "data";
  return "color";
}

/** The twin a `?ktx2=` value asks for, or null when it names none. */
export function parseImageVariant(value: string | null, file: string): ImageVariantRequest | null {
  if (value === null) return null;
  const [role, orient] = value.split(",");
  if (orient !== "top" && orient !== "flip") return null;
  if (role === "auto") return { role: roleFromName(file), orient };
  if (role === "color" || role === "data" || role === "normal") return { role, orient };
  return null;
}

/** The `?ktx2=` value for a twin; `auto` leaves the role to the file name. */
export function imageVariantQuery(role: TextureRole | "auto", orient: TextureOrient): string {
  return `${KTX2_PARAM}=${role},${orient}`;
}

/** Content hash naming every twin of a file's bytes. */
export function contentKey(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 24);
}

export function imageVariantName(key: string, request: ImageVariantRequest): string {
  return `${key}.${request.role}.${request.orient}.v${TEXTURE_VARIANT_VERSION}.ktx2`;
}

export function modelVariantName(key: string, extension: ".gltf" | ".glb"): string {
  return `${key}.v${TEXTURE_VARIANT_VERSION}${extension}`;
}

const keys = new Map<string, { size: number; mtimeMs: number; key: string }>();

/** {@link contentKey} of a file on disk, remembered until its size or mtime changes. */
export function fileContentKey(file: string): string {
  const stat = statSync(file);
  const known = keys.get(file);
  if (known !== undefined && known.size === stat.size && known.mtimeMs === stat.mtimeMs) return known.key;
  const key = contentKey(new Uint8Array(readFileSync(file)));
  keys.set(file, { size: stat.size, mtimeMs: stat.mtimeMs, key });
  return key;
}

/**
 * The compressed twin to serve for `file` requested with `search` (the URL's query), or null when
 * the original should be served: no twin was encoded yet, or the request did not ask for one.
 */
export function compressedVariant(file: string, search: string, variantDir: string): string | null {
  const extension = extname(file).toLowerCase();
  const params = new URLSearchParams(search);
  let name: string | null = null;
  if (IMAGE_EXTENSIONS.has(extension)) {
    const request = parseImageVariant(params.get(KTX2_PARAM), file);
    if (request === null) return null;
    name = imageVariantName(fileContentKey(file), request);
  } else if (MODEL_EXTENSIONS.has(extension)) {
    if (params.has(KTX2_PARAM)) return null;
    name = modelVariantName(fileContentKey(file), extension as ".gltf" | ".glb");
  }
  if (name === null) return null;
  const path = join(variantDir, name);
  return existsSync(path) ? path : null;
}

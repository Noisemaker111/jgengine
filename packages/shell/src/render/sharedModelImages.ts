import type * as THREE from "three";
import { LoaderUtils } from "three";
import type { GLTFLoaderPlugin, GLTFParser } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * Every model file gets its own GLTF parser, and a parser only shares images inside its own file.
 * A kit whose models all point at the same external texture (one trim sheet for forty wall pieces)
 * decoded and uploaded that sheet once per model: scrap-signal sent 165 copies of 23 images to the
 * GPU. Images loaded by URL are shared across parsers here; each user gets a clone, and clones share
 * the image's `Source`, so the GPU receives one upload per image and sampler.
 */
const shared = new Map<string, Promise<THREE.Texture>>();

interface ImageSourceParser {
  json: { images?: { uri?: string; bufferView?: number }[] };
  options: { path?: string };
  loadImageSource(sourceIndex: number, loader: THREE.Loader): Promise<THREE.Texture>;
}

function loaderKind(loader: THREE.Loader): string {
  return (loader as { isKTX2Loader?: boolean }).isKTX2Loader === true ? "ktx2" : loader.constructor.name;
}

/** Images embedded in the file (buffer views, data URIs) belong to that file alone and stay per parser. */
function sharedImageKey(parser: ImageSourceParser, sourceIndex: number, loader: THREE.Loader): string | null {
  const uri = parser.json.images?.[sourceIndex]?.uri;
  if (uri === undefined || uri.startsWith("data:") || uri.startsWith("blob:")) return null;
  return `${loaderKind(loader)}|${LoaderUtils.resolveURL(uri, parser.options.path ?? "")}`;
}

/**
 * A clone that shares the image without asking for it again: `clone()` marks the shared source as
 * changed, which would send the image to the GPU once more for every model that loads after it.
 */
function shareTexture(texture: THREE.Texture): THREE.Texture {
  const version = texture.source.version;
  const copy = texture.clone();
  copy.source.version = version;
  return copy;
}

/** Shares images loaded by URL across every model the loader parses. @internal */
export function sharedModelImages(parser: GLTFParser): GLTFLoaderPlugin {
  const target = parser as unknown as ImageSourceParser;
  const own = target.loadImageSource.bind(target);
  target.loadImageSource = (sourceIndex, loader) => {
    const key = sharedImageKey(target, sourceIndex, loader);
    if (key === null) return own(sourceIndex, loader);
    let first = shared.get(key);
    if (first === undefined) {
      first = own(sourceIndex, loader);
      shared.set(key, first);
      first.catch(() => shared.delete(key));
    }
    return first.then(shareTexture);
  };
  return { name: "jg_shared_model_images" };
}

/** Drops the shared images, for tests. @internal */
export function clearSharedModelImages(): void {
  shared.clear();
}

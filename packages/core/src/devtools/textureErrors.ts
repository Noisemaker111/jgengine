import { devtools } from "./devtools";

/**
 * One texture (or other GLB sub-resource) that failed to load, plus how many times
 * a load for that URL errored. Serializable so it flows through the `debug_snapshot`
 * RPC exactly like {@link import("./fallbackSeams").FallbackSeamsReport}.
 */
export interface TextureLoadError {
  /** The URL the loader tried and failed to fetch (e.g. a `THREE.GLTFLoader` texture image). */
  url: string;
  /** How many load attempts for this URL have errored since the probe was armed. */
  count: number;
}

// Module-private state. `enabled` gates every mutation so production (devtools off) is a pure no-op;
// `counts` is the authoritative per-URL error tally. A Map keeps report O(1) and allocation-free on
// repeat errors (only a first-seen URL allocates a key), matching the allocation-aware fallback probe.
let enabled = false;
const counts = new Map<string, number>();
let lastSignature = "";

/**
 * Arm or disarm the texture-load-error diagnostic. Off by default; the shell arms it only when devtools
 * is enabled (dev builds), so production is a pure no-op. Toggling clears the tally so a fresh observation
 * starts empty and the opt-out path reports nothing.
 * @capability render-fallback-diagnostics Enable/disable the dev-only texture-load-error probe.
 */
export function armTextureErrors(on: boolean): void {
  enabled = on;
  counts.clear();
  lastSignature = "";
}

/**
 * Clear the texture-error tally without changing the armed state. Used to bracket a fresh observation
 * (e.g. between scenes or in tests). No-op when disarmed.
 * @capability render-fallback-diagnostics Reset the texture-load-error tally.
 */
export function resetTextureErrors(): void {
  if (!enabled) return;
  counts.clear();
  lastSignature = "";
}

/**
 * Record that a sub-resource load ERRORED for `url` (called from the shared GLB loading manager's
 * `onError`, which fires for GLTF textures/images whose fetch 404s or otherwise fails — the failure the
 * whole-model fallback probe never sees because the model itself still resolves). A pure, allocation-free
 * no-op when disarmed. On the armed path it also emits ONE deduped devtools warn line per newly-seen
 * failure set so a texture-404'd scene is loud, not silent.
 * @capability render-fallback-diagnostics Report a texture/sub-resource load failure.
 */
export function reportTextureLoadError(url: string): void {
  if (!enabled) return;
  counts.set(url, (counts.get(url) ?? 0) + 1);
  const sig = signature();
  if (sig === lastSignature) return;
  lastSignature = sig;
  devtools.logs.push(
    "warn",
    `[jgengine] texture/sub-resource loads failed — ${sig.replaceAll("|", ", ")}. ` +
      `The model resolved but its textures 404'd; fix the asset path/pack or the scene renders untextured.`,
  );
}

// Keys on the SET of failed URLs, not their counts, so re-erroring the same texture (counts keep
// growing as the loader retries) does not re-warn — only a newly-seen failing URL widens the line.
function signature(): string {
  let sig = "";
  for (const url of counts.keys()) sig += `${url}|`;
  return sig.replace(/\|$/, "");
}

/**
 * Snapshot the current texture-load-error tally as a compact, serializable list (empty when nothing
 * failed). Flows into the devtools `textureErrors` probe and the `debug_snapshot` RPC so `jgengine-verify`
 * can treat a non-empty set exactly like a model fallback: content that resolved but is visibly broken.
 * @capability render-fallback-diagnostics Read per-URL texture/sub-resource load-failure counts.
 */
export function textureErrorsSnapshot(): TextureLoadError[] {
  const out: TextureLoadError[] = [];
  for (const [url, count] of counts) out.push({ url, count });
  return out;
}

/**
 * Pure, zero-dependency classification of a model-asset fetch before it reaches
 * a GLTF parser. Runtime loaders hand the raw response (status, content type,
 * and the first bytes) to {@link classifyAssetResponse} so a missing or
 * mis-served file surfaces as an actionable diagnostic naming the broken asset
 * contract, instead of the opaque "Unexpected token < in JSON" parse error a
 * dev-server HTML fallback otherwise produces. No `fetch`, DOM, or three.js
 * dependency lives here — callers supply the already-read bytes.
 */

/**
 * How a model-asset fetch resolved. `ok` means the bytes are a parseable GLB or
 * glTF-JSON; every other kind is a distinct failure a loader should report
 * rather than parse: `missing` (HTTP error / no bytes), `html` (a dev-server
 * fallback page served in place of the file), `corrupt` (bytes present but not a
 * recognizable model), `unsupported` (a recognizable but non-model format).
 */
export type AssetLoadKind = "ok" | "missing" | "html" | "corrupt" | "unsupported";

/** The signature read from a response's leading bytes, independent of HTTP metadata. @internal */
export type AssetByteSignature = "glb" | "gltf-json" | "html" | "png" | "jpeg" | "zip" | "unknown" | "empty";

/**
 * A probe of a model-asset fetch: the URL, an optional logical asset id for the
 * diagnostic, and whatever the caller managed to read. Any field may be absent
 * (e.g. a network error yields no `status` or `bytes`); the classifier degrades
 * gracefully.
 */
export interface AssetResponseProbe {
  url: string;
  /** Logical catalog id / alias behind the URL, surfaced in the diagnostic message when known. */
  logicalId?: string;
  /** HTTP status code; `0` or `>= 400` is treated as missing. Omit when the fetch never completed. */
  status?: number;
  statusText?: string;
  /** `Content-Type` response header, lower-cased or not — matched case-insensitively. */
  contentType?: string;
  /** The leading bytes of the body (a few hundred is plenty); their signature decides GLB vs HTML vs corrupt. */
  bytes?: Uint8Array;
}

/** The verdict for one model-asset fetch: its {@link AssetLoadKind} plus a ready-to-log message. */
export interface AssetLoadDiagnosis {
  kind: AssetLoadKind;
  /** True only for `kind: "ok"` — safe to hand the bytes to a GLTF parser. */
  ok: boolean;
  url: string;
  logicalId?: string;
  byteSignature: AssetByteSignature;
  /** Human-readable, actionable one-liner naming the asset, the URL, and the likely fix. */
  message: string;
}

/** GLB little-endian magic — the ASCII "glTF" at byte 0 of a binary glTF container. @internal */
export const GLB_MAGIC_ASCII = "glTF";

function startsWithAscii(bytes: Uint8Array, ascii: string): boolean {
  if (bytes.length < ascii.length) return false;
  for (let i = 0; i < ascii.length; i += 1) {
    if (bytes[i] !== ascii.charCodeAt(i)) return false;
  }
  return true;
}

/** Skip a UTF-8 BOM and leading ASCII whitespace, returning the index of the first meaningful byte. */
function firstNonBlank(bytes: Uint8Array): number {
  let i = 0;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3;
  while (i < bytes.length) {
    const b = bytes[i]!;
    // space, tab, CR, LF
    if (b === 0x20 || b === 0x09 || b === 0x0d || b === 0x0a) i += 1;
    else break;
  }
  return i;
}

/**
 * Classify the leading bytes of a response body by their format signature, with
 * no HTTP context. Recognizes GLB (`glTF` magic), glTF-JSON (a leading `{`), an
 * HTML fallback page (`<!doctype`, `<html`, or a bare `<`), and a few common
 * non-model binaries (PNG, JPEG, ZIP) so they can be reported as unsupported
 * rather than corrupt.
 */
export function readByteSignature(bytes: Uint8Array): AssetByteSignature {
  if (bytes.length === 0) return "empty";
  if (startsWithAscii(bytes, GLB_MAGIC_ASCII)) return "glb";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return "zip";
  }
  const start = firstNonBlank(bytes);
  const head = bytes[start];
  if (head === undefined) return "empty";
  // '<' — an HTML document served where a model was expected.
  if (head === 0x3c) return "html";
  // '{' — glTF-JSON (the non-binary .gltf form) is a parseable model.
  if (head === 0x7b) return "gltf-json";
  return "unknown";
}

function describe(logicalId: string | undefined, url: string): string {
  return logicalId === undefined ? `"${url}"` : `"${logicalId}" (${url})`;
}

/**
 * Turn a {@link AssetResponseProbe} into an {@link AssetLoadDiagnosis}. HTTP
 * status is checked first (a `>= 400` or `0` status is `missing`), then the
 * `Content-Type` and byte signature decide between an HTML fallback, a
 * parseable model (`ok`), an unsupported-but-recognizable format, and otherwise
 * corrupt bytes. The returned `message` always names the asset and URL and, for
 * failures, points at the likely fix (provision the pack, check the serving path).
 *
 * @capability asset-load-diagnostics classify a model fetch (missing / HTML fallback / corrupt / unsupported) before parsing
 */
export function classifyAssetResponse(probe: AssetResponseProbe): AssetLoadDiagnosis {
  const { url, logicalId, status, statusText, contentType, bytes } = probe;
  const signature = bytes === undefined ? "empty" : readByteSignature(bytes);
  const who = describe(logicalId, url);
  const finish = (kind: AssetLoadKind, message: string): AssetLoadDiagnosis => ({
    kind,
    ok: kind === "ok",
    url,
    ...(logicalId === undefined ? {} : { logicalId }),
    byteSignature: signature,
    message,
  });

  if (status !== undefined && (status === 0 || status >= 400)) {
    const suffix = statusText === undefined || statusText.length === 0 ? "" : ` ${statusText}`;
    return finish(
      "missing",
      `Asset ${who} did not load: HTTP ${status}${suffix}. The bytes are not being served at that path — run \`assets pull <source>\`, which provisions the pack into the dev server's served models dir (\`apps/dev/public/models\` in the jgengine monorepo) so no manual copy is needed; or check the model path.`,
    );
  }

  const htmlContentType = contentType !== undefined && contentType.toLowerCase().includes("text/html");
  if (signature === "html" || (htmlContentType && signature !== "glb" && signature !== "gltf-json")) {
    return finish(
      "html",
      `Asset ${who} resolved to an HTML page, not a model — the dev server returned its fallback document because the file is missing. Run \`assets pull <source>\` to provision the pack into the served models dir (\`apps/dev/public/models\` in the jgengine monorepo); the bytes must exist there, no manual copy needed.`,
    );
  }

  if (signature === "glb" || signature === "gltf-json") return finish("ok", `Asset ${who} loaded (${signature}).`);

  if (signature === "png" || signature === "jpeg" || signature === "zip") {
    return finish(
      "unsupported",
      `Asset ${who} is a ${signature} file, not a GLB/glTF model — the reference points at the wrong file or the wrong loader is being used.`,
    );
  }

  if (signature === "empty") {
    return finish(
      "corrupt",
      `Asset ${who} returned an empty body — the file exists but has no bytes. Re-provision the pack or remove the reference.`,
    );
  }

  return finish(
    "corrupt",
    `Asset ${who} is not a recognizable GLB/glTF model (leading bytes do not match any known signature). The file is likely truncated or corrupt — re-provision the pack.`,
  );
}

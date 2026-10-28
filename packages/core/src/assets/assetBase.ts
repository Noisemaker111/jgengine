/**
 * The app base URL every root-absolute asset path resolves under. `/` (the default) leaves URLs
 * untouched: a standalone game serves its assets from the site root. The website serves the runner
 * under `/play/`, where a game's `/models/…` must load from `/play/models/…`.
 */
let assetBase = "/";

/** The running game's own files (`/models/a.glb`) and the folder they are served from (`games/<id>`). */
let gameFiles: { folder: string; files: ReadonlySet<string> } | null = null;

/**
 * Resolves a root-absolute asset URL (`/models/…`, `/audio/…`) against the installed app base, and
 * into the running game's own folder when that game ships the file. An already-based URL still moves
 * into the game's folder: a loader resolves a model's own files (a `.gltf`'s textures) against the
 * based URL it was handed. Relative, protocol-relative and absolute-scheme (`https:`, `blob:`,
 * `data:`) URLs pass through unchanged.
 */
export function resolveAssetBaseUrl(url: string): string {
  if (!url.startsWith("/") || url.startsWith("//")) return url;
  const base = assetBase.replace(/\/+$/, "");
  const based = assetBase !== "/" && url.startsWith(assetBase);
  const path = based ? url.slice(base.length) : url;
  if (gameFiles !== null && !path.startsWith(`/${gameFiles.folder}/`)) {
    const cut = path.search(/[?#]/);
    // A model's own files arrive as `<model dir>/../textures/a.png`; the browser would fold the dots, so the lookup does too.
    const file = withoutDotSegments(cut < 0 ? path : path.slice(0, cut));
    if (gameFiles.files.has(file)) return `${base}/${gameFiles.folder}${file}${cut < 0 ? "" : path.slice(cut)}`;
  }
  return based || assetBase === "/" ? url : `${base}${url}`;
}

function withoutDotSegments(path: string): string {
  if (!path.includes("/.")) return path;
  const out: string[] = [];
  for (const part of path.split("/")) {
    if (part === "..") out.pop();
    else if (part !== ".") out.push(part);
  }
  return out[0] === "" ? out.join("/") : `/${out.join("/")}`;
}

/**
 * Sets the app base URL (pass `import.meta.env.BASE_URL`). Bases that are not root-absolute (`/`,
 * `./`) reset to the pass-through default.
 */
export function setAssetBase(base: string): void {
  const normalized = base.endsWith("/") ? base : `${base}/`;
  assetBase = normalized.startsWith("/") && !normalized.startsWith("//") ? normalized : "/";
}

/**
 * Names the running game's own public files and the folder under the app base that serves them, for
 * a host that serves many games from one origin (the website's `/play/` runner). A listed path loads
 * from `<base><folder><path>`; any other path loads from the shared base. `null` clears it.
 */
export function setGameAssetFiles(folder: string | null, files: Iterable<string> = []): void {
  gameFiles = folder === null ? null : { folder: folder.replace(/^\/+|\/+$/g, ""), files: new Set(files) };
}

/**
 * Adds files to the running game's own list after it was set, such as an asset the editor pulled
 * while the game runs. A no-op when no game folder is set (a standalone game serves from its root).
 */
export function addGameAssetFiles(files: Iterable<string>): void {
  if (gameFiles === null) return;
  gameFiles = { folder: gameFiles.folder, files: new Set([...gameFiles.files, ...files]) };
}

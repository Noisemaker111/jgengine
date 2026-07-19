/**
 * Runner environment: the URL params and Vite env this dev shell branches on,
 * resolved once at module load, plus the two boot-time installs the runner
 * needs before any app root mounts. Every app component reads these constants
 * rather than re-parsing `location.search`.
 */
import { installAssetBase } from "@jgengine/shell/render/assetBase";
import { installSaveEndpoint } from "@jgengine/core/devtools/saveEndpoint";
import { installSpawnOverride, parseSpawnOverride } from "@jgengine/core/world/spawnOverride";

// The site mounts this runner under /play/ — resolve games' root-absolute
// /models and /materials paths against wherever the app is actually served.
installAssetBase(import.meta.env.BASE_URL);

const urlParams = new URLSearchParams(window.location.search);

/** Explicit game only — bare `/` shows the picker so demo is never a silent surprise. */
export const GAME_ID = urlParams.get("game") ?? (import.meta.env.VITE_GAME_ID as string | undefined) ?? null;
/** Gameless scene editor — the site embeds this at /editor via /play/?editor=standalone. */
export const EDITOR_STANDALONE = urlParams.get("editor") === "standalone";
export const STATE_PARAM = urlParams.get("state");
export const MODE = STATE_PARAM !== null ? "play" : (urlParams.get("mode") ?? "play");
export const PREVIEW = urlParams.get("preview");
/** `?fixture=<name>` mounts an engine preview fixture (real exported @jgengine/react component). */
export const FIXTURE = urlParams.get("fixture");
export const STAGE = urlParams.get("stage") === "1";
export const RUN = (urlParams.get("run") ?? "")
  .split(",")
  .map((name) => name.trim())
  .filter((name) => name.length > 0);
export const CAM = urlParams.get("cam");
/**
 * `?spawn=x,y,z` (optionally `x,y,z,yaw`) overrides the authored player spawn for this capture only,
 * mirroring `?cam=`. Installed at boot so games reading the shared `authoredSpawnPosition` primitive
 * spawn at the override without any mutation to `editor.scene.json`; absent/malformed → no override.
 */
export const SPAWN = urlParams.get("spawn");
installSpawnOverride(parseSpawnOverride(SPAWN));
export const WS_URL = import.meta.env.VITE_JG_WS_URL as string | undefined;
export const CONVEX_URL = import.meta.env.VITE_CONVEX_URL as string | undefined;
export const P2P_ROLE = urlParams.get("p2p");

if (import.meta.env.DEV && GAME_ID !== null) installSaveEndpoint("/__jgengine/save", GAME_ID);

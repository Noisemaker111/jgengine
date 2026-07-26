/**
 * Runner environment: the URL params and Vite env this dev shell branches on,
 * resolved once at module load, plus the two boot-time installs the runner
 * needs before any app root mounts. Every app component reads these constants
 * rather than re-parsing `location.search`.
 */
import { installAssetBase } from "@jgengine/shell/render/assetBase";
import { installSaveEndpoint } from "@jgengine/core/devtools/saveEndpoint";
import { installSpawnOverride, parseSpawnOverride } from "@jgengine/core/world/spawnOverride";

import type { CaptureViewOverrides } from "./captureView";

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
 * `?look=x,z` (or `x,y,z`) pins a detached photo camera on a world point for this capture only — the
 * vantage a screenshot actually wants, independent of the authored player spawn, the run's look yaw,
 * and whatever the AI wandered off to do. `?lookFrom=dist,height,angle` sets the vantage. A malformed
 * value fails the capture handshake rather than quietly leaving the game's own camera in place.
 */
export const LOOK = urlParams.get("look");
export const LOOK_FROM = urlParams.get("lookFrom");
/**
 * `?spawn=x,y,z` (optionally `x,y,z,yaw`) overrides the authored player spawn for this capture only,
 * mirroring `?cam=`. Installed at boot so games reading the shared `authoredSpawnPosition` primitive
 * spawn at the override without any mutation to `editor.scene.json`; absent/malformed → no override.
 */
export const SPAWN = urlParams.get("spawn");
/** `?view=<name>` replays a framing the game declares in `capture.views`. */
export const VIEW = urlParams.get("view");
installSpawnOverride(parseSpawnOverride(SPAWN));

/**
 * A declared view's values, merged once the game module has loaded. Routing params (`mode`,
 * `device`) are settled before that point and so are never shot-owned; everything below is read
 * through these accessors instead of the raw URL constants so a `?view=` can supply them.
 */
let viewOverrides: CaptureViewOverrides = {};

export function applyCaptureView(overrides: CaptureViewOverrides): void {
  viewOverrides = overrides;
  // The spawn override is installed at boot from the URL; a view that carries one has to re-install
  // it before the world spawns the player.
  installSpawnOverride(parseSpawnOverride(resolvedSpawn()));
}

export const resolvedLook = (): string | null => viewOverrides.look ?? LOOK;
export const resolvedLookFrom = (): string | null => viewOverrides.lookFrom ?? LOOK_FROM;
export const resolvedSpawn = (): string | null => viewOverrides.spawn ?? SPAWN;
export const resolvedState = (): string | null => viewOverrides.state ?? STATE_PARAM;
export const resolvedRun = (): readonly string[] => viewOverrides.run ?? RUN;
export const resolvedSettleMs = (): number | undefined => viewOverrides.settleMs;
export const WS_URL = import.meta.env.VITE_JG_WS_URL as string | undefined;
export const CONVEX_URL = import.meta.env.VITE_CONVEX_URL as string | undefined;
export const P2P_ROLE = urlParams.get("p2p");

if (import.meta.env.DEV && GAME_ID !== null) installSaveEndpoint("/__jgengine/save", GAME_ID);

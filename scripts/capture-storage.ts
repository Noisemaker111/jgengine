import type { CdpSession } from "./browser-lib";

/**
 * Clear localStorage / IndexedDB / origin storage for the capture target BEFORE
 * navigating to it, so a game that auto-restores a save boots clean instead of
 * resuming a prior run's session off a warm/persistent Chrome profile (issue
 * #1505). A warm daemon keeps its profile across captures, so without this a
 * reused browser renders "continue your story" where a cold one renders "hit the
 * street" — the same command, two different pictures.
 *
 * `Storage.clearDataForOrigin` takes an explicit origin, so it works from the
 * initial `about:blank` page without a round-trip navigation. Best effort: a
 * Chrome build that lacks the verb must not abort the capture.
 */
export async function clearOriginStorage(session: CdpSession, origin: string): Promise<void> {
  try {
    await session.send("Storage.clearDataForOrigin", {
      origin,
      storageTypes: "local_storage,indexeddb,websql,cache_storage,service_workers",
    });
  } catch (error) {
    console.error(
      `capture: could not clear ${origin} storage before capture (${error instanceof Error ? error.message : error}) — a restored save may change the picture`,
    );
  }
}

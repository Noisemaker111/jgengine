export interface BrowserFixtureResources {
  releasePending?: () => void | Promise<void>;
  browserServer?: { kill: () => Promise<void> };
  server?: { stop: (closeActiveConnections: boolean) => unknown };
  removeScratch: () => Promise<void>;
}

/** Retire only this fixture's owned browser process, including partial startup. */
export async function cleanupBrowserFixture(resources: BrowserFixtureResources): Promise<void> {
  let failed = false;
  let firstError: unknown;
  const cleanups = [
    () => resources.releasePending?.(),
    // Graceful close can wait indefinitely for Chromium; the fixture owns this server.
    () => resources.browserServer?.kill(),
    () => resources.server?.stop(true),
    () => resources.removeScratch(),
  ];
  for (const cleanup of cleanups) {
    try {
      await cleanup();
    } catch (failure) {
      if (!failed) { failed = true; firstError = failure; }
    }
  }
  if (failed) throw firstError;
}

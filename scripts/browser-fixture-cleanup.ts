export interface OwnedBrowserProcess {
  kill: () => Promise<void>;
}

/** Bind only the unique browser PID returned by the newly launched browser's CDP session. */
export function ownBrowserProcess(
  processes: readonly { type: string; id: number }[],
  kill: (pid: number) => Promise<void>,
): OwnedBrowserProcess {
  const browsers = processes.filter(process => process.type === "browser");
  if (browsers.length !== 1) throw new Error("Expected one owned Chromium browser process");
  const pid = browsers[0]!.id;
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error("Invalid owned Chromium browser PID");
  return { kill: () => kill(pid) };
}

export interface BrowserFixtureResources {
  releasePending?: () => void | Promise<void>;
  ownedBrowserProcess?: OwnedBrowserProcess;
  browser?: { close: () => Promise<void> };
  server?: { stop: (closeActiveConnections: boolean) => unknown };
  removeScratch: () => Promise<void>;
}

/** Retire only this fixture's owned browser process, including partial startup. */
export async function cleanupBrowserFixture(resources: BrowserFixtureResources): Promise<void> {
  let failed = false;
  let firstError: unknown;
  const cleanups = [
    () => resources.releasePending?.(),
    // Only force a process identified by this fixture's own browser session.
    // If inspection failed, retain the public close fallback rather than invent ownership.
    () => resources.ownedBrowserProcess === undefined
      ? resources.browser?.close()
      : resources.ownedBrowserProcess.kill(),
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

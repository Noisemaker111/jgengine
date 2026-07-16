/** A live signal listener installed by {@link installShutdownHook}; call `remove()` to uninstall it (tests, embedders opting out). */
export interface ShutdownHook {
  remove(): void;
}

/** Config for {@link installShutdownHook}. */
export interface InstallShutdownHookOptions {
  /** Signals to listen for; default `["SIGINT", "SIGTERM"]`. */
  signals?: readonly NodeJS.Signals[];
  /** Bound on how long `shutdown()` may run before the hook gives up and exits anyway; default 5000ms. */
  timeoutMs?: number;
  /** Called with `0` on a clean shutdown, `1` on error or timeout; default `process.exit`. Override in tests to avoid killing the test process. */
  exit?: (code: number) => void;
  /** Called when `shutdown()` rejects or times out; default logs to `console.error`. */
  onError?: (error: unknown) => void;
}

const DEFAULT_SIGNALS: readonly NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * Wires `SIGINT`/`SIGTERM` (or a custom signal list) to a clean-shutdown callback — e.g.
 * `() => worldServer.close()` or `() => Promise.all([wsServer.close(), host.stop()])`. Bounded by
 * `timeoutMs` so a stuck flush can't hang the process forever; idempotent — a second signal delivered
 * mid-shutdown reuses the same in-flight run instead of flushing twice. Returns a {@link ShutdownHook}
 * whose `remove()` uninstalls the listeners, for tests and embedders that want their own handling.
 */
export function installShutdownHook(
  shutdown: () => Promise<void> | void,
  options: InstallShutdownHookOptions = {},
): ShutdownHook {
  const signals = options.signals ?? DEFAULT_SIGNALS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const onError = options.onError ?? ((error: unknown) => console.error("shutdown failed:", error));

  let inFlight: Promise<void> | null = null;

  function run(): Promise<void> {
    inFlight ??= (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          Promise.resolve(shutdown()),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error(`shutdown exceeded ${timeoutMs}ms`)), timeoutMs);
          }),
        ]);
        exit(0);
      } catch (error) {
        onError(error);
        exit(1);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    })();
    return inFlight;
  }

  function handler(): void {
    void run();
  }

  for (const signal of signals) process.on(signal, handler);

  return {
    remove() {
      for (const signal of signals) process.off(signal, handler);
    },
  };
}

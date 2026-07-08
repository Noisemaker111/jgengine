export type DataSourceStatus = "idle" | "loading" | "ready" | "error";

export interface DataSourceState<T> {
  readonly status: DataSourceStatus;
  readonly data: T | undefined;
  readonly error: Error | undefined;
}

export interface DataSourceClock {
  setInterval(handler: () => void, intervalMs: number): unknown;
  clearInterval(handle: unknown): void;
}

const defaultClock: DataSourceClock = {
  setInterval: (handler, intervalMs) => globalThis.setInterval(handler, intervalMs),
  clearInterval: (handle) => globalThis.clearInterval(handle as ReturnType<typeof globalThis.setInterval>),
};

export interface DataSourceOptions {
  intervalMs?: number;
  clock?: DataSourceClock;
}

export interface RefreshOptions {
  force?: boolean;
}

export interface DataSource<T> {
  getState(): DataSourceState<T>;
  subscribe(listener: (state: DataSourceState<T>) => void): () => void;
  refresh(options?: RefreshOptions): Promise<void>;
  startPolling(intervalMs?: number): void;
  stopPolling(): void;
  dispose(): void;
}

export function createDataSource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  options: DataSourceOptions = {},
): DataSource<T> {
  const clock = options.clock ?? defaultClock;
  const listeners = new Set<(state: DataSourceState<T>) => void>();
  let state: DataSourceState<T> = { status: "idle", data: undefined, error: undefined };
  let controller: AbortController | undefined;
  let inFlight: Promise<void> | undefined;
  let pollHandle: unknown;
  let disposed = false;

  function setState(next: DataSourceState<T>): void {
    state = next;
    for (const listener of listeners) listener(state);
  }

  async function run(): Promise<void> {
    const ownController = new AbortController();
    controller = ownController;
    setState({ status: "loading", data: state.data, error: undefined });
    try {
      const data = await load(ownController.signal);
      if (ownController.signal.aborted) return;
      setState({ status: "ready", data, error: undefined });
    } catch (error) {
      if (ownController.signal.aborted) return;
      setState({
        status: "error",
        data: state.data,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    } finally {
      if (controller === ownController) controller = undefined;
    }
  }

  function refresh(refreshOptions: RefreshOptions = {}): Promise<void> {
    if (disposed) return Promise.resolve();
    if (inFlight !== undefined) {
      if (!refreshOptions.force) return inFlight;
      controller?.abort();
    }
    const promise: Promise<void> = run().finally(() => {
      if (inFlight === promise) inFlight = undefined;
    });
    inFlight = promise;
    return promise;
  }

  function stopPolling(): void {
    if (pollHandle !== undefined) {
      clock.clearInterval(pollHandle);
      pollHandle = undefined;
    }
  }

  function startPolling(intervalMs?: number): void {
    stopPolling();
    const resolvedInterval = intervalMs ?? options.intervalMs;
    if (resolvedInterval === undefined) {
      throw new Error("startPolling requires an intervalMs (pass one, or set options.intervalMs at creation)");
    }
    void refresh();
    pollHandle = clock.setInterval(() => {
      void refresh();
    }, resolvedInterval);
  }

  function dispose(): void {
    disposed = true;
    stopPolling();
    controller?.abort();
    listeners.clear();
  }

  if (options.intervalMs !== undefined) startPolling(options.intervalMs);

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh,
    startPolling,
    stopPolling,
    dispose,
  };
}

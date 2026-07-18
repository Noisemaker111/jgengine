import { createChangeSignal } from "../store/changeSignal";
import type { TunableOptions } from "./tunableSchema";
import { createFrameModule, nowMs } from "./frame";
import { createLogsModule } from "./logs";
import { createControlsModule } from "./controls";
import { createDiscoverModule } from "./discover";
import { createOverridesModule } from "./overrides";
import type { Devtools, DevtoolsSnapshot, Tunable } from "./types";

export type {
  AngleUnit,
  DevtoolsControlKind,
  DevtoolsOverrides,
  DiscoverySkip,
  OverrideApplyDiagnostic,
  TunableChoice,
  TunableInterval,
  TunableOptions,
  TunableVec2,
  TunableVec3,
  TunableVec4,
  ScanMeta,
  ScanFieldMeta,
  NormalizedColor,
} from "./tunableSchema";

export {
  CONTROL_SCHEMA_VERSION,
  OVERRIDES_FORMAT_VERSION,
  convertAngle,
  escapePathSegment,
  formatColor,
  joinTunablePath,
  normalizeAngle,
  normalizeColorValue,
  parseColor,
  parseOverridesPayload,
  splitTunablePath,
  unescapePathSegment,
  validateControlValue,
} from "./tunableSchema";

export type {
  Devtools,
  DevtoolsControl,
  DevtoolsLogEntry,
  DevtoolsLogLevel,
  DevtoolsSnapshot,
  DiscoveredEntry,
  FrameRecordSample,
  FrameStats,
  LatencyStats,
  LongFrameEvent,
  OverrideApplyResult,
  PhaseStats,
  RenderSample,
  Tunable,
  TunableAccessor,
} from "./types";

export { LONG_FRAME_MS } from "./frame";
export { formatLogMessage } from "./logs";

export function createDevtools(): Devtools {
  const signal = createChangeSignal();

  const controls = createControlsModule({ signal });
  const discover = createDiscoverModule({
    signal,
    register: controls.register,
    controlRecords: controls.controlRecords,
  });
  const frame = createFrameModule({ readProbes: discover.readProbes });
  const logs = createLogsModule({ signal });
  const overrides = createOverridesModule({
    signal,
    controlRecords: controls.controlRecords,
    writeControl: controls.writeControl,
    discoveredRecords: discover.discoveredRecords,
    enableDiscovered: discover.enableDiscovered,
  });

  return {
    frame: frame.frame,
    profile: frame.profile,
    render: frame.render,
    logs: logs.logs,
    latency: logs.latency,
    controls: controls.controls,
    discover: discover.discover,
    overrides: overrides.overrides,
    probes: discover.probes,
    signal,
    snapshot(): DevtoolsSnapshot {
      return {
        at: Date.now(),
        frame: frame.frame.stats(),
        render: frame.render.latest(),
        latency: logs.latency.stats(),
        longFrames: [...frame.frame.longFrames()],
        logs: [...logs.logs.list()],
        probes: discover.readProbes(),
        controls: [...controls.controlRecords.values()].map((record) => ({
          name: record.name,
          kind: record.kind,
          value: record.value,
          initial: record.initial,
        })),
        discovered: [...discover.discoveredRecords.values()].map((record) => ({
          id: record.id,
          kind: record.kind,
          value: record.get(),
          enabled: record.enabled,
        })),
        skipped: [...discover.getDiscoverySkips()],
      };
    },
  };
}

export const devtools: Devtools = createDevtools();

export function tunable<T>(name: string, initial: T, options?: TunableOptions<T>): Tunable<T> {
  return devtools.controls.register(name, initial, options);
}

export function snapshotDevtools(): DevtoolsSnapshot {
  return devtools.snapshot();
}

export function measureProfile<T>(name: string, fn: () => T): T {
  return devtools.profile.measure(name, fn);
}

export function instrumentLatency<T extends object>(target: T, methods: readonly (keyof T)[], record: (ms: number) => void = devtools.latency.record): T {
  const wrapped: T = { ...target };
  for (const method of methods) {
    const fn = target[method] as unknown as ((...args: unknown[]) => unknown) | undefined;
    if (typeof fn !== "function") continue;
    wrapped[method] = ((...args: unknown[]) => {
      const start = nowMs();
      const result = fn.call(target, ...args);
      if (result instanceof Promise) {
        return result.then(
          (value) => {
            record(nowMs() - start);
            return value;
          },
          (error) => {
            record(nowMs() - start);
            throw error;
          },
        );
      }
      return result;
    }) as T[typeof method];
  }
  return wrapped;
}

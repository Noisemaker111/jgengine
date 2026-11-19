import type { ChangeSignal } from "../store/changeSignal";
import {
  OVERRIDES_FORMAT_VERSION,
  cloneValue,
  parseOverridesPayload,
  type DevtoolsOverrides,
  type OverrideApplyDiagnostic,
} from "./tunableSchema";
import { isStructuralKind, type ControlRecord } from "./controls";
import type { DiscoveredRecord } from "./discover";
import type { Devtools } from "./types";

export interface OverridesModule {
  overrides: Devtools["overrides"];
}

export const createOverridesModule = (deps: {
  signal: ChangeSignal;
  controlRecords: Map<string, ControlRecord>;
  writeControl: (record: ControlRecord, raw: unknown) => boolean;
  discoveredRecords: Map<string, DiscoveredRecord>;
  enableDiscovered: (id: string) => void;
}): OverridesModule => {
  const { signal, controlRecords, writeControl, discoveredRecords, enableDiscovered } = deps;

  return {
    overrides: {
      export() {
        const enabled = [...discoveredRecords.values()].filter((r) => r.enabled).map((r) => r.id);
        const values: Record<string, unknown> = {};
        const schemas: NonNullable<DevtoolsOverrides["schemas"]> = {};
        for (const record of controlRecords.values()) {
          schemas[record.name] = { kind: record.kind, schemaVersion: record.schemaVersion };
          const same = isStructuralKind(record.kind)
            ? JSON.stringify(record.value) === JSON.stringify(record.initial)
            : Object.is(record.value, record.initial);
          if (!same) values[record.name] = cloneValue(record.value);
        }
        return {
          version: OVERRIDES_FORMAT_VERSION,
          enabled,
          values,
          schemas,
        };
      },
      apply(raw) {
        const parsed = parseOverridesPayload(raw);
        const diagnostics = [...parsed.diagnostics];
        const skipped: OverrideApplyDiagnostic[] = [];
        if (parsed.overrides === null) {
          return { applied: 0, skipped, diagnostics };
        }
        const overrides = parsed.overrides;
        let applied = 0;
        for (const id of overrides.enabled) {
          if (!discoveredRecords.has(id) && !controlRecords.has(id)) {
            skipped.push({ id, reason: "unknown control id" });
            continue;
          }
          enableDiscovered(id);
          applied += 1;
        }
        for (const [name, value] of Object.entries(overrides.values)) {
          const record = controlRecords.get(name);
          if (record === undefined) {
            skipped.push({ id: name, reason: "control not registered" });
            continue;
          }
          const schema = overrides.schemas?.[name];
          if (schema !== undefined && schema.kind !== record.kind) {
            skipped.push({ id: name, reason: `kind mismatch stored=${schema.kind} current=${record.kind}` });
            continue;
          }
          if (!writeControl(record, value)) {
            skipped.push({ id: name, reason: "value failed validation" });
            continue;
          }
          applied += 1;
        }
        signal.notify();
        return { applied, skipped, diagnostics };
      },
    },
  };
};

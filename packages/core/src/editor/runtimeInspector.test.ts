import { describe, expect, test } from "bun:test";

import { normalizeEditorLayers } from "./document";
import {
  consumeRuntimePlayStep,
  createRuntimePlayControl,
  getRuntimeInspectorValue,
  planRuntimeInspectorSet,
  runtimeEntityMetaWriteBackCommand,
  summarizeRuntimeInspector,
} from "./runtimeInspector";
import type { RuntimeStateSnapshot } from "./liveSync";

const emptySnapshot = (): RuntimeStateSnapshot => ({ seq: 0, entities: {}, tunables: {} });

describe("summarizeRuntimeInspector", () => {
  test("lists entities, tunables, overrides, and play control", () => {
    const snapshot: RuntimeStateSnapshot = {
      seq: 4,
      entities: {
        boss: { id: "boss", position: { x: 1, y: 0, z: 2 }, values: { hp: 10 } },
        minion: { id: "minion", rotationY: 1.2 },
      },
      tunables: { gravity: 9.8, paused: false },
    };
    const summary = summarizeRuntimeInspector(
      snapshot,
      { boss: { id: "boss", position: { x: 9, y: 0, z: 9 } } },
      { paused: true, pendingSteps: 2 },
    );
    expect(summary.seq).toBe(4);
    expect(summary.entityCount).toBe(2);
    expect(summary.entities.map((e) => e.id)).toEqual(["boss", "minion"]);
    expect(summary.entities[0]?.valueKeys).toEqual(["hp"]);
    expect(summary.tunableKeys).toEqual(["gravity", "paused"]);
    expect(summary.overrideIds).toEqual(["boss"]);
    expect(summary.play).toEqual({ paused: true, pendingSteps: 2 });
  });
});

describe("getRuntimeInspectorValue", () => {
  test("merges override onto entity and resolves paths", () => {
    const snapshot: RuntimeStateSnapshot = {
      seq: 1,
      entities: {
        spawn: {
          id: "spawn",
          position: { x: 0, y: 0, z: 0 },
          values: { team: "a", hp: 5 },
        },
      },
      tunables: { wind: 3 },
    };
    const overrides = {
      spawn: { id: "spawn", position: { x: 4, y: 1, z: -2 }, values: { hp: 2 } },
    };
    const whole = getRuntimeInspectorValue(snapshot, overrides, "spawn");
    expect(whole.kind).toBe("entity");
    expect(whole.entity?.position).toEqual({ x: 4, y: 1, z: -2 });
    expect(whole.entity?.values).toEqual({ team: "a", hp: 2 });

    const hp = getRuntimeInspectorValue(snapshot, overrides, "spawn", "values.hp");
    expect(hp.value).toBe(2);

    const tunable = getRuntimeInspectorValue(snapshot, overrides, "tunable:wind");
    expect(tunable.kind).toBe("tunable");
    expect(tunable.value).toBe(3);

    const missing = getRuntimeInspectorValue(snapshot, overrides, "nope");
    expect(missing.kind).toBe("missing");
  });
});

describe("planRuntimeInspectorSet", () => {
  test("plans transform write-back for document markers by default", () => {
    const doc = normalizeEditorLayers({
      markers: [{ id: "boss", kind: "boss", position: { x: 0, y: 0, z: 0 } }],
    });
    const plan = planRuntimeInspectorSet(doc, {
      id: "boss",
      position: { x: 10, y: 0, z: -4 },
      rotationY: 1.5,
    });
    expect(plan.error).toBeUndefined();
    expect(plan.entity?.position).toEqual({ x: 10, y: 0, z: -4 });
    expect(plan.writeBackCommands).toEqual([
      {
        type: "setTransform",
        id: "boss",
        position: { x: 10, y: 0, z: -4 },
        rotationY: 1.5,
      },
    ]);
  });

  test("plans meta write-back for values and can skip write-back", () => {
    const doc = normalizeEditorLayers({
      markers: [{ id: "chest", kind: "loot", position: { x: 0, y: 0, z: 0 }, meta: { gold: 1 } }],
    });
    const plan = planRuntimeInspectorSet(doc, {
      id: "chest",
      path: "values.gold",
      value: 99,
    });
    expect(plan.entity?.values).toEqual({ gold: 99 });
    expect(plan.writeBackCommands).toEqual([
      { type: "setMarker", id: "chest", patch: { meta: { gold: 99 } } },
    ]);

    const ephemeral = planRuntimeInspectorSet(doc, {
      id: "chest",
      path: "values.gold",
      value: 3,
      writeBack: false,
    });
    expect(ephemeral.writeBackCommands).toEqual([]);
    expect(ephemeral.entity?.values).toEqual({ gold: 3 });
  });

  test("plans tunable sets without document commands", () => {
    const plan = planRuntimeInspectorSet(normalizeEditorLayers({}), {
      id: "tunable:gravity",
      value: 12,
    });
    expect(plan.tunable).toEqual({ key: "gravity", value: 12 });
    expect(plan.writeBackCommands).toEqual([]);
  });

  test("rejects empty mutations", () => {
    const plan = planRuntimeInspectorSet(normalizeEditorLayers({}), { id: "ghost" });
    expect(plan.error).toMatch(/no position/);
  });
});

describe("runtimeEntityMetaWriteBackCommand", () => {
  test("returns null for unknown ids and empty values", () => {
    const doc = normalizeEditorLayers({
      markers: [{ id: "a", kind: "poi", position: { x: 0, y: 0, z: 0 } }],
    });
    expect(runtimeEntityMetaWriteBackCommand(doc, { id: "a" })).toBeNull();
    expect(runtimeEntityMetaWriteBackCommand(doc, { id: "nope", values: { x: 1 } })).toBeNull();
  });
});

describe("consumeRuntimePlayStep", () => {
  test("running play always runs; paused holds until step", () => {
    expect(consumeRuntimePlayStep({ paused: false, pendingSteps: 0 })).toEqual({
      runFrame: true,
      next: { paused: false, pendingSteps: 0 },
    });
    expect(consumeRuntimePlayStep({ paused: true, pendingSteps: 0 }).runFrame).toBe(false);
    const stepped = consumeRuntimePlayStep({ paused: true, pendingSteps: 2 });
    expect(stepped.runFrame).toBe(true);
    expect(stepped.next).toEqual({ paused: true, pendingSteps: 1 });
  });

  test("createRuntimePlayControl defaults", () => {
    expect(createRuntimePlayControl()).toEqual({ paused: false, pendingSteps: 0 });
    expect(createRuntimePlayControl(true).paused).toBe(true);
  });
});

describe("empty snapshot helpers", () => {
  test("summary on empty is empty", () => {
    const summary = summarizeRuntimeInspector(emptySnapshot(), {}, createRuntimePlayControl());
    expect(summary.entityCount).toBe(0);
    expect(summary.tunableKeys).toEqual([]);
  });
});

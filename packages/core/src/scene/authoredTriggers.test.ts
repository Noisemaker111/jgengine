import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import type { SceneDocumentLike } from "../world/sceneShapes";
import {
  clearTriggerActions,
  collectAuthoredTriggers,
  createAuthoredTriggerRuntime,
  DEFAULT_TRIGGER_RADIUS,
  getTriggerAction,
  listTriggerActions,
  pointInVolume,
  pointNearMarker,
  readFlatTrigger,
  readTriggerSpecs,
  registerTriggerAction,
  triggerMetaPatch,
  triggerRadiusOf,
  type TriggerDispatchEvent,
} from "./authoredTriggers";

beforeEach(() => {
  clearTriggerActions();
});

afterEach(() => {
  clearTriggerActions();
});

const SPAWN_WAVE_SCHEMA = {
  fields: [
    { type: "number" as const, key: "wave", label: "Wave", default: 1, min: 1, max: 99 },
    { type: "text" as const, key: "message", label: "Message", default: "" },
  ],
};

function registerSpawnWave(): void {
  registerTriggerAction({
    id: "spawn_wave",
    label: "Spawn wave",
    schema: SPAWN_WAVE_SCHEMA,
    targets: ["volume"],
    events: ["enter", "exit"],
  });
}

function doc(partial: Partial<SceneDocumentLike>): SceneDocumentLike {
  return {
    markers: partial.markers ?? [],
    volumes: partial.volumes ?? [],
    paths: partial.paths ?? [],
  };
}

describe("registerTriggerAction", () => {
  test("registers and lists by target", () => {
    registerSpawnWave();
    registerTriggerAction({
      id: "open_chest",
      label: "Open chest",
      schema: { fields: [] },
      targets: ["marker"],
      events: ["interact"],
    });
    expect(getTriggerAction("spawn_wave")?.label).toBe("Spawn wave");
    expect(listTriggerActions("volume").map((a) => a.id)).toEqual(["spawn_wave"]);
    expect(listTriggerActions("marker").map((a) => a.id)).toEqual(["open_chest"]);
    expect(listTriggerActions().map((a) => a.id).sort()).toEqual(["open_chest", "spawn_wave"]);
  });
});

describe("readTriggerSpecs / collectAuthoredTriggers", () => {
  test("parses flat on/action and schema params with defaults", () => {
    registerSpawnWave();
    const specs = readTriggerSpecs({ on: "enter", action: "spawn_wave", wave: 2 });
    expect(specs).toEqual([{ on: "enter", action: "spawn_wave", params: { wave: 2, message: "" } }]);
  });

  test("drops invalid events and empty actions", () => {
    expect(readTriggerSpecs({ on: "jump", action: "spawn_wave" })).toEqual([]);
    expect(readTriggerSpecs({ on: "enter", action: "" })).toEqual([]);
    expect(readTriggerSpecs(undefined)).toEqual([]);
  });

  test("parses multi-trigger lists", () => {
    registerSpawnWave();
    const specs = readTriggerSpecs({
      triggers: [
        { on: "enter", action: "spawn_wave", wave: 1 },
        { on: "exit", action: "spawn_wave", wave: 99 },
        { on: "nope", action: "spawn_wave" },
      ],
    });
    expect(specs).toHaveLength(2);
    expect(specs[0]?.params.wave).toBe(1);
    expect(specs[1]?.params.wave).toBe(99);
  });

  test("collects markers and volumes with radii", () => {
    registerSpawnWave();
    registerTriggerAction({
      id: "talk",
      label: "Talk",
      schema: { fields: [{ type: "text", key: "line", default: "hi" }] },
    });
    const triggers = collectAuthoredTriggers(
      doc({
        markers: [
          {
            id: "npc",
            kind: "npc",
            position: { x: 0, y: 0, z: 0 },
            meta: { on: "interact", action: "talk", line: "hello", triggerRadius: 3 },
          },
        ],
        volumes: [
          {
            id: "wave_zone",
            kind: "zone",
            shape: "cylinder",
            center: { x: 10, y: 0, z: 0 },
            radius: 5,
            meta: { on: "enter", action: "spawn_wave", wave: 2 },
          },
        ],
      }),
    );
    expect(triggers).toHaveLength(2);
    expect(triggers.find((t) => t.sourceId === "npc")?.radius).toBe(3);
    expect(triggers.find((t) => t.sourceId === "wave_zone")?.params.wave).toBe(2);
  });
});

describe("pointInVolume / pointNearMarker", () => {
  test("sphere / box / cylinder containment", () => {
    expect(
      pointInVolume(
        { id: "s", kind: "zone", shape: "sphere", center: { x: 0, y: 0, z: 0 }, radius: 2 },
        { x: 1, y: 0, z: 1 },
      ),
    ).toBe(true);
    expect(
      pointInVolume(
        { id: "s", kind: "zone", shape: "sphere", center: { x: 0, y: 0, z: 0 }, radius: 2 },
        { x: 3, y: 0, z: 0 },
      ),
    ).toBe(false);
    expect(
      pointInVolume(
        {
          id: "b",
          kind: "zone",
          shape: "box",
          center: { x: 0, y: 0, z: 0 },
          halfExtents: { x: 2, y: 1, z: 2 },
        },
        { x: 1.5, y: 0.5, z: 1.5 },
      ),
    ).toBe(true);
    expect(
      pointInVolume(
        {
          id: "c",
          kind: "zone",
          shape: "cylinder",
          center: { x: 0, y: 0, z: 0 },
          radius: 3,
          height: 2,
        },
        { x: 1, y: 0.9, z: 1 },
      ),
    ).toBe(true);
    expect(
      pointInVolume(
        {
          id: "c",
          kind: "zone",
          shape: "cylinder",
          center: { x: 0, y: 0, z: 0 },
          radius: 3,
          height: 2,
        },
        { x: 1, y: 2, z: 1 },
      ),
    ).toBe(false);
  });

  test("marker proximity and radius helpers", () => {
    const marker = { id: "m", kind: "poi", position: { x: 0, y: 0, z: 0 } };
    expect(pointNearMarker(marker, { x: 1, y: 0, z: 1 }, 2)).toBe(true);
    expect(pointNearMarker(marker, { x: 5, y: 0, z: 0 }, 2)).toBe(false);
    expect(triggerRadiusOf(undefined)).toBe(DEFAULT_TRIGGER_RADIUS);
    expect(triggerRadiusOf({ radius: 4 })).toBe(4);
    expect(triggerRadiusOf({ triggerRadius: 1.5, radius: 9 })).toBe(1.5);
  });
});

describe("createAuthoredTriggerRuntime", () => {
  test("enter once, stay silent, exit on leave", () => {
    registerSpawnWave();
    const document = doc({
      volumes: [
        {
          id: "wave_zone",
          kind: "zone",
          shape: "sphere",
          center: { x: 0, y: 0, z: 0 },
          radius: 5,
          meta: { on: "enter", action: "spawn_wave", wave: 2 },
        },
      ],
    });
    // also attach exit via multi list on a second volume
    const document2 = doc({
      volumes: [
        {
          id: "zone",
          kind: "zone",
          shape: "sphere",
          center: { x: 0, y: 0, z: 0 },
          radius: 5,
          meta: {
            triggers: [
              { on: "enter", action: "spawn_wave", wave: 2 },
              { on: "exit", action: "spawn_wave", wave: 3 },
            ],
          },
        },
      ],
    });
    const fired: TriggerDispatchEvent[] = [];
    const runtime = createAuthoredTriggerRuntime({
      document: document2,
      onDispatch: (event) => fired.push(event),
    });

    expect(
      runtime.step({ actors: [{ id: "p1", position: [0, 0, 0] }] }).map((e) => e.on),
    ).toEqual(["enter"]);
    expect(fired[0]?.params.wave).toBe(2);

    expect(runtime.step({ actors: [{ id: "p1", position: [1, 0, 0] }] })).toEqual([]);
    expect(runtime.step({ actors: [{ id: "p1", position: [20, 0, 0] }] }).map((e) => e.on)).toEqual(["exit"]);
    expect(fired[1]?.params.wave).toBe(3);

    void document;
  });

  test("interact fires only when pressed and in range", () => {
    registerTriggerAction({
      id: "open_chest",
      label: "Open",
      schema: { fields: [{ type: "text", key: "loot", default: "gold" }] },
    });
    const document = doc({
      markers: [
        {
          id: "chest",
          kind: "chest",
          position: { x: 0, y: 0, z: 0 },
          meta: { on: "interact", action: "open_chest", loot: "gems", triggerRadius: 2 },
        },
      ],
    });
    const runtime = createAuthoredTriggerRuntime({ document });
    expect(runtime.step({ actors: [{ id: "p1", position: [0, 0, 0] }] })).toEqual([]);
    const events = runtime.step({
      actors: [{ id: "p1", position: [0, 0, 0] }],
      interact: ["p1"],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ on: "interact", action: "open_chest", actorId: "p1" });
    expect(events[0]?.params.loot).toBe("gems");
    expect(
      runtime.step({
        actors: [{ id: "p1", position: [10, 0, 0] }],
        interact: ["p1"],
      }),
    ).toEqual([]);
  });

  test("handlers are invoked by action id", () => {
    registerSpawnWave();
    const document = doc({
      volumes: [
        {
          id: "z",
          kind: "zone",
          shape: "box",
          center: { x: 0, y: 0, z: 0 },
          halfExtents: { x: 2, y: 2, z: 2 },
          meta: { on: "enter", action: "spawn_wave", wave: 7 },
        },
      ],
    });
    let seen = 0;
    const runtime = createAuthoredTriggerRuntime({
      document,
      handlers: {
        spawn_wave: (event) => {
          seen = event.params.wave as number;
        },
      },
    });
    runtime.step({ actors: [{ id: "a", position: { x: 0, y: 0, z: 0 } }] });
    expect(seen).toBe(7);
  });

  test("reset re-arms enter", () => {
    registerSpawnWave();
    const document = doc({
      volumes: [
        {
          id: "z",
          kind: "zone",
          shape: "sphere",
          center: { x: 0, y: 0, z: 0 },
          radius: 3,
          meta: { on: "enter", action: "spawn_wave" },
        },
      ],
    });
    const runtime = createAuthoredTriggerRuntime({ document });
    expect(runtime.step({ actors: [{ id: "p", position: [0, 0, 0] }] })).toHaveLength(1);
    expect(runtime.step({ actors: [{ id: "p", position: [0, 0, 0] }] })).toHaveLength(0);
    runtime.reset();
    expect(runtime.step({ actors: [{ id: "p", position: [0, 0, 0] }] })).toHaveLength(1);
  });
});

describe("triggerMetaPatch / readFlatTrigger", () => {
  test("writes and clears flat trigger keys", () => {
    expect(triggerMetaPatch("enter", "spawn_wave", { wave: 2 })).toEqual({
      on: "enter",
      action: "spawn_wave",
      triggers: undefined,
      wave: 2,
    });
    expect(triggerMetaPatch("", "")).toEqual({
      on: undefined,
      action: undefined,
      triggers: undefined,
    });
    expect(readFlatTrigger({ on: "exit", action: "spawn_wave" })).toEqual({ on: "exit", action: "spawn_wave" });
    expect(readFlatTrigger({ triggers: [{ on: "enter", action: "x" }] })).toEqual({ on: "", action: "" });
    expect(readFlatTrigger({ on: "enter", action: "spawn_wave", triggers: [] })).toEqual({
      on: "enter",
      action: "spawn_wave",
    });
  });
});

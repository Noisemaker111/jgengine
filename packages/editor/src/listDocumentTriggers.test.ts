import { afterEach, describe, expect, test } from "bun:test";

import {
  clearTriggerActions,
  registerTriggerAction,
} from "@jgengine/core/scene/authoredTriggers";
import type { SceneDocumentLike } from "@jgengine/core/world/sceneShapes";

import { listDocumentTriggers } from "./listDocumentTriggers";

afterEach(() => {
  clearTriggerActions();
});

function doc(partial: Partial<SceneDocumentLike>): SceneDocumentLike {
  return {
    markers: partial.markers ?? [],
    volumes: partial.volumes ?? [],
    paths: partial.paths ?? [],
  };
}

function registerSpawn(): void {
  registerTriggerAction({
    id: "spawn_wave",
    label: "Spawn wave",
    schema: { fields: [{ type: "number", key: "wave", default: 1 }] },
  });
}

describe("listDocumentTriggers", () => {
  test("returns empty when document has no trigger meta", () => {
    expect(
      listDocumentTriggers(
        doc({
          markers: [{ id: "a", kind: "spawn", position: { x: 0, y: 0, z: 0 } }],
          volumes: [
            {
              id: "z",
              kind: "zone",
              shape: "sphere",
              center: { x: 0, y: 0, z: 0 },
              radius: 3,
            },
          ],
        }),
      ),
    ).toEqual([]);
  });

  test("collects markers and volumes with flat and multi-list triggers", () => {
    registerSpawn();
    registerTriggerAction({
      id: "talk",
      label: "Talk",
      schema: { fields: [{ type: "text", key: "line", default: "hi" }] },
    });
    const rows = listDocumentTriggers({
      markers: [
        {
          id: "npc",
          kind: "npc",
          position: { x: 1, y: 0, z: 2 },
          label: "Guard",
          meta: { on: "interact", action: "talk", line: "halt" },
        },
        {
          id: "quiet",
          kind: "spawn",
          position: { x: 0, y: 0, z: 0 },
          meta: { on: "", action: "" },
        },
      ],
      volumes: [
        {
          id: "wave_zone",
          kind: "zone",
          shape: "box",
          center: { x: 10, y: 0, z: 0 },
          halfExtents: { x: 4, y: 2, z: 4 },
          meta: {
            triggers: [
              { on: "enter", action: "spawn_wave", wave: 1 },
              { on: "exit", action: "spawn_wave", wave: 2 },
              { on: "nope", action: "spawn_wave" },
            ],
          },
        },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      sourceId: "npc",
      sourceKind: "marker",
      objectKind: "npc",
      label: "Guard",
      bindings: [{ on: "interact", action: "talk" }],
    });
    expect(rows[1]).toEqual({
      sourceId: "wave_zone",
      sourceKind: "volume",
      objectKind: "zone",
      label: "wave_zone",
      bindings: [
        { on: "enter", action: "spawn_wave" },
        { on: "exit", action: "spawn_wave" },
      ],
    });
  });

  test("falls back to id when label is missing", () => {
    registerSpawn();
    const rows = listDocumentTriggers(
      doc({
        volumes: [
          {
            id: "zone_1",
            kind: "zone",
            shape: "sphere",
            center: { x: 0, y: 0, z: 0 },
            radius: 2,
            meta: { on: "enter", action: "spawn_wave" },
          },
        ],
      }),
    );
    expect(rows[0]?.label).toBe("zone_1");
  });

  test("skips invalid events and empty actions", () => {
    expect(
      listDocumentTriggers(
        doc({
          markers: [
            {
              id: "bad",
              kind: "npc",
              position: { x: 0, y: 0, z: 0 },
              meta: { on: "jump", action: "spawn_wave" },
            },
            {
              id: "empty",
              kind: "npc",
              position: { x: 0, y: 0, z: 0 },
              meta: { on: "enter", action: "" },
            },
          ],
        }),
      ),
    ).toEqual([]);
  });
});

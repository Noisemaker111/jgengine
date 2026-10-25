import { describe, expect, test } from "bun:test";
import { keybind, proximityPrompt } from "@jgengine/core/interaction/proximityPrompt";
import type { SceneObject } from "@jgengine/core/scene/objectStore";
import {
  INTERACTION_COMMAND,
  INTERACTION_TARGET_TYPE,
  buildSceneObjectPrompts,
  gamePositionedPromptsEqual,
  resolveInteractionProximity,
} from "@llmville/game/simulation/interaction";

const rack: SceneObject = {
  instanceId: "rack-1",
  catalogId: "starter_rack",
  position: [1, 0, 0],
  rotationY: 0,
};
const decor: SceneObject = {
  instanceId: "item-1",
  catalogId: "plant",
  position: [1.5, 0, 0],
  rotationY: 0,
};

const catalogPrompt = proximityPrompt({ radius: 2, display: keybind("interact") });
const resolvePrompt = () => catalogPrompt;

describe("buildSceneObjectPrompts", () => {
  test("rack objects become keybind prompts invoking rack.configure", () => {
    const [prompt] = buildSceneObjectPrompts([rack], resolvePrompt);
    expect(prompt.prompt).toEqual({
      radius: 2,
      display: { kind: "keybind", actionId: "interact" },
      invoke: { name: INTERACTION_COMMAND.rackConfigure, input: { rackId: "rack-1" } },
    });
    expect(prompt.target).toEqual({ type: INTERACTION_TARGET_TYPE.rack, id: "rack-1", itemId: "starter_rack" });
    expect(prompt.position).toEqual({ x: 1, z: 0 });
  });

  test("decor objects are display-only prompts at the catalog radius", () => {
    const [prompt] = buildSceneObjectPrompts([decor], resolvePrompt);
    expect(prompt.prompt.radius).toBe(2);
    expect(prompt.prompt.invoke).toBeNull();
    expect(prompt.target.type).toBe(INTERACTION_TARGET_TYPE.placedItem);
  });

  test("objects without a catalog prompt are skipped", () => {
    expect(buildSceneObjectPrompts([rack, decor], () => null)).toEqual([]);
  });

  test("decor outranks racks so a placed item in range wins", () => {
    const prompts = buildSceneObjectPrompts([rack, decor], resolvePrompt);
    expect(prompts[0]?.priority).toBe(0);
    expect(prompts[1]?.priority).toBe(1);
  });
});

describe("resolveInteractionProximity", () => {
  test("mirrors the externally resolved prompt onto the target", () => {
    const [prompt] = buildSceneObjectPrompts([rack], resolvePrompt);
    const proximity = resolveInteractionProximity({ x: 0, z: 0 }, null, prompt);
    expect(proximity.activePrompt).toBe(prompt);
    expect(proximity.target).toEqual({ type: INTERACTION_TARGET_TYPE.rack, id: "rack-1", itemId: "starter_rack" });

    const empty = resolveInteractionProximity({ x: 0, z: 0 }, null, null);
    expect(empty.target).toBeNull();
    expect(empty.activePrompt).toBeNull();
  });

  test("desk zone keeps its radius", () => {
    expect(resolveInteractionProximity({ x: 0, z: 0 }, { x: 2.2, z: 0 }, null).nearDeskRig).toBe(true);
    expect(resolveInteractionProximity({ x: 0, z: 0 }, { x: 2.5, z: 0 }, null).nearDeskRig).toBe(false);
  });
});

describe("gamePositionedPromptsEqual", () => {
  test("matches structurally identical prompts", () => {
    const [a] = buildSceneObjectPrompts([rack], resolvePrompt);
    const [b] = buildSceneObjectPrompts([rack], resolvePrompt);
    expect(gamePositionedPromptsEqual(a, b)).toBe(true);
    expect(gamePositionedPromptsEqual(a, null)).toBe(false);

    const [moved] = buildSceneObjectPrompts([{ ...rack, position: [2, 0, 0] }], resolvePrompt);
    expect(gamePositionedPromptsEqual(a, moved)).toBe(false);
  });
});

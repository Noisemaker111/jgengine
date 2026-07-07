import { describe, expect, test } from "bun:test";
import { patrol, player, promptable, talkable, wander } from "@jgengine/core/scene/behaviors";
import { keybind, label, proximityPrompt } from "@jgengine/core/interaction/proximityPrompt";

describe("behavior constructors", () => {
  test("wander carries its radius", () => {
    expect(wander({ radius: 4 })).toEqual({ kind: "wander", radius: 4 });
  });

  test("promptable attaches the given proximity prompt", () => {
    const prompt = proximityPrompt({ radius: 3, display: label("Panel") });
    expect(promptable(prompt)).toEqual({ kind: "promptable", prompt });
  });

  test("talkable is promptable with an interact keybind and a dialogue.open command", () => {
    const behavior = talkable("shop_dialogue");
    expect(behavior.kind).toBe("promptable");
    expect(behavior.prompt.radius).toBeGreaterThan(0);
    expect(behavior.prompt.display).toEqual(keybind("interact"));
    expect(behavior.prompt.invoke).toEqual({ name: "dialogue.open", input: { id: "shop_dialogue" } });
  });

  test("player is a bare marker", () => {
    expect(player()).toEqual({ kind: "player" });
  });

  test("patrol carries a looping waypoint route", () => {
    const waypoints = [
      [0, 0, 0],
      [4, 0, 0],
    ] as const;
    expect(patrol({ waypoints: [...waypoints], speed: 2 })).toEqual({
      kind: "patrol",
      waypoints: [...waypoints],
      speed: 2,
      loop: true,
    });
    expect(patrol({ waypoints: [...waypoints], speed: 2, loop: false }).loop).toBe(false);
  });
});

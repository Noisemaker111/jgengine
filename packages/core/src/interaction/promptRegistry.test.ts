import { describe, expect, it } from "bun:test";

import { createPromptRegistry } from "./promptRegistry";
import { keybind, proximityPrompt, type PositionedPrompt } from "./proximityPrompt";

function positioned(id: string, x: number, z: number, radius: number, priority?: number): PositionedPrompt {
  const prompt: PositionedPrompt = {
    id,
    position: { x, z },
    prompt: proximityPrompt({ radius, display: keybind("interact", "Open") }),
  };
  if (priority !== undefined) prompt.priority = priority;
  return prompt;
}

describe("createPromptRegistry", () => {
  it("registers prompts and lists them in registration order", () => {
    const registry = createPromptRegistry();
    registry.register(positioned("a", 0, 0, 3));
    registry.register(positioned("b", 10, 0, 3));
    expect(registry.all().map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("resolves the nearest in-range prompt via the resolver", () => {
    const registry = createPromptRegistry();
    registry.register(positioned("far", 8, 0, 3));
    registry.register(positioned("near", 1, 0, 3));
    expect(registry.resolve({ x: 0, z: 0 })?.id).toBe("near");
    expect(registry.active()?.id).toBe("near");
  });

  it("returns null when the player is outside every radius", () => {
    const registry = createPromptRegistry();
    registry.register(positioned("a", 20, 0, 3));
    expect(registry.resolve({ x: 0, z: 0 })).toBeNull();
    expect(registry.active()).toBeNull();
  });

  it("lets higher priority beat a closer prompt", () => {
    const registry = createPromptRegistry();
    registry.register(positioned("close", 1, 0, 5, 0));
    registry.register(positioned("important", 3, 0, 5, 10));
    expect(registry.resolve({ x: 0, z: 0 })?.id).toBe("important");
  });

  it("notifies subscribers only when the active prompt changes", () => {
    const registry = createPromptRegistry();
    registry.register(positioned("a", 0, 0, 4));
    registry.register(positioned("b", 20, 0, 4));
    let notifications = 0;
    registry.subscribe(() => {
      notifications += 1;
    });

    registry.resolve({ x: 0, z: 0 }); // null -> a : change
    registry.resolve({ x: 0.5, z: 0 }); // a -> a : no change
    registry.resolve({ x: 1, z: 0 }); // still a : no change
    expect(notifications).toBe(1);

    registry.resolve({ x: 20, z: 0 }); // a -> b : change
    expect(notifications).toBe(2);

    registry.resolve({ x: 50, z: 50 }); // b -> null : change
    expect(notifications).toBe(3);
    expect(registry.active()).toBeNull();
  });

  it("update patches a prompt in place without reordering", () => {
    const registry = createPromptRegistry();
    registry.register(positioned("a", 0, 0, 2));
    registry.register(positioned("b", 10, 0, 2));
    registry.update("a", { prompt: proximityPrompt({ radius: 2, display: keybind("interact", "Loot") }) });
    const a = registry.all().find((p) => p.id === "a");
    expect(a?.prompt.display).toEqual({ kind: "keybind", actionId: "interact", label: "Loot" });
    expect(registry.all().map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("update is a no-op for an unknown id", () => {
    const registry = createPromptRegistry();
    registry.register(positioned("a", 0, 0, 2));
    registry.update("missing", { priority: 9 });
    expect(registry.all()).toHaveLength(1);
  });

  it("unregister removes a prompt and clears active + notifies when it was active", () => {
    const registry = createPromptRegistry();
    registry.register(positioned("a", 0, 0, 4));
    let notifications = 0;
    registry.subscribe(() => {
      notifications += 1;
    });
    registry.resolve({ x: 0, z: 0 });
    expect(registry.active()?.id).toBe("a");
    expect(notifications).toBe(1);

    expect(registry.unregister("a")).toBe(true);
    expect(registry.active()).toBeNull();
    expect(notifications).toBe(2);
    expect(registry.unregister("a")).toBe(false);
  });

  it("clear drops all prompts and the active selection", () => {
    const registry = createPromptRegistry();
    registry.register(positioned("a", 0, 0, 4));
    registry.resolve({ x: 0, z: 0 });
    let notifications = 0;
    registry.subscribe(() => {
      notifications += 1;
    });
    registry.clear();
    expect(registry.all()).toHaveLength(0);
    expect(registry.active()).toBeNull();
    expect(notifications).toBe(1);
  });

  it("does not retain external mutation of a registered prompt", () => {
    const registry = createPromptRegistry();
    const input = positioned("a", 0, 0, 4);
    registry.register(input);
    input.position.x = 999;
    input.prompt.radius = 0;
    expect(registry.resolve({ x: 0, z: 0 })?.id).toBe("a");
  });

  it("round-trips prompts and active id through snapshot/restore", () => {
    const registry = createPromptRegistry();
    registry.register(positioned("a", 0, 0, 4));
    registry.register(positioned("b", 20, 0, 4));
    registry.resolve({ x: 0, z: 0 });
    const snap = registry.snapshot();
    expect(snap.activeId).toBe("a");
    expect(snap.prompts.map((p) => p.id)).toEqual(["a", "b"]);

    const restored = createPromptRegistry();
    let notifications = 0;
    restored.subscribe(() => {
      notifications += 1;
    });
    restored.restore(snap);
    expect(restored.all().map((p) => p.id)).toEqual(["a", "b"]);
    expect(restored.active()?.id).toBe("a");
    expect(notifications).toBe(1);
  });

  it("snapshot is decoupled from later registry mutation", () => {
    const registry = createPromptRegistry();
    registry.register(positioned("a", 0, 0, 4));
    const snap = registry.snapshot();
    registry.update("a", { position: { x: 100, z: 100 } });
    expect(snap.prompts[0]?.position).toEqual({ x: 0, z: 0 });
  });

  it("restore drops an active id that no longer resolves to a prompt", () => {
    const registry = createPromptRegistry();
    registry.restore({ prompts: [positioned("a", 0, 0, 4)], activeId: "ghost" });
    expect(registry.active()).toBeNull();
  });
});

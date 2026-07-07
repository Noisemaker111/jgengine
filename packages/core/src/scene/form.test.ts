import { describe, expect, test } from "bun:test";

import { createGameEvents } from "../game/events";
import { createEntityStore } from "./entityStore";
import { createForms } from "./form";

interface ManualTime {
  after(seconds: number, callback: () => void): () => void;
  fire(): void;
}

function createManualTime(): ManualTime {
  const pending: (() => void)[] = [];
  return {
    after(_seconds, callback) {
      pending.push(callback);
      return () => {
        const index = pending.indexOf(callback);
        if (index >= 0) pending.splice(index, 1);
      };
    },
    fire() {
      const callbacks = pending.splice(0, pending.length);
      for (const callback of callbacks) callback();
    },
  };
}

describe("forms", () => {
  test("shapeshift applies the movement and mesh bundle, and exposes the ability set", () => {
    const entities = createEntityStore();
    const id = entities.spawn("hero", { id: "alice", movement: { walkSpeed: 4 } });
    const time = createManualTime();
    const forms = createForms({ entities, time });
    forms.register([{ id: "wolf_form", movement: { walkSpeed: 8 }, abilities: ["bite", "howl"], model: "wolf" }]);

    expect(forms.shapeshift(id, "wolf_form")).toBeNull();
    expect(entities.get(id)?.movement).toEqual({ walkSpeed: 8 });
    expect(entities.get(id)?.name).toBe("wolf");
    expect(forms.active(id)).toBe("wolf_form");
    expect(forms.abilities(id)).toEqual(["bite", "howl"]);
  });

  test("shapeshift into an unknown form is rejected", () => {
    const entities = createEntityStore();
    const id = entities.spawn("hero", { id: "alice" });
    const forms = createForms({ entities, time: createManualTime() });
    expect(forms.shapeshift(id, "missing")).toEqual({ reason: 'unknown form "missing"' });
  });

  test("reverts after the configured game-time duration", () => {
    const entities = createEntityStore();
    const id = entities.spawn("hero", { id: "alice", movement: { walkSpeed: 4 } });
    const time = createManualTime();
    const forms = createForms({ entities, time });
    forms.register([{ id: "wolf_form", movement: { walkSpeed: 8 }, model: "wolf" }]);

    forms.shapeshift(id, "wolf_form", 10);
    expect(forms.active(id)).toBe("wolf_form");

    time.fire();
    expect(forms.active(id)).toBeNull();
    expect(entities.get(id)?.movement).toEqual({ walkSpeed: 4 });
    expect(entities.get(id)?.name).toBe("hero");
  });

  test("manual revert restores the original bundle and cancels the pending timer", () => {
    const entities = createEntityStore();
    const id = entities.spawn("hero", { id: "alice", movement: { walkSpeed: 4 } });
    const events = createGameEvents();
    const changes: { instanceId: string; formId: string | null }[] = [];
    events.on("form.changed", (event) => void changes.push(event));
    const time = createManualTime();
    const forms = createForms({ entities, time, events });
    forms.register([{ id: "wolf_form", movement: { walkSpeed: 8 }, model: "wolf" }]);

    forms.shapeshift(id, "wolf_form", 30);
    forms.revert(id);
    expect(forms.active(id)).toBeNull();
    expect(entities.get(id)?.movement).toEqual({ walkSpeed: 4 });
    expect(entities.get(id)?.name).toBe("hero");
    expect(changes).toEqual([
      { instanceId: id, formId: "wolf_form" },
      { instanceId: id, formId: null },
    ]);
  });

  test("re-shapeshifting preserves the original baseline across forms", () => {
    const entities = createEntityStore();
    const id = entities.spawn("hero", { id: "alice", movement: { walkSpeed: 4 } });
    const time = createManualTime();
    const forms = createForms({ entities, time });
    forms.register([
      { id: "wolf_form", movement: { walkSpeed: 8 }, model: "wolf" },
      { id: "bear_form", movement: { walkSpeed: 5 }, model: "bear" },
    ]);

    forms.shapeshift(id, "wolf_form", 100);
    forms.shapeshift(id, "bear_form", 100);
    expect(forms.active(id)).toBe("bear_form");
    expect(entities.get(id)?.movement).toEqual({ walkSpeed: 5 });

    forms.revert(id);
    expect(entities.get(id)?.movement).toEqual({ walkSpeed: 4 });
    expect(entities.get(id)?.name).toBe("hero");
  });
});

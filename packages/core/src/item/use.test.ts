import { describe, expect, test } from "bun:test";
import { createItemUse, type ItemUseHandler } from "@jgengine/core/item/use";

interface TestState {
  healed: string[];
}

const drinkHealthVial: ItemUseHandler<TestState> = {
  can(state, input) {
    return state.healed.includes(input.from) ? { reason: "already-healed" } : null;
  },
  apply(state, input) {
    return { state: { healed: [...state.healed, input.from] } };
  },
};

function itemUseFixture() {
  const resolveUse = (itemId: string) => (itemId === "health_vial" ? "drinkHealthVial" : null);
  const itemUse = createItemUse<TestState>(resolveUse);
  itemUse.register({ drinkHealthVial });
  return itemUse;
}

describe("item.use", () => {
  test("register exposes handler names", () => {
    const itemUse = itemUseFixture();
    expect(itemUse.registered()).toEqual(["drinkHealthVial"]);
  });

  test("register throws when a handler name is already registered", () => {
    const itemUse = itemUseFixture();
    expect(() => itemUse.register({ drinkHealthVial })).toThrow();
  });

  test("can returns null when the handler allows the use", () => {
    const itemUse = itemUseFixture();
    const state: TestState = { healed: [] };
    expect(itemUse.can(state, { from: "player_1", itemId: "health_vial" })).toBeNull();
  });

  test("can rejects unknown items without throwing", () => {
    const itemUse = itemUseFixture();
    const state: TestState = { healed: [] };
    expect(itemUse.can(state, { from: "player_1", itemId: "unknown_item" })).toEqual({ reason: "not-usable" });
  });

  test("can rejects items whose catalog handler was never registered", () => {
    const itemUse = createItemUse<TestState>((itemId) => (itemId === "sword" ? "swingSword" : null));
    const state: TestState = { healed: [] };
    expect(itemUse.can(state, { from: "player_1", itemId: "sword" })).toEqual({ reason: "unknown-handler" });
  });

  test("use applies the handler and returns updated state", () => {
    const itemUse = itemUseFixture();
    const state: TestState = { healed: [] };
    const result = itemUse.use(state, { from: "player_1", itemId: "health_vial" });
    expect(result.error).toBeUndefined();
    expect(result.state.healed).toEqual(["player_1"]);
  });

  test("use surfaces the handler's can rejection as an error, without applying", () => {
    const itemUse = itemUseFixture();
    const state: TestState = { healed: ["player_1"] };
    const result = itemUse.use(state, { from: "player_1", itemId: "health_vial" });
    expect(result).toEqual({ state, error: "already-healed" });
  });

  test("use passes aim through to the handler", () => {
    let seenAim: unknown;
    const itemUse = createItemUse<TestState>(() => "fireGun");
    itemUse.register({
      fireGun: {
        apply(state, input) {
          seenAim = input.aim;
          return { state };
        },
      },
    });
    const state: TestState = { healed: [] };
    itemUse.use(state, { from: "player_1", itemId: "pistol", aim: { yaw: 0.5, pitch: 0 } });
    expect(seenAim).toEqual({ yaw: 0.5, pitch: 0 });
  });
});

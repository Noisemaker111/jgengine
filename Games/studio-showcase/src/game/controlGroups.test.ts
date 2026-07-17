import { describe, expect, test } from "bun:test";

import { createControlGroupManager, HOME_BOOKMARK } from "./controlGroups";

/** Minimal entity world + camera stand-in for the control-group adopter. */
function harness() {
  const live = new Set<string>();
  const focused: string[] = [];
  const manager = createControlGroupManager({
    entityExists: (id) => live.has(id),
    focus: (id) => focused.push(id),
  });
  return { live, focused, manager };
}

describe("studio-showcase control groups", () => {
  test("bind then recall restores the saved selection", () => {
    const { live, manager } = harness();
    live.add("unit-a");
    live.add("unit-b");
    manager.selection.replace(["unit-a", "unit-b"]);
    manager.bindGroup(1);

    manager.selection.clear();
    const applied = manager.recallGroup(1);
    expect(applied).toEqual(["unit-a", "unit-b"]);
    expect(manager.selection.list()).toEqual(["unit-a", "unit-b"]);
  });

  test("recall prunes despawned entities from the group", () => {
    const { live, manager } = harness();
    live.add("alive");
    live.add("doomed");
    manager.selection.replace(["alive", "doomed"]);
    manager.bindGroup(2);

    live.delete("doomed"); // entity destroyed after binding
    const applied = manager.recallGroup(2);
    expect(applied).toEqual(["alive"]);
    expect(manager.bookmarks.recall("2")).toEqual(["alive"]); // stale ref pruned from the store
  });

  test("the non-numbered home bookmark recalls and focuses", () => {
    const { live, focused, manager } = harness();
    live.add("hub");
    manager.bookmarks.bind(HOME_BOOKMARK, ["hub"]);
    const applied = manager.recallHome();
    expect(applied).toEqual(["hub"]);
    expect(focused).toEqual(["hub"]);
  });

  test("a first recall does not focus; a double-tap within the window does", () => {
    const { live, focused, manager } = harness();
    live.add("squad");
    manager.selection.replace(["squad"]);
    manager.bindGroup(3);

    manager.recallGroup(3);
    expect(focused).toEqual([]); // single recall selects but does not focus
    manager.recallGroup(3); // immediate second tap → focus
    expect(focused).toEqual(["squad"]);
  });
});

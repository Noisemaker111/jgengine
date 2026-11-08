import { describe, expect, test } from "bun:test";
import { createVisibilityChanges } from "./visibilityChanges";

describe("createVisibilityChanges", () => {
  test("marks only the watchers of a changed id, every watcher on a replaced predicate, none after unwatching", () => {
    const changes = createVisibilityChanges();
    const marks = { a: 0, b: 0 };
    const unwatchA = changes.watch(["x", "y"], () => { marks.a += 1; });
    changes.watch(["y", "z"], () => { marks.b += 1; });
    changes.notify(["x"]);
    expect(marks).toEqual({ a: 1, b: 0 });
    changes.notify(["y", "w"]);
    expect(marks).toEqual({ a: 2, b: 1 });
    changes.notifyAll();
    expect(marks).toEqual({ a: 3, b: 2 });
    unwatchA();
    changes.notify(["x", "y"]);
    changes.notifyAll();
    expect(marks).toEqual({ a: 3, b: 4 });
  });
});

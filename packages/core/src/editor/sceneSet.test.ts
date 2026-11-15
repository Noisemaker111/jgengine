import { describe, expect, test } from "bun:test";

import { createSceneSet, withSceneSet } from "./sceneSet";

const scenes = {
  street: { label: "Main Street", document: { markers: [] }, file: "editor.scene.json" },
  grid: { label: "Downtown", document: { markers: [{ id: "x" }] }, file: "downtown.scene.json" },
} as const;

describe("scene sets", () => {
  test("start on the initial scene, else the remembered one, else the default; unknown ids are ignored", () => {
    expect(createSceneSet({ scenes, defaultId: "street" }).active()).toBe("street");
    expect(createSceneSet({ scenes, defaultId: "street", initial: "grid" }).active()).toBe("grid");
    expect(createSceneSet({ scenes, defaultId: "street", storage: { read: () => "grid", write() {} } }).active()).toBe("grid");
    expect(createSceneSet({ scenes, defaultId: "street", initial: "moon", storage: { read: () => "mars", write() {} } }).active()).toBe("street");
    expect(() => createSceneSet({ scenes, defaultId: "moon" as never })).toThrow();
  });

  test("select switches, remembers and notifies once; the live scene or an unknown one changes nothing", () => {
    const written: string[] = [];
    const set = createSceneSet({ scenes, defaultId: "street", storage: { read: () => null, write: (id) => written.push(id) } });
    const heard: string[] = [];
    const off = set.subscribe((id) => heard.push(id));
    expect(set.select("street")).toBe(false);
    expect(set.select("moon")).toBe(false);
    expect(set.select("grid")).toBe(true);
    expect(set.active()).toBe("grid");
    expect(heard).toEqual(["grid"]);
    expect(written).toEqual(["grid"]);
    off();
    set.select("street");
    expect(heard).toEqual(["grid"]);
    expect(set.next()).toBe("grid");
    expect(set.entry("grid").file).toBe("downtown.scene.json");
  });

  test("a storage that throws never blocks a switch", () => {
    const set = createSceneSet({ scenes, defaultId: "street", storage: { read: () => { throw new Error("blocked"); }, write: () => { throw new Error("blocked"); } } });
    expect(set.select("grid")).toBe(true);
    expect(set.active()).toBe("grid");
  });

  test("withSceneSet builds the playable for the live scene and carries the switch for the shell", () => {
    const set = createSceneSet({ scenes, defaultId: "street", initial: "grid" });
    const built: string[] = [];
    const playable = withSceneSet(set, (id) => { built.push(id); return { name: id }; });
    expect(playable.name).toBe("grid");
    expect(playable.scenes.build("street").name).toBe("street");
    expect(built).toEqual(["grid", "street"]);
  });
});

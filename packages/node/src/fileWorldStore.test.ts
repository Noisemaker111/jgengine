import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileWorldStore } from "./fileWorldStore";

test("file hosted world store round-trips and reports missing files as null", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jgengine-world-"));
  try {
    const store = fileWorldStore(join(directory, "nested", "world.json"));
    expect(await store.load()).toBeNull();
    const record = { snapshot: { entities: [{ id: "hero" }] }, revision: 7 };
    await store.save(record);
    expect(await store.load()).toEqual(record);
    expect(JSON.parse(await readFile(join(directory, "nested", "world.json"), "utf8"))).toEqual(record);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

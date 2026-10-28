import { describe, expect, test } from "bun:test";

import { expandLibraryRecord } from "./assetLibrary";
import { assetLibrary } from "./libraryIndex";
import { rocketboxAnimationRecords, rocketboxClipOf } from "./libraryRocketbox";
import { libraryServedPath } from "./libraryServed";

const tree = [
  "Assets/Animations/all_animations_max_motextr_static/m_walk_neutral_01.max.fbx",
  "Assets/Animations/all_animations_max_motextr_static/f_idle_finger nail_01.max.fbx",
  "Assets/Animations/all_animations_max_motextr_xy/f_run_fast_01.max.fbx",
  "Assets/Animations/all_animations_max_motextr_xyz/f_cell_phone_talk_01.max.fbx",
  "Assets/Avatars/Adults/Male_Adult_01/Export/Male_Adult_01.fbx",
  "Assets/Animations/readme.txt",
];

describe("Rocketbox animations in the library", () => {
  test("every animation FBX becomes a tagged MIT animation entry", () => {
    const records = rocketboxAnimationRecords(tree);
    expect(records.map((record) => record.id)).toEqual([
      "Animations/static/f_idle_finger-nail_01",
      "Animations/static/m_walk_neutral_01",
      "Animations/xy/f_run_fast_01",
      "Animations/xyz/f_cell_phone_talk_01",
    ]);
    const walk = records.find((record) => record.id === "Animations/static/m_walk_neutral_01");
    expect(walk).toMatchObject({ kind: "animation", title: "Male Walk Neutral 01", rigged: true });
    expect(walk?.tags).toEqual(["animation", "human", "in-place", "male", "walk", "neutral"]);
    expect(records.find((record) => record.id === "Animations/xy/f_run_fast_01")?.tags).toContain("root-motion");
    const first = records[0];
    if (first === undefined) throw new Error("no records");
    const entry = expandLibraryRecord("rocketbox", first);
    expect(entry.license).toBe("MIT");
    expect(entry.thumbnail).toBeUndefined();
    expect(entry.page).toContain("f_idle_finger%20nail_01.max.fbx");
  });

  test("a clip id names its upstream file, folder and in-place rule", () => {
    expect(rocketboxClipOf({ id: "Animations/static/m_walk_neutral_01" })).toEqual({ name: "m_walk_neutral_01", file: "m_walk_neutral_01.max.fbx", folder: "static" });
    expect(rocketboxClipOf({ id: "Animations/xy/f_run_fast_01" })).toEqual({ name: "f_run_fast_01", file: "f_run_fast_01.max.fbx", folder: "xy", inPlace: true });
    expect(rocketboxClipOf({ id: "Animations/static/f_idle_finger-nail_01", file: "f_idle_finger nail_01.max.fbx" }).file).toBe("f_idle_finger nail_01.max.fbx");
    expect(() => rocketboxClipOf({ id: "Adults/Male_Adult_01" })).toThrow(/not a Rocketbox animation/);
  });

  test("the committed library lists all 471 clips, each with its own served clip", () => {
    const clips = assetLibrary().filter((entry) => entry.source === "rocketbox" && entry.kind === "animation");
    expect(clips.length).toBe(471);
    const walk = clips.find((entry) => entry.key === "rocketbox:Animations/xy/m_walk_neutral_01");
    expect(walk === undefined ? undefined : libraryServedPath(walk)).toEqual({
      dir: "animations/rocketbox/xy/m_walk_neutral_01",
      url: "/animations/rocketbox/xy/m_walk_neutral_01/clip.glb",
    });
    expect(new Set(clips.map((entry) => libraryServedPath(entry).dir)).size).toBe(clips.length);
    const characters = assetLibrary().filter((entry) => entry.source === "rocketbox" && entry.kind === "character");
    expect(characters.every((entry) => entry.thumbnail?.endsWith(".png") === true)).toBe(true);
  });
});

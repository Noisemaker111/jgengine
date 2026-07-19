import { afterEach, describe, expect, test } from "bun:test";

import {
  clearSpawnOverride,
  installSpawnOverride,
  parseSpawnOverride,
  readSpawnOverride,
} from "./spawnOverride";

afterEach(() => clearSpawnOverride());

describe("parseSpawnOverride", () => {
  test("parses an x,y,z tuple", () => {
    expect(parseSpawnOverride("10,2,-5")).toEqual({ x: 10, y: 2, z: -5 });
  });

  test("parses an x,y,z,yaw tuple", () => {
    expect(parseSpawnOverride("1,0,3,1.57")).toEqual({ x: 1, y: 0, z: 3, rotationY: 1.57 });
  });

  test("tolerates surrounding whitespace", () => {
    expect(parseSpawnOverride(" 4 , 0 , 8 ")).toEqual({ x: 4, y: 0, z: 8 });
  });

  test("rejects null, short, long, and non-finite input", () => {
    expect(parseSpawnOverride(null)).toBeNull();
    expect(parseSpawnOverride(undefined)).toBeNull();
    expect(parseSpawnOverride("")).toBeNull();
    expect(parseSpawnOverride("1,2")).toBeNull();
    expect(parseSpawnOverride("1,2,3,4,5")).toBeNull();
    expect(parseSpawnOverride("1,foo,3")).toBeNull();
  });
});

describe("spawn override install/read/clear", () => {
  test("defaults to null and round-trips an install", () => {
    expect(readSpawnOverride()).toBeNull();
    installSpawnOverride({ x: 7, y: 1, z: 2 });
    expect(readSpawnOverride()).toEqual({ x: 7, y: 1, z: 2 });
    clearSpawnOverride();
    expect(readSpawnOverride()).toBeNull();
  });

  test("last install wins", () => {
    installSpawnOverride({ x: 1, y: 0, z: 0 });
    installSpawnOverride({ x: 2, y: 0, z: 0 });
    expect(readSpawnOverride()).toEqual({ x: 2, y: 0, z: 0 });
  });
});

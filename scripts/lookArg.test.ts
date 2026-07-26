import { describe, expect, it } from "bun:test";

import { lookSearchParams, parseLookAim } from "./lookArg";

describe("parseLookAim", () => {
  it("returns undefined without --look", () => {
    expect(parseLookAim(undefined, undefined)).toBeUndefined();
  });

  it("accepts the ground form and the explicit form", () => {
    expect(parseLookAim("12,-4", undefined)).toEqual({ point: [12, -4] });
    expect(parseLookAim("12,3,-4", undefined)).toEqual({ point: [12, 3, -4] });
  });

  it("carries the vantage from --look-from", () => {
    expect(parseLookAim("0,0", "25,8,1.2")).toEqual({ point: [0, 0], distance: 25, height: 8, angle: 1.2 });
    expect(parseLookAim("0,0", "25")).toEqual({ point: [0, 0], distance: 25 });
  });

  it("rejects the retired positional forms with the rewrite", () => {
    expect(() => parseLookAim("0,3,0,25", undefined)).toThrow(/--look-from 25/);
    expect(() => parseLookAim("0,0,0,2,0.5", undefined)).toThrow(/--look-from 2,0.5/);
  });

  it("rejects too few coordinates instead of silently ignoring them", () => {
    expect(() => parseLookAim("5", undefined)).toThrow(/1 number/);
  });

  it("rejects non-numeric fields naming the field", () => {
    expect(() => parseLookAim("abc,def", undefined)).toThrow(/field 1 .*"abc"/);
    expect(() => parseLookAim("1,,2", undefined)).toThrow(/field 2/);
  });

  it("rejects a vantage with no aim point", () => {
    expect(() => parseLookAim(undefined, "25")).toThrow(/needs --look/);
  });

  it("rejects a degenerate distance", () => {
    expect(() => parseLookAim("0,0", "0,20")).toThrow(/distance must be positive/);
  });

  it("rejects an over-long vantage", () => {
    expect(() => parseLookAim("0,0", "1,2,3,4")).toThrow(/at most dist,height,angle/);
  });
});

describe("lookSearchParams", () => {
  it("encodes the point alone when there is no vantage", () => {
    expect(lookSearchParams({ point: [1, 2] })).toEqual({ look: "1,2" });
  });

  it("encodes holes so a bare height keeps its slot", () => {
    expect(lookSearchParams({ point: [1, 2], height: 9 })).toEqual({ look: "1,2", lookFrom: ",9," });
  });
});

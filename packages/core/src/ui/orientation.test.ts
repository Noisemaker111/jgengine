import { describe, expect, test } from "bun:test";

import {
  orientationGateActive,
  orientationHintActive,
  resolveMobileOrientationRule,
  resolveOrientationRequirement,
} from "./orientation";

describe("resolveMobileOrientationRule", () => {
  test("legacy strings stay advisory", () => {
    expect(resolveMobileOrientationRule("landscape")).toBe("landscape");
    expect(resolveMobileOrientationRule("portrait")).toBe("portrait");
  });
  test("object form reads mobile rule, defaults to any", () => {
    expect(resolveMobileOrientationRule({ mobile: "landscape-required" })).toBe("landscape-required");
    expect(resolveMobileOrientationRule({})).toBe("any");
    expect(resolveMobileOrientationRule(undefined)).toBe("any");
  });
});

describe("resolveOrientationRequirement", () => {
  test("desktop is always unconstrained", () => {
    expect(resolveOrientationRequirement({ mobile: "landscape-required" }, "desktop")).toEqual({
      supported: true,
      required: null,
      preferred: null,
    });
  });
  test("landscape-required gates on mobile", () => {
    expect(resolveOrientationRequirement({ mobile: "landscape-required" }, "mobile")).toEqual({
      supported: true,
      required: "landscape",
      preferred: "landscape",
    });
  });
  test("portrait-required gates on mobile", () => {
    expect(resolveOrientationRequirement({ mobile: "portrait-required" }, "mobile").required).toBe("portrait");
  });
  test("advisory preference does not gate", () => {
    const req = resolveOrientationRequirement("landscape", "mobile");
    expect(req.required).toBeNull();
    expect(req.preferred).toBe("landscape");
  });
  test("any imposes nothing", () => {
    expect(resolveOrientationRequirement({ mobile: "any" }, "mobile")).toEqual({
      supported: true,
      required: null,
      preferred: null,
    });
  });
  test("unsupported is not supported", () => {
    expect(resolveOrientationRequirement({ mobile: "unsupported" }, "mobile").supported).toBe(false);
  });
  test("undefined orientation defaults to any", () => {
    expect(resolveOrientationRequirement(undefined, "mobile")).toEqual({
      supported: true,
      required: null,
      preferred: null,
    });
  });
});

describe("orientationGateActive", () => {
  const landscapeReq = resolveOrientationRequirement({ mobile: "landscape-required" }, "mobile");
  test("gate is up when required orientation is unmet", () => {
    expect(orientationGateActive(landscapeReq, "portrait")).toBe(true);
  });
  test("gate clears once orientation matches", () => {
    expect(orientationGateActive(landscapeReq, "landscape")).toBe(false);
  });
  test("unsupported always gates", () => {
    const req = resolveOrientationRequirement({ mobile: "unsupported" }, "mobile");
    expect(orientationGateActive(req, "landscape")).toBe(true);
    expect(orientationGateActive(req, "portrait")).toBe(true);
  });
  test("no requirement never gates", () => {
    const req = resolveOrientationRequirement("landscape", "mobile");
    expect(orientationGateActive(req, "portrait")).toBe(false);
  });
});

describe("orientationHintActive", () => {
  test("advisory preference hints when unmet, never when required", () => {
    const advisory = resolveOrientationRequirement("landscape", "mobile");
    expect(orientationHintActive(advisory, "portrait")).toBe(true);
    expect(orientationHintActive(advisory, "landscape")).toBe(false);
    const required = resolveOrientationRequirement({ mobile: "landscape-required" }, "mobile");
    expect(orientationHintActive(required, "portrait")).toBe(false);
  });
});

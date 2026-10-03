import { describe, expect, test } from "bun:test";

import {
  resolvePresentationEffects,
  resolveWorldOverlayBars,
} from "./presentationResolve";

describe("resolveWorldOverlayBars", () => {
  test("undefined and false resolve to null", () => {
    expect(resolveWorldOverlayBars(undefined)).toBeNull();
    expect(resolveWorldOverlayBars(false)).toBeNull();
  });

  test("true uses the default health stat", () => {
    expect(resolveWorldOverlayBars(true)).toEqual({ statId: "health", occlude: true });
  });

  test("object form fills defaults and keeps explicit fields", () => {
    expect(resolveWorldOverlayBars({ roles: ["enemy"], maxDistance: 12 })).toEqual({
      statId: "health", occlude: true,
      roles: ["enemy"],
      maxDistance: 12,
    });
    expect(resolveWorldOverlayBars({ statId: "armor", occlude: true })).toEqual({ statId: "armor", occlude: true });
  });

  test("showHealth is carried through only when set (nameplate name-only opt-out)", () => {
    expect(resolveWorldOverlayBars({ maxDistance: 40 })).toEqual({ statId: "health", occlude: true, maxDistance: 40 });
    expect(resolveWorldOverlayBars({ maxDistance: 40, showHealth: false })).toEqual({
      statId: "health", occlude: true,
      maxDistance: 40,
      showHealth: false,
    });
    expect(resolveWorldOverlayBars({ showHealth: true })).toEqual({ statId: "health", occlude: true, showHealth: true });
  });
  test("through-wall reveal remains explicit and display names survive normalization", () => {
    const resolveName = () => "Guard";
    expect(resolveWorldOverlayBars({ occlude: false, resolveName, maxSamples: 12, tickMs: 100 })).toEqual({ statId: "health", occlude: false, resolveName, maxSamples: 12, tickMs: 100 });
  });
});

describe("resolvePresentationEffects", () => {
  test("undefined and true enable every channel except opt-in tracers", () => {
    expect(resolvePresentationEffects(undefined)).toEqual({
      telegraphs: true,
      vfx: true,
      floatText: true,
      tracers: false,
      shake: true,
    });
    expect(resolvePresentationEffects(true)).toEqual(resolvePresentationEffects(undefined));
  });

  test("false disables every channel", () => {
    expect(resolvePresentationEffects(false)).toEqual({
      telegraphs: false,
      vfx: false,
      floatText: false,
      tracers: false,
      shake: false,
    });
  });

  test("tracers are opt-in: only an explicit tracers:true turns them on", () => {
    expect(resolvePresentationEffects({}).tracers).toBe(false);
    expect(resolvePresentationEffects({ tracers: true })).toEqual({
      telegraphs: true,
      vfx: true,
      floatText: true,
      tracers: true,
      shake: true,
    });
  });

  test("object form defaults other missing keys to on so one channel can be disabled", () => {
    expect(resolvePresentationEffects({ vfx: false })).toEqual({
      telegraphs: true,
      vfx: false,
      floatText: true,
      tracers: false,
      shake: true,
    });
  });

  test("object form can disable multiple channels while opting into tracers", () => {
    expect(resolvePresentationEffects({ vfx: false, shake: false, tracers: true })).toEqual({
      telegraphs: true,
      vfx: false,
      floatText: true,
      tracers: true,
      shake: false,
    });
  });
});

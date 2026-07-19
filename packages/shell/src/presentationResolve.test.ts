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
    expect(resolveWorldOverlayBars(true)).toEqual({ statId: "health" });
  });

  test("object form fills defaults and keeps explicit fields", () => {
    expect(resolveWorldOverlayBars({ roles: ["enemy"], maxDistance: 12 })).toEqual({
      statId: "health",
      roles: ["enemy"],
      maxDistance: 12,
    });
    expect(resolveWorldOverlayBars({ statId: "armor" })).toEqual({ statId: "armor" });
  });

  test("showHealth is carried through only when set (nameplate name-only opt-out)", () => {
    expect(resolveWorldOverlayBars({ maxDistance: 40 })).toEqual({ statId: "health", maxDistance: 40 });
    expect(resolveWorldOverlayBars({ maxDistance: 40, showHealth: false })).toEqual({
      statId: "health",
      maxDistance: 40,
      showHealth: false,
    });
    expect(resolveWorldOverlayBars({ showHealth: true })).toEqual({ statId: "health", showHealth: true });
  });
});

describe("resolvePresentationEffects", () => {
  test("undefined and true enable every combat channel", () => {
    expect(resolvePresentationEffects(undefined)).toEqual({
      telegraphs: true,
      vfx: true,
      floatText: true,
      tracers: true,
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

  test("object form defaults missing keys to on so one channel can be disabled", () => {
    expect(resolvePresentationEffects({ tracers: false })).toEqual({
      telegraphs: true,
      vfx: true,
      floatText: true,
      tracers: false,
      shake: true,
    });
  });

  test("object form can disable multiple channels", () => {
    expect(resolvePresentationEffects({ vfx: false, shake: false })).toEqual({
      telegraphs: true,
      vfx: false,
      floatText: true,
      tracers: true,
      shake: false,
    });
  });
});

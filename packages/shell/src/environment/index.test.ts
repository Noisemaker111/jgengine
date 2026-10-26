import { expect, test } from "bun:test";

import * as environment from "./index";
import { VolumetricClouds } from "../sky/VolumetricClouds";

test("the sky has one component; the old daylight variants are gone", () => {
  expect(typeof environment.Sky).toBe("function");
  expect(typeof environment.SkyDome).toBe("function");
  for (const removed of ["Daylight", "SkyDaylight", "StaticSkyDaylight", "TimeOfDayDaylight", "BiomeDaylight", "DrivenDaylight", "AuthoredDaylight", "DayNightSky"]) {
    expect(removed in environment).toBe(false);
  }
  expect(typeof VolumetricClouds).toBe("function");
});

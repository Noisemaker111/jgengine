import { expect, test } from "bun:test";
import { createAuthoredWeather } from "@jgengine/core/world/authoredWeather";
import { createWeatherUniformSet, updateWeatherUniformSet } from "./weatherUniforms";

test("authoritative weather shares sampled wind and time, freezes on pause and rewinds on restore", () => {
  const weather = createAuthoredWeather({ ambient: { mode: "rain", intensity: 0.5 }, wind: { direction: [0, 1], speed: 4 } });
  let time = 12;
  const options = { sample: (x: number, z: number) => weather.sample(x, z, time) };
  const uniforms = createWeatherUniformSet(options);
  updateWeatherUniformSet(uniforms, options, 0.1);
  expect(uniforms.time.value).toBe(12);
  expect(uniforms.wind.value.toArray()).toEqual([0, 0, 4]);
  expect(uniforms.rain.value).toBe(0.5);
  expect(uniforms.snow.value).toBe(0);
  updateWeatherUniformSet(uniforms, options, 3);
  expect(uniforms.time.value).toBe(12);
  time = 2;
  updateWeatherUniformSet(uniforms, options, 3);
  expect(uniforms.time.value).toBe(2);
});

test("absolute clock works for standalone fields and legacy render-time accumulation remains available", () => {
  const uniforms = createWeatherUniformSet();
  updateWeatherUniformSet(uniforms, { timeScale: 2, wind: [3, 0, 1] }, 0.5);
  expect(uniforms.time.value).toBe(1);
  expect(uniforms.controlsWind).toBe(true);
  updateWeatherUniformSet(uniforms, { timeSeconds: () => 5 }, 100);
  expect(uniforms.time.value).toBe(5);
  expect(uniforms.controlsWind).toBe(false);
});

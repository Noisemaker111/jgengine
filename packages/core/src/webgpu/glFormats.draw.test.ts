import { describe, expect, test } from "bun:test";
import { glTextureFormat, instancesThatFit, minFilter, textureBinding, topology, vertexFormat } from "./glFormats.draw";

describe("instancesThatFit", () => {
  // A mat4 instance matrix: 64 bytes per instance, read as four 16-byte columns.
  const matrixColumn = (column: number, instancesInBuffer: number) => ({ size: instancesInBuffer * 64, offset: column * 16, stride: 64, bytes: 16, divisor: 1 });

  test("a draw inside its buffers draws every instance", () => {
    expect(instancesThatFit(16, [0, 1, 2, 3].map((c) => matrixColumn(c, 16)))).toBe(16);
  });

  test("a draw asking past its instance buffer is clamped to what the buffer holds (Harbor Heat's 17-28 of 16)", () => {
    expect(instancesThatFit(28, [0, 1, 2, 3].map((c) => matrixColumn(c, 16)))).toBe(16);
    expect(instancesThatFit(60, [0, 1, 2, 3].map((c) => matrixColumn(c, 44)))).toBe(44);
  });

  test("the smallest attribute buffer decides, and a divisor stretches it", () => {
    const color = { size: 10 * 12, offset: 0, stride: 12, bytes: 12, divisor: 1 };
    expect(instancesThatFit(16, [matrixColumn(0, 16), color])).toBe(10);
    expect(instancesThatFit(16, [{ ...color, divisor: 2 }])).toBe(16);
  });

  test("an empty or too-short buffer draws nothing", () => {
    expect(instancesThatFit(5, [{ size: 8, offset: 0, stride: 16, bytes: 16, divisor: 1 }])).toBe(0);
  });
});

describe("GL enums to WebGPU", () => {
  test("unsized RGBA bytes are rgba8unorm; RGB is widened to four channels", () => {
    expect(glTextureFormat(0x1908, 0x1908, 0x1401)?.format).toBe("rgba8unorm");
    const rgb = glTextureFormat(0x1907, 0x1907, 0x1401);
    expect(rgb?.format).toBe("rgba8unorm");
    expect(rgb?.widen?.alpha).toBe(255);
    expect(glTextureFormat(0x1908, 0x1908, 0x140b)?.format).toBe("rgba16float");
  });

  test("float32 textures bind unfilterable without float32-filterable", () => {
    const rgba32f = glTextureFormat(0x8814)!;
    expect(textureBinding(rgba32f, false)).toBe("unfilterable");
    expect(textureBinding(rgba32f, true)).toBe("float");
  });

  test("mipmap filters say whether mips are sampled", () => {
    expect(minFilter(0x2703)).toEqual(["linear", "linear", true]);
    expect(minFilter(0x2601)).toEqual(["linear", "nearest", false]);
  });

  test("modes WebGPU cannot draw directly report null", () => {
    expect(topology(0x0004)).toBe("triangle-list");
    expect(topology(0x0006)).toBeNull();
    expect(topology(0x0002)).toBeNull();
  });

  test("a vertex type WebGPU cannot read as the shader wants is converted", () => {
    expect(vertexFormat(0x1406, 3, false, false, "f")).toBe("float32x3");
    expect(vertexFormat(0x1401, 4, true, false, "f")).toBe("unorm8x4");
  });
});

import { describe, expect, it } from "bun:test";
import * as THREE from "three";
import { decodeMeterByte, ExposureMeterPass } from "./autoExposure";

type Call = { target: THREE.WebGLRenderTarget | null };

function fakeRenderer(readback = 128) {
  const calls: { targets: Call[]; rendered: number; reads: number } = { targets: [], rendered: 0, reads: 0 };
  const renderer = {
    getRenderTarget: () => calls.targets.at(-1)?.target ?? null,
    setRenderTarget: (target: THREE.WebGLRenderTarget | null) => {
      calls.targets.push({ target });
    },
    readRenderTargetPixels: (_target: unknown, _x: number, _y: number, _w: number, _h: number, buffer: Uint8Array) => {
      calls.reads += 1;
      buffer.fill(readback);
    },
    render: () => {
      calls.rendered += 1;
    },
    clear: () => {},
  };
  return { renderer: renderer as unknown as THREE.WebGLRenderer, calls };
}

describe("decodeMeterByte", () => {
  it("spans 2^-16 to 2^8 luminance", () => {
    const out = new Float32Array(3);
    decodeMeterByte(0, out, 0);
    decodeMeterByte(255, out, 1);
    decodeMeterByte(128, out, 2);
    expect(out[0]).toBeCloseTo(Math.pow(2, -16), 8);
    expect(out[1]).toBeCloseTo(Math.pow(2, 8), 4);
    expect(out[2]).toBeCloseTo(Math.pow(2, (128 / 255) * 24 - 16), 6);
  });
});

describe("ExposureMeterPass", () => {
  it("meters on its cadence, reports the elapsed time, and passes the frame through", () => {
    const samples: Float32Array[] = [];
    const seconds: number[] = [];
    const pass = new ExposureMeterPass((frame, elapsed) => {
      samples.push(Float32Array.from(frame));
      seconds.push(elapsed);
    });
    const { renderer, calls } = fakeRenderer(200);
    const write = new THREE.WebGLRenderTarget(8, 8);
    const read = new THREE.WebGLRenderTarget(8, 8);
    for (let frame = 0; frame < 4; frame += 1) pass.render(renderer, write, read, 0.25);
    // The first four frames each take a sample so a load starts at its metered exposure.
    expect(calls.reads).toBe(4);
    expect(seconds).toEqual([0.25, 0.25, 0.25, 0.25]);
    expect(samples[0]?.length).toBe(256);
    // One reduction draw and one pass-through draw per frame.
    expect(calls.rendered).toBe(8);
    expect(pass.needsSwap).toBe(true);
    pass.dispose();
  });

  it("stops sampling once warmed up and never mutates the read buffer", () => {
    const samples: Float32Array[] = [];
    const pass = new ExposureMeterPass((frame) => samples.push(Float32Array.from(frame)), 1000);
    const { renderer, calls } = fakeRenderer(64);
    const write = new THREE.WebGLRenderTarget(4, 4);
    const read = new THREE.WebGLRenderTarget(4, 4);
    read.texture.name = "beauty";
    for (let frame = 0; frame < 12; frame += 1) pass.render(renderer, write, read, 1 / 60);
    expect(calls.reads).toBe(4);
    expect(samples).toHaveLength(4);
    expect(read.texture.name).toBe("beauty");
    pass.dispose();
  });
});

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

  it("reads real samples through a WebGL2 pack buffer, not zeros", () => {
    // A fake WebGL2 context with GL's rules: readPixels into a pack buffer smaller than the read
    // fails without writing, and getBufferSubData copies whatever the buffer stores.
    const PIXEL_PACK_BUFFER = 0x88eb;
    const buffers = new Map<object, Uint8Array>();
    let bound: object | null = null;
    const errors: string[] = [];
    const gl = {
      PIXEL_PACK_BUFFER,
      RGBA: 0x1908,
      UNSIGNED_BYTE: 0x1401,
      STREAM_READ: 0x88e1,
      SYNC_GPU_COMMANDS_COMPLETE: 0x9117,
      TIMEOUT_EXPIRED: 0x911b,
      WAIT_FAILED: 0x911d,
      createBuffer: () => { const buffer = {}; buffers.set(buffer, new Uint8Array(0)); return buffer; },
      bindBuffer: (_target: number, buffer: object | null) => { bound = buffer; },
      bufferData: (_target: number, size: number) => { if (bound !== null) buffers.set(bound, new Uint8Array(size)); },
      readPixels: (_x: number, _y: number, width: number, height: number) => {
        const store = bound === null ? undefined : buffers.get(bound);
        if (store === undefined || store.length < width * height * 4) { errors.push("buffer too small"); return; }
        store.fill(180);
      },
      fenceSync: () => ({}),
      clientWaitSync: () => 0x911a,
      deleteSync: () => {},
      getBufferSubData: (_target: number, _offset: number, out: Uint8Array) => { out.set((bound === null ? undefined : buffers.get(bound))?.subarray(0, out.length) ?? new Uint8Array(out.length)); },
      deleteBuffer: () => {},
    };
    const { renderer } = fakeRenderer();
    (renderer as unknown as { getContext: () => unknown }).getContext = () => gl;
    const samples: Float32Array[] = [];
    const pass = new ExposureMeterPass((frame) => samples.push(Float32Array.from(frame)));
    const write = new THREE.WebGLRenderTarget(4, 4);
    const read = new THREE.WebGLRenderTarget(4, 4);
    for (let frame = 0; frame < 3; frame += 1) pass.render(renderer, write, read, 1 / 60);
    expect(errors).toEqual([]);
    expect(samples.length).toBeGreaterThan(0);
    expect(samples[0]![0]).toBeCloseTo(Math.pow(2, (180 / 255) * 24 - 16), 6);
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

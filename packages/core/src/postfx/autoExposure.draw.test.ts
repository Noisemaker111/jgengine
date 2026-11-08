import { describe, expect, it } from "bun:test";
import * as THREE from "three";
import { decodeMeterByte, DRAIN_WAIT_FRAMES, ExposureMeterPass } from "./autoExposure.draw";

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
    // One reduction draw per sampled frame; the frame itself stays where it is, with no copy.
    expect(calls.rendered).toBe(4);
    expect(pass.needsSwap).toBe(false);
    pass.dispose();
  });

  it("draws nothing on the frames between samples", () => {
    const pass = new ExposureMeterPass(() => {}, 8);
    const { renderer, calls } = fakeRenderer(200);
    const write = new THREE.WebGLRenderTarget(8, 8);
    const read = new THREE.WebGLRenderTarget(8, 8);
    for (let frame = 0; frame < 16; frame += 1) pass.render(renderer, write, read, 1 / 60);
    // Frames 1-4 warm up, then frames 8 and 16 sample: a reduction per readback and no other draw.
    expect(calls.reads).toBe(6);
    expect(calls.rendered).toBe(6);
    pass.dispose();
  });

  it("a dry run draws the reduction but neither meters nor reads back", () => {
    const samples: Float32Array[] = [];
    const pass = new ExposureMeterPass((frame) => samples.push(Float32Array.from(frame)));
    const { renderer, calls } = fakeRenderer(200);
    const write = new THREE.WebGLRenderTarget(8, 8);
    const read = new THREE.WebGLRenderTarget(8, 8);
    pass.dry = true;
    pass.render(renderer, write, read, 0.25);
    expect(calls.rendered).toBe(1);
    expect(calls.reads).toBe(0);
    expect(samples).toEqual([]);
    pass.dry = false;
    pass.render(renderer, write, read, 0.25);
    // The first real frame still meters, and counts only its own time.
    expect(calls.reads).toBe(1);
    pass.dispose();
  });

  /**
   * A fake WebGL2 context with GL's rules: readPixels into a pack buffer smaller than the read fails
   * without writing, getBufferSubData copies whatever the buffer stores, and a fence reports done
   * only once `finish` says the GPU has worked through everything queued before it.
   */
  function fakeGl() {
    const buffers = new Map<object, Uint8Array>();
    const fences = new Map<object, boolean>();
    let bound: object | null = null;
    const errors: string[] = [];
    const gl = {
      PIXEL_PACK_BUFFER: 0x88eb,
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
      fenceSync: () => { const fence = {}; fences.set(fence, false); return fence; },
      clientWaitSync: (fence: object) => (fences.get(fence) === true ? 0x911a : 0x911b),
      deleteSync: (fence: object) => { fences.delete(fence); },
      getBufferSubData: (_target: number, _offset: number, out: Uint8Array) => { out.set((bound === null ? undefined : buffers.get(bound))?.subarray(0, out.length) ?? new Uint8Array(out.length)); },
      deleteBuffer: (buffer: object) => { buffers.delete(buffer); },
    };
    const finish = () => { for (const fence of fences.keys()) fences.set(fence, true); };
    const { renderer } = fakeRenderer();
    (renderer as unknown as { getContext: () => unknown }).getContext = () => gl;
    return { gl, renderer, errors, buffers, fences, finish };
  }

  it("reads real samples through a WebGL2 pack buffer, not zeros, at the start of a frame", () => {
    const { gl, renderer, errors, buffers, fences, finish } = fakeGl();
    const samples: Float32Array[] = [];
    const pass = new ExposureMeterPass((frame) => samples.push(Float32Array.from(frame)));
    const write = new THREE.WebGLRenderTarget(4, 4);
    const read = new THREE.WebGLRenderTarget(4, 4);
    const fetched: string[] = [];
    const getBufferSubData = gl.getBufferSubData;
    gl.getBufferSubData = (target, offset, out) => {
      fetched.push(phase);
      getBufferSubData(target, offset, out);
    };
    let phase = "after the scene";
    // Drawing alone never reads back, however many frames pass.
    for (let frame = 0; frame < 3; frame += 1) pass.render(renderer, write, read, 1 / 60);
    expect(fetched).toEqual([]);
    for (let frame = 0; frame < 4; frame += 1) {
      finish();
      phase = "frame start";
      pass.collect();
      phase = "after the scene";
      pass.render(renderer, write, read, 1 / 60);
      pass.frameEnd();
    }
    expect(errors).toEqual([]);
    expect(samples.length).toBeGreaterThan(0);
    expect(samples[0]![0]).toBeCloseTo(Math.pow(2, (180 / 255) * 24 - 16), 6);
    // Reading back after the scene would make the CPU wait for the whole scene to finish drawing.
    expect(fetched.length).toBeGreaterThan(0);
    expect(fetched.every((at) => at === "frame start")).toBe(true);
    pass.dispose();
    expect(buffers.size).toBe(0);
    expect(fences.size).toBe(0);
  });

  it("reads back only once the GPU has caught up with the last frame, or after waiting too long", () => {
    const { renderer, fences, finish } = fakeGl();
    const samples: Float32Array[] = [];
    const pass = new ExposureMeterPass((frame) => samples.push(Float32Array.from(frame)), 1000);
    const write = new THREE.WebGLRenderTarget(4, 4);
    const read = new THREE.WebGLRenderTarget(4, 4);
    pass.render(renderer, write, read, 1 / 60);
    pass.frameEnd();
    // The readback itself is done, but the GPU is still a frame behind: a read now would wait for that frame.
    finish();
    pass.render(renderer, write, read, 1 / 60);
    pass.frameEnd();
    for (let frame = 0; frame < 5; frame += 1) {
      pass.collect();
      pass.render(renderer, write, read, 1 / 60);
      pass.frameEnd();
    }
    expect(samples).toHaveLength(0);
    // The GPU catches up: the next frame start reads.
    finish();
    pass.collect();
    expect(samples).toHaveLength(1);
    // A GPU that never catches up still gets read, after DRAIN_WAIT_FRAMES frames.
    pass.render(renderer, write, read, 1 / 60);
    pass.frameEnd();
    let frames = 0;
    for (; samples.length === 1 && frames < 200; frames += 1) {
      if (frames === 0) { const [readback] = fences.keys(); if (readback !== undefined) fences.set(readback, true); }
      pass.collect();
      pass.render(renderer, write, read, 1 / 60);
      pass.frameEnd();
    }
    expect(samples).toHaveLength(2);
    expect(frames).toBe(DRAIN_WAIT_FRAMES + 1);
    pass.dispose();
    expect(fences.size).toBe(0);
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

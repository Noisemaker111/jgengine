import { describe, expect, test } from "bun:test";

import { installUniformUploads, patchUniformUploads, pooledUniformData } from "./uniformUpload.draw";

describe("pooledUniformData", () => {
  test("converts a plain array into a pooled Float32Array", () => {
    const data = pooledUniformData([1.5, -2.25, 3], Float32Array);
    expect(data).toBeInstanceOf(Float32Array);
    expect([...(data as Float32Array)]).toEqual([1.5, -2.25, 3]);
  });

  test("reuses the same buffer for the same length", () => {
    const first = pooledUniformData([1, 2, 3], Float32Array);
    const second = pooledUniformData([4, 5, 6], Float32Array);
    expect(second).toBe(first);
    expect([...(second as Float32Array)]).toEqual([4, 5, 6]);
  });

  test("keeps distinct lengths in distinct buffers", () => {
    const three = pooledUniformData([1, 2, 3], Float32Array);
    const sixteen = pooledUniformData(new Array(16).fill(0), Float32Array);
    expect(three).not.toBe(sixteen);
    expect((sixteen as Float32Array).length).toBe(16);
  });

  test("passes a matching typed array through untouched", () => {
    const f32 = new Float32Array([1, 2, 3]);
    expect(pooledUniformData(f32, Float32Array)).toBeUndefined();
    const i32 = new Int32Array([1, 2, 3]);
    expect(pooledUniformData(i32, Int32Array)).toBeUndefined();
  });

  test("converts a foreign typed array the way the sequence binding did", () => {
    const data = pooledUniformData(new Float64Array([1.5, 2.5]), Float32Array);
    expect(data).toBeInstanceOf(Float32Array);
    expect([...(data as Float32Array)]).toEqual([1.5, 2.5]);
  });

  test("converts int uploads to the int pool", () => {
    const data = pooledUniformData([7, 8], Int32Array);
    expect(data).toBeInstanceOf(Int32Array);
    const unsigned = pooledUniformData([7, 8], Uint32Array);
    expect(unsigned).toBeInstanceOf(Uint32Array);
  });

  test("treats missing elements as NaN like ToNumber(undefined)", () => {
    const sparse: number[] = [];
    sparse.length = 3;
    const data = pooledUniformData(sparse, Float32Array) as Float32Array;
    expect(data[0]).toBeNaN();
  });

  test("leaves non-array values on the native error path", () => {
    expect(pooledUniformData(undefined, Float32Array)).toBeUndefined();
    expect(pooledUniformData(null, Float32Array)).toBeUndefined();
    expect(pooledUniformData("abc", Float32Array)).toBeUndefined();
    expect(pooledUniformData(42, Float32Array)).toBeUndefined();
    expect(pooledUniformData(new DataView(new ArrayBuffer(8)), Float32Array)).toBeUndefined();
  });
});

describe("patchUniformUploads", () => {
  function fakeProto() {
    const calls: { name: string; thisValue: unknown; args: unknown[] }[] = [];
    const proto: Record<string, unknown> = {};
    for (const name of ["uniform3fv", "uniformMatrix4fv", "uniform1iv", "uniform2uiv"]) {
      proto[name] = function (this: unknown, ...args: unknown[]) {
        calls.push({ name, thisValue: this, args });
      };
    }
    return { proto, calls };
  }

  test("replaces the last argument with the pooled buffer", () => {
    const { proto, calls } = fakeProto();
    patchUniformUploads(proto);
    const ctx = {};
    (proto.uniform3fv as (...a: unknown[]) => void).call(ctx, "loc", [1, 2, 3]);
    expect(calls[0]?.args[0]).toBe("loc");
    expect(calls[0]?.args[1]).toBeInstanceOf(Float32Array);
    expect(calls[0]?.thisValue).toBe(ctx);
  });

  test("keeps the transpose argument on matrix uploads", () => {
    const { proto, calls } = fakeProto();
    patchUniformUploads(proto);
    const flat = new Array(16).fill(1);
    (proto.uniformMatrix4fv as (...a: unknown[]) => void).call({}, "loc", false, flat);
    expect(calls[0]?.args).toHaveLength(3);
    expect(calls[0]?.args[1]).toBe(false);
    expect(calls[0]?.args[2]).toBeInstanceOf(Float32Array);
  });

  test("passes a typed array through without copying", () => {
    const { proto, calls } = fakeProto();
    patchUniformUploads(proto);
    const data = new Float32Array([1, 2, 3]);
    (proto.uniform3fv as (...a: unknown[]) => void).call({}, "loc", data);
    expect(calls[0]?.args[1]).toBe(data);
  });

  test("routes int and unsigned uploads to their own pools", () => {
    const { proto, calls } = fakeProto();
    patchUniformUploads(proto);
    (proto.uniform1iv as (...a: unknown[]) => void).call({}, "loc", [1, 2]);
    (proto.uniform2uiv as (...a: unknown[]) => void).call({}, "loc", [3, 4]);
    expect(calls[0]?.args[1]).toBeInstanceOf(Int32Array);
    expect(calls[1]?.args[1]).toBeInstanceOf(Uint32Array);
  });

  test("is idempotent per prototype", () => {
    const { proto, calls } = fakeProto();
    patchUniformUploads(proto);
    patchUniformUploads(proto);
    (proto.uniform3fv as (...a: unknown[]) => void).call({}, "loc", [1, 2, 3]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args[1]).toBeInstanceOf(Float32Array);
  });
});

describe("installUniformUploads", () => {
  test("is a no-op without a WebGL2 implementation", () => {
    expect(() => installUniformUploads()).not.toThrow();
  });
});

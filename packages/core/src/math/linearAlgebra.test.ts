import { describe, expect, test } from "bun:test";
import { matrixEigenvalues, solveLinearSystem } from "./linearAlgebra";

describe("matrixEigenvalues", () => {
  test("a rotation generator has a conjugate pair at ±i", () => {
    const roots = matrixEigenvalues([0, -2, 2, 0], 2);
    expect(roots).toHaveLength(2);
    expect(roots[0]?.re).toBeCloseTo(0, 12);
    expect(roots[0]?.im).toBeCloseTo(2, 12);
    expect(roots[1]?.im).toBeCloseTo(-2, 12);
  });

  test("a triangular matrix returns its diagonal, sorted by real part", () => {
    const roots = matrixEigenvalues([1, 5, 0, 3], 2);
    expect(roots.map((root) => root.re)).toEqual([3, 1]);
    expect(roots.every((root) => root.im === 0)).toBe(true);
  });

  test("the input is not modified", () => {
    const input = [0, -2, 2, 0];
    matrixEigenvalues(input, 2);
    expect(input).toEqual([0, -2, 2, 0]);
  });

  test("an empty matrix has no eigenvalues", () => {
    expect(matrixEigenvalues([], 0)).toEqual([]);
  });
});

describe("solveLinearSystem", () => {
  test("solves a small system with pivoting and writes the answer into b", () => {
    // [0 2; 1 1] x = [4; 3] has x = [1, 2]: the zero leading entry forces a row swap.
    const m = Float64Array.from([0, 2, 1, 1]);
    const b = Float64Array.from([4, 3]);
    solveLinearSystem(m, b, 2);
    expect(b[0]).toBeCloseTo(1, 12);
    expect(b[1]).toBeCloseTo(2, 12);
  });

  test("a singular pivot leaves that unknown at zero", () => {
    const m = Float64Array.from([0, 0, 0, 2]);
    const b = Float64Array.from([0, 4]);
    solveLinearSystem(m, b, 2);
    expect(b[0]).toBe(0);
    expect(b[1]).toBeCloseTo(2, 12);
  });
});

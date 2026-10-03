import { expect, test } from "bun:test";
import { buildHairCards, HAIR_CARD_STRAND_ROTATION, validateHairCardAuthoring } from "./hairCards";
import type { HairCardAuthoring } from "./hairCards";

const authoring = (): HairCardAuthoring => ({ guides: [{ id: "fringe", points: [[0, 0, 0], [0, 1, 0], [0.2, 2, 0]], width: 0.2, tipWidth: 0.02, facing: [0, 0, 1] }] });

test("guide mesh deterministically preserves serialized authored data and tapered bounds", () => {
  const input = authoring();
  const source = JSON.stringify(input);
  const mesh = buildHairCards(input);
  expect(buildHairCards(JSON.parse(source))).toEqual(mesh);
  expect(JSON.stringify(input)).toBe(source);
  expect(mesh.positions.length).toBe(18);
  expect(mesh.indices).toEqual([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4]);
  expect(mesh.bounds.min[0]).toBe(-0.1);
  expect(mesh.bounds.max[1]).toBeGreaterThanOrEqual(2);
  expect(mesh.guides).toEqual([{ id: "fringe", vertexStart: 0, vertexCount: 6, indexStart: 0, indexCount: 12 }]);
});

test("the tangent frame maps U across width and V along the strand", () => {
  const mesh = buildHairCards({ guides: [{ id: "straight", points: [[0, 0, 0], [0, 1, 0]], width: 0.2, facing: [0, 0, 1], uvRect: [0.25, 0.1, 0.5, 0.9] }] });
  expect(mesh.normals.slice(0, 3)).toEqual([0, 0, 1]);
  expect(mesh.tangents.slice(0, 4)).toEqual([1, 0, 0, 1]);
  expect(mesh.uvs).toEqual([0.25, 0.1, 0.5, 0.1, 0.25, 0.9, 0.5, 0.9]);
  expect(HAIR_CARD_STRAND_ROTATION).toBe(Math.PI / 2);
});

test("subdivision and multiple guide ranges preserve normalized orthogonal frames", () => {
  const input = authoring();
  input.subdivisionsPerSegment = 3;
  input.guides = [...input.guides, { ...input.guides[0], id: "side", facing: [0, 0, -1] }];
  const mesh = buildHairCards(input);
  expect(mesh.guides[1].vertexStart).toBe(14);
  expect(mesh.positions.length / 3).toBe(28);
  expect(mesh.indices.length).toBe(72);
  for (let index = 0; index < mesh.positions.length / 3; index++) {
    const normal = mesh.normals.slice(index * 3, index * 3 + 3);
    const tangent = mesh.tangents.slice(index * 4, index * 4 + 3);
    expect(Math.hypot(...normal)).toBeCloseTo(1);
    expect(Math.hypot(...tangent)).toBeCloseTo(1);
    expect(normal.reduce((sum, item, axis) => sum + item * tangent[axis], 0)).toBeCloseTo(0);
  }
});

test("geometry prerequisites and allocation budgets fail with guide paths", () => {
  const input = authoring();
  expect(() => buildHairCards({ ...input, maxVertices: 4 })).toThrow("above the 4 ceiling");
  expect(validateHairCardAuthoring({ ...input, subdivisionsPerSegment: 0 })[0].path).toBe("subdivisionsPerSegment");
  expect(() => buildHairCards({ guides: [{ ...input.guides[0], facing: [0, 1, 0] }] })).toThrow("parallel");
  expect(() => buildHairCards({ guides: [{ ...input.guides[0], points: [[0, 0, 0], [0, 0, 0]] }] })).toThrow("distinct");
  expect(() => buildHairCards({ guides: [{ ...input.guides[0], points: [[0, 0, 0], [0, 1, 0], [0, 0, 0]] }] })).toThrow("reversing");
  expect(validateHairCardAuthoring({ ...input, collision: true })[0].path).toBe("collision");
});

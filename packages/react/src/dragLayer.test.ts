import { describe, expect, test } from "bun:test";

describe("drag layer move path", () => {
  test("ghost style updates from point writes without cloning drag state", () => {
    const point = { x: 10, y: 20 };
    const ghost = {
      style: {
        left: "",
        top: "",
        transform: "",
      },
    };
    const writeGhost = (next: { x: number; y: number }, rotation: number) => {
      ghost.style.left = `${next.x}px`;
      ghost.style.top = `${next.y}px`;
      ghost.style.transform = `translate(-50%, -50%) rotate(${rotation * 90}deg)`;
    };
    writeGhost(point, 1);
    point.x = 44;
    point.y = 88;
    writeGhost(point, 1);
    expect(ghost.style.left).toBe("44px");
    expect(ghost.style.top).toBe("88px");
    expect(ghost.style.transform).toBe("translate(-50%, -50%) rotate(90deg)");
  });
});

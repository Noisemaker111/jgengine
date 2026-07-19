import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  EntityFrames,
  layoutEntityFrames,
  type EntityFrameEntry,
  type EntityScreenProjection,
  type ProjectEntity,
} from "./entityFrames";
import { HealthBar } from "./bars";

interface Enemy extends EntityFrameEntry {
  name: string;
  hp: number;
  maxHp: number;
}

const enemies: readonly Enemy[] = [
  { id: "near", worldPosition: [0, 2, 1], name: "Wolf", hp: 30, maxHp: 60 },
  { id: "far", worldPosition: [0, 2, 50], name: "Bear", hp: 90, maxHp: 100 },
  { id: "offscreen", worldPosition: [999, 2, 1], name: "Ghost", hp: 10, maxHp: 10 },
  { id: "behind", worldPosition: [0, 2, -1], name: "Shade", hp: 5, maxHp: 5 },
];

// A stub projector: maps the test entities to deterministic screen points.
const project: ProjectEntity = (world): EntityScreenProjection | null => {
  const [x, , z] = world;
  if (z < 0) return { x: 400, y: 300, depth: 0.9, behind: true }; // behind camera
  if (x > 500) return { x: 5000, y: 300, depth: 0.1 }; // off-screen far right
  // depth grows with distance (z) so "far" sorts before "near"
  return { x: 400, y: 300, depth: z / 100 };
};

describe("layoutEntityFrames", () => {
  test("culls behind-camera and off-screen entries, keeps on-screen ones", () => {
    const placements = layoutEntityFrames(enemies, project, {
      viewport: { width: 800, height: 600 },
    });
    const ids = placements.map((p) => p.entry.id);
    expect(ids).not.toContain("behind"); // behind:true dropped
    expect(ids).not.toContain("offscreen"); // outside viewport + margin dropped
    expect(ids.sort()).toEqual(["far", "near"]);
  });

  test("returns null-projected entries culled", () => {
    const nullProject: ProjectEntity = () => null;
    expect(layoutEntityFrames(enemies, nullProject)).toHaveLength(0);
  });

  test("applies screen offsets to projected coords", () => {
    const [only] = layoutEntityFrames([enemies[0]], project, { offsetX: 10, offsetY: -20 });
    expect(only.x).toBe(410);
    expect(only.y).toBe(280);
  });

  test("stacks farthest first so nearer frames render last (on top)", () => {
    const placements = layoutEntityFrames(enemies, project, {
      viewport: { width: 800, height: 600 },
    });
    // far (depth 0.5) before near (depth 0.01)
    expect(placements.map((p) => p.entry.id)).toEqual(["far", "near"]);
    expect(placements[0].depth).toBeGreaterThan(placements[1].depth);
  });

  test("stacking order is stable for equal depths via id", () => {
    const tied: readonly EntityFrameEntry[] = [
      { id: "c", worldPosition: [0, 0, 1] },
      { id: "a", worldPosition: [0, 0, 1] },
      { id: "b", worldPosition: [0, 0, 1] },
    ];
    const flat: ProjectEntity = () => ({ x: 1, y: 1, depth: 0.5 });
    expect(layoutEntityFrames(tied, flat).map((p) => p.entry.id)).toEqual(["a", "b", "c"]);
  });

  test("maxCount keeps the nearest frames", () => {
    const placements = layoutEntityFrames(enemies, project, {
      viewport: { width: 800, height: 600 },
      maxCount: 1,
    });
    // Only the nearest survives the cap.
    expect(placements.map((p) => p.entry.id)).toEqual(["near"]);
  });

  test("defaults depth to 0 when the projection omits it", () => {
    const noDepth: ProjectEntity = () => ({ x: 1, y: 1 });
    expect(layoutEntityFrames([enemies[0]], noDepth)[0].depth).toBe(0);
  });
});

describe("EntityFrames component", () => {
  test("renders caller-composed frames using the shipped HealthBar primitive", () => {
    const html = renderToStaticMarkup(
      createElement(EntityFrames<Enemy>, {
        entries: enemies,
        project,
        viewport: { width: 800, height: 600 },
        renderFrame: (enemy) =>
          createElement(
            "div",
            null,
            createElement("span", { "data-name": "" }, enemy.name),
            createElement(HealthBar, { value: enemy.hp, max: enemy.maxHp, width: 78, showValue: false }),
          ),
      }),
    );
    expect(html).toContain("data-entity-frames");
    expect(html).toContain('data-entity-frame="near"');
    expect(html).toContain('data-entity-frame="far"');
    expect(html).not.toContain('data-entity-frame="behind"');
    expect(html).not.toContain('data-entity-frame="offscreen"');
    // The shipped bar renders inside the frame.
    expect(html).toContain('data-bar="health"');
    // Nearest ("near") is last in DOM → highest z-index, painting over "far".
    expect(html.indexOf('data-entity-frame="far"')).toBeLessThan(html.indexOf('data-entity-frame="near"'));
  });

  test("honors a custom anchorTransform", () => {
    const html = renderToStaticMarkup(
      createElement(EntityFrames<Enemy>, {
        entries: [enemies[0]],
        project,
        anchorTransform: "translate(-50%, 0)",
        renderFrame: (enemy) => enemy.name,
      }),
    );
    expect(html).toContain("translate(-50%, 0)");
  });
});

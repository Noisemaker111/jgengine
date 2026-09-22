// `create --2d`: a board game with no 3D scene. The board is plain store data drawn by GameUI.

/** Default board size in cells for `create --2d`; the game's `world.ts` owns it afterward. */
export const BOARD_SIZE = { x: 10, y: 20 } as const;

/** `src/world.ts` for a 2D board game. */
export const boardWorldTs = (id: string) => `import { world as place } from "@jgengine/core/world/place";

/** Board size in cells — the one law of this place. */
export const BOARD_SIZE = { x: ${BOARD_SIZE.x}, y: ${BOARD_SIZE.y} } as const;

// A 2D surface you look at: no 3D scene renders, GameUI draws the board.
export const world = place({
  id: "${id}",
  ground: { mode: "board", size: BOARD_SIZE },
});
`;

/** `src/game.config.ts` for a 2D board game. */
export const boardGameConfigTs = (name: string) => `import { defineGame } from "@jgengine/shell/gameKit";

import { GameUI } from "./game/ui/GameUI";
import { systems } from "./loop";
import { world } from "./world";

export const game = defineGame({
  name: ${JSON.stringify(name)},
  simulation: { hz: 60 },
  world,
  // No 3D canvas: the whole screen is GameUI.
  presentation: "hud",
  // Each action runs the command of the same name (see loop.ts); repeatMs re-fires while held.
  input: {
    left: { hold: ["ArrowLeft", "KeyA"], repeatMs: 180 },
    right: { hold: ["ArrowRight", "KeyD"], repeatMs: 180 },
    up: { hold: ["ArrowUp", "KeyW"], repeatMs: 180 },
    down: { hold: ["ArrowDown", "KeyS"], repeatMs: 180 },
    place: ["Space", "Enter"],
  },
  systems,
  GameUI,
});
`;

/** `src/loop.ts` for a 2D board game: one store slot, one command per input action. */
export const boardLoopTs = `import { defineStore, defineSystem } from "@jgengine/shell/gameKit";

import { createBoard, moveCursor, toggleCell, type BoardState } from "./game/board";
import { BOARD_SIZE } from "./world";

export const board = defineStore<BoardState>("board", () => createBoard(BOARD_SIZE.x, BOARD_SIZE.y));

const MOVES: Record<string, readonly [number, number]> = {
  left: [-1, 0],
  right: [1, 0],
  up: [0, -1],
  down: [0, 1],
};

/** Your game rules live here — replace the cursor and toggle with your own moves. */
export const systems = [
  defineSystem({
    id: "board",
    create(ctx) {
      for (const [name, [dx, dy]] of Object.entries(MOVES)) {
        ctx.game.commands.define(name, {
          apply(state) {
            board.update(state, (current) => moveCursor(current, dx, dy));
          },
        });
      }
      ctx.game.commands.define("place", {
        apply(state) {
          board.update(state, (current) => toggleCell(current));
        },
      });
    },
  }),
];
`;

/** `src/game/board.ts`: pure board rules over the engine's immutable cell grid. */
export const boardRulesTs = `import { cellAt, createCellGrid, withCell, type CellGrid } from "@jgengine/core/puzzle/cellGrid";

/** Run state for the board: plain data, so saves, replays, and sync carry it as-is. */
export interface BoardState {
  grid: CellGrid<string>;
  cursor: { x: number; y: number };
}

export function createBoard(width: number, height: number): BoardState {
  return { grid: createCellGrid<string>(width, height), cursor: { x: Math.floor(width / 2), y: Math.floor(height / 2) } };
}

export function moveCursor(state: BoardState, dx: number, dy: number): BoardState {
  const x = Math.min(state.grid.width - 1, Math.max(0, state.cursor.x + dx));
  const y = Math.min(state.grid.height - 1, Math.max(0, state.cursor.y + dy));
  return { ...state, cursor: { x, y } };
}

export function toggleCell(state: BoardState, value = "filled"): BoardState {
  const { x, y } = state.cursor;
  return { ...state, grid: withCell(state.grid, x, y, cellAt(state.grid, x, y) === null ? value : null) };
}
`;

/** `src/game/board.test.ts`. */
export const boardRulesTest = `import { describe, expect, test } from "bun:test";
import { cellAt } from "@jgengine/core/puzzle/cellGrid";

import { createBoard, moveCursor, toggleCell } from "./board";

describe("board rules", () => {
  test("the cursor moves and stops at the edges", () => {
    const board = createBoard(4, 3);
    expect(moveCursor(board, 1, 0).cursor).toEqual({ x: 3, y: 1 });
    expect(moveCursor(moveCursor(board, 5, 0), 1, 0).cursor.x).toBe(3);
    expect(moveCursor(board, 0, -9).cursor.y).toBe(0);
  });

  test("placing toggles the cell under the cursor", () => {
    const placed = toggleCell(createBoard(4, 3));
    expect(cellAt(placed.grid, 2, 1)).toBe("filled");
    expect(cellAt(toggleCell(placed).grid, 2, 1)).toBeNull();
  });
});
`;

/** `src/game/ui/GameUI.tsx` for a 2D board game. */
export const boardGameUiTsx = (name: string) => `import { useStore } from "@jgengine/react/store";

import { board } from "../../loop";

// ${name} draws its own face. This board is a readable starting point, not a look:
// restyle it from src/art-direction.md and compose jgengine-ui blocks for score, menus, and settings.

/** @internal */
export function GameUI() {
  const { grid, cursor } = useStore(board);
  return (
    <main className="flex h-full w-full flex-col items-center justify-center gap-4 bg-slate-950 p-6 font-sans text-slate-100">
      <div
        className="grid gap-px rounded-md bg-slate-800 p-px shadow-2xl"
        style={{
          gridTemplateColumns: \`repeat(\${grid.width}, minmax(0, 1fr))\`,
          height: "min(80vh, 160vw)",
          aspectRatio: \`\${grid.width} / \${grid.height}\`,
        }}
      >
        {grid.cells.map((cell, index) => {
          const here = index === cursor.y * grid.width + cursor.x;
          return (
            <div
              key={index}
              data-cell={cell ?? "empty"}
              className={\`\${cell === null ? "bg-slate-900" : "bg-sky-400"} \${here ? "outline outline-2 -outline-offset-2 outline-amber-300" : ""}\`}
            />
          );
        })}
      </div>
      <p className="text-sm text-slate-400">Arrows or WASD move · Space places</p>
    </main>
  );
}
`;

import { createRecordBook, type RecordBook, type RecordDirection, type RecordStorage } from "@jgengine/core/game/recordBook";

import { LEVELS } from "./levels";

type Field = `${string}_m` | `${string}_p`;

function movesField(id: string): Field {
  return `${id}_m`;
}
function pushesField(id: string): Field {
  return `${id}_p`;
}

const FIELDS: Record<Field, RecordDirection> = (() => {
  const out: Record<string, RecordDirection> = {};
  for (const level of LEVELS) {
    out[movesField(level.id)] = "lower";
    out[pushesField(level.id)] = "lower";
  }
  return out;
})();

export type LevelRecord = {
  readonly bestMoves: number | null;
  readonly bestPushes: number | null;
  readonly completed: boolean;
};

export type KeeperRecords = {
  recordFor(id: string): LevelRecord;
  submit(id: string, moves: number, pushes: number): { improvedMoves: boolean; improvedPushes: boolean };
};

export function createKeeperRecords(storage: RecordStorage | null): KeeperRecords {
  const book: RecordBook<Field> = createRecordBook({ key: "crate-keeper", fields: FIELDS, storage });

  function recordFor(id: string): LevelRecord {
    const bestMoves = book.bestOf(movesField(id));
    const bestPushes = book.bestOf(pushesField(id));
    return { bestMoves, bestPushes, completed: bestMoves !== null };
  }

  function submit(id: string, moves: number, pushes: number): { improvedMoves: boolean; improvedPushes: boolean } {
    const result = book.submit({ [movesField(id)]: moves, [pushesField(id)]: pushes });
    return {
      improvedMoves: result.improved.includes(movesField(id)),
      improvedPushes: result.improved.includes(pushesField(id)),
    };
  }

  return { recordFor, submit };
}

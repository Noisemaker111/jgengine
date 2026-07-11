import { createRecordBook } from "@jgengine/core/game/recordBook";
import type { RecordBook, RecordStorage } from "@jgengine/core/game/recordBook";

import { START_BANK } from "./machine";
import type { RecordsSnapshot } from "./machine";

function safeStorage(): RecordStorage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

const bankCell: RecordBook<"balance"> = createRecordBook({
  key: "blackjack-bank",
  fields: { balance: "higher" },
  storage: safeStorage(),
});

const records: RecordBook<"peakBank" | "bestStreak" | "handsWon"> = createRecordBook({
  key: "blackjack-records",
  fields: { peakBank: "higher", bestStreak: "higher", handsWon: "higher" },
  storage: safeStorage(),
});

export function loadBank(): number {
  return bankCell.bestOf("balance") ?? START_BANK;
}

export function saveBank(balance: number): void {
  bankCell.clear();
  bankCell.submit({ balance });
}

export function loadRecords(): RecordsSnapshot {
  const best = records.best();
  return {
    peakBank: best.peakBank ?? loadBank(),
    bestStreak: best.bestStreak ?? 0,
    handsWon: best.handsWon ?? 0,
  };
}

export function saveRecords(snapshot: RecordsSnapshot): void {
  records.submit({
    peakBank: snapshot.peakBank,
    bestStreak: snapshot.bestStreak,
    handsWon: snapshot.handsWon,
  });
}

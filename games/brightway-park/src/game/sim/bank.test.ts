import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { game } from "../../game.config";
import { MONTH_DAYS } from "../books";
import { LOAN, park } from "../park";
import { resetPark } from "../parkReset";
import { applySave, decodeSave, snapshotPark } from "../persistence";
import { parkLoanBook } from "./bank";
import { closeDay } from "./economy";

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
beforeEach(() => {
  const records = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => records.set(key, value),
    removeItem: (key: string) => records.delete(key),
  } });
});
afterEach(() => {
  if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
});

function openPark() {
  const runner = createHeadlessRunner({ game, maxStepSeconds: 1 });
  resetPark(runner.ctx, { layout: "starter", guests: 0 });
  runner.ui.invoke("park.start");
  return { runner, w: park.of(runner.ctx) };
}

const act = (runner: ReturnType<typeof openPark>["runner"], action: string) => runner.ctx.game.commands.run("brightway.act", { action }).status;

function closeMonth(runner: ReturnType<typeof openPark>["runner"]): void {
  const w = park.of(runner.ctx);
  const end = (Math.floor((w.num("park.day") - 1) / MONTH_DAYS) + 1) * MONTH_DAYS;
  while (w.num("park.day") <= end) closeDay(runner.ctx);
}

describe("the park loan on the shared loan book", () => {
  test("the park's line is the book's: draws and repayments move it, and each month's close charges its interest", () => {
    const { runner, w } = openPark();
    const book = parkLoanBook(runner.ctx);
    expect(book.loan("bank")).toMatchObject({ outstanding: LOAN.start, limit: LOAN.max, paid: 0, ratePerPeriod: LOAN.monthlyRate });

    expect(act(runner, "take_loan")).toBe("applied");
    expect(book.outstanding("bank")).toBe(LOAN.start + LOAN.step);
    expect(w.num("park.loan_owed")).toBe(book.outstanding("bank"));
    expect(book.nextPayment("bank")).toMatchObject({ index: 1, interest: Math.round((LOAN.start + LOAN.step) * LOAN.monthlyRate) });

    closeMonth(runner);
    const first = Math.round((LOAN.start + LOAN.step) * LOAN.monthlyRate);
    expect(book.loan("bank")).toMatchObject({ paid: 1, interestPaid: first });
    expect(w.num("park.interest_paid")).toBe(first);
    expect(w.num("report.interest")).toBe(first);

    expect(act(runner, "repay_loan")).toBe("applied");
    expect(act(runner, "repay_loan")).toBe("applied");
    expect(book.outstanding("bank")).toBe(LOAN.start - LOAN.step);
    closeMonth(runner);
    const second = Math.round((LOAN.start - LOAN.step) * LOAN.monthlyRate);
    expect(book.loan("bank")).toMatchObject({ paid: 2, interestPaid: first + second });
    expect(w.num("park.interest_paid")).toBe(first + second);
    expect(w.num("report.interest")).toBe(second);
  });

  test("the bank's limit is the book's: the line stops at LOAN.max", () => {
    const { runner, w } = openPark();
    let draws = 0;
    while (act(runner, "take_loan") === "applied") draws += 1;
    expect(draws).toBe((LOAN.max - LOAN.start) / LOAN.step);
    expect(w.num("park.loan_owed")).toBe(LOAN.max);
    expect(parkLoanBook(runner.ctx).draw("bank", 1, 0)).toMatchObject({ ok: false, outstanding: LOAN.max });
  });

  test("a loaded park rebuilds the book where the save left it, and charges the next month the same", () => {
    const { runner, w } = openPark();
    act(runner, "take_loan");
    closeMonth(runner);
    act(runner, "take_loan");
    closeDay(runner.ctx);
    const saved = JSON.stringify(snapshotPark(runner.ctx));
    const live = parkLoanBook(runner.ctx).loan("bank")!;
    closeMonth(runner);
    const charged = w.num("report.interest");

    const reloaded = createHeadlessRunner({ game, maxStepSeconds: 1 });
    resetPark(reloaded.ctx, { layout: "blank" });
    applySave(reloaded.ctx, decodeSave(saved)!);
    const restored = parkLoanBook(reloaded.ctx).loan("bank")!;
    expect({ outstanding: restored.outstanding, paid: restored.paid, interestPaid: restored.interestPaid })
      .toEqual({ outstanding: live.outstanding, paid: live.paid, interestPaid: live.interestPaid });
    closeMonth(reloaded);
    expect(park.of(reloaded.ctx).num("report.interest")).toBe(charged);
    expect(park.of(reloaded.ctx).num("park.interest_paid")).toBe(w.num("park.interest_paid"));
  });
});

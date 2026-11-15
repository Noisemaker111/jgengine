import { describe, expect, test } from "bun:test";

import { CAREER_KEY, newCareer, readCareer, type CareerSave } from "../career";
import { eventById } from "../events/catalog";
import { createRunSession } from "../run/session";
import { driveCourse } from "../testing/courseDriver";
import { trackById } from "../tracks/catalog";
import { CLOSING_TIME_CUP, CUP_PURSE, CUP_ROUNDS, cupBoard, newCup, readCup, recordCupRound, startCup } from "./cup";

function memory(seed?: (career: CareerSave) => void) {
  const map = new Map<string, string>();
  const career = newCareer();
  seed?.(career);
  map.set(CAREER_KEY, JSON.stringify(career));
  return { map, getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => void map.set(key, value) };
}

const FIELD = (you: number) => ({ player: you, rival_grandma: you === 1 ? 2 : 1, rival_twins: 3, rival_brick: 4 });

describe("Closing-Time Cup", () => {
  test("six full-field rounds, one in every department", () => {
    expect(CUP_ROUNDS).toHaveLength(6);
    const tracks = CUP_ROUNDS.map((id) => eventById(id)!.track);
    expect(new Set(tracks).size).toBe(6);
    for (const id of CUP_ROUNDS) expect(eventById(id)!.rivals).toBe("all");
  });

  test("winning every round lifts the cup and pays the champion's purse; a fresh season keeps the trophy count", () => {
    let cup = startCup(newCup());
    let purse = 0;
    for (const round of CUP_ROUNDS) {
      const result = recordCupRound(cup, round, FIELD(1))!;
      cup = result.cup;
      purse += result.purse;
    }
    expect(cup).toMatchObject({ active: false, won: 1 });
    expect(purse).toBe(CUP_PURSE.champion);
    expect(cupBoard(cup).champion).toBe("player");
    expect(cupBoard(cup).standings[0]).toMatchObject({ name: "YOU", points: 60, wins: 6 });
    expect(startCup(cup)).toMatchObject({ active: true, won: 1 });
  });

  test("only the round the cup is on counts, and only while a season is on", () => {
    expect(recordCupRound(newCup(), "last-call", FIELD(1))).toBeNull();
    const cup = startCup(newCup());
    expect(recordCupRound(cup, "garden-gp", FIELD(1))).toBeNull();
    expect(recordCupRound(cup, "last-call", FIELD(2))!.rank).toBe(2);
  });

  test("a saved cup survives the career round trip; junk falls back to a fresh one", () => {
    const cup = recordCupRound(startCup(newCup()), "last-call", FIELD(3))!.cup;
    expect(readCup(JSON.parse(JSON.stringify(cup)))).toEqual(cup);
    expect(readCup({ state: { results: { "no-such-round": { player: 1 } } } })).toEqual(newCup());
    expect(readCup("junk")).toEqual(newCup());
    expect(CLOSING_TIME_CUP.nextRound(cup.state)).toBe("produce-derby");
  });

  test("a raced cup round scores the whole field and lines up the next round, even one whose tier is locked", () => {
    const storage = memory();
    const session = createRunSession(() => 0, storage);
    expect(session.startCup()).toEqual({ ok: true });
    expect(session.snapshot().event.id).toBe("last-call");
    expect(session.snapshot().cup).toMatchObject({ active: true, roundNumber: 1, next: { id: "last-call" } });
    session.start();
    driveCourse(session, { limit: 200 });
    const end = session.snapshot();
    expect(end.phase).not.toBe("running");
    expect(end.outcome?.cup).toMatchObject({ round: 1, of: 6 });
    const career = readCareer(storage);
    expect(Object.keys(career.cup.state.results["last-call"]!).sort()).toEqual(["player", "rival_brick", "rival_grandma", "rival_twins"]);
    expect(career.event).toBe("produce-derby");
    // Produce Derby is a Late Shift event, still locked on a fresh career, but the cup races it.
    session.returnToTitle();
    expect(session.snapshot().event.id).toBe("produce-derby");
    expect(session.snapshot().cup.roundNumber).toBe(2);
  });

  test("rolling into a secret stockroom shortcut announces it once and keeps it in the career", () => {
    const storage = memory((career) => { career.medals = { best: { "price-check": 20 } }; });
    const session = createRunSession(() => 0, storage);
    expect(session.selectEvent("price-check")).toEqual({ ok: true });
    session.start();
    expect(session.snapshot().secrets).toEqual({ found: 0, total: 2 });
    driveCourse(session, { limit: 120, take: ["cold-room"] });
    expect(readCareer(storage).secrets).toEqual(["produce:cold-room"]);
    expect(session.snapshot().secrets.found).toBe(1);
    expect(trackById("produce")!.def.branches.find((branch) => branch.id === "cold-room")!.secret).toBe(true);
  });
});

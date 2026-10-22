import { describe, expect, test } from "bun:test";
import { resolveRoutine } from "./routine";

const DAY = 86_400;
const at = (hour: number, minute = 0): number => hour * 3600 + minute * 60;

function dayOf() {
  return resolveRoutine({
    cycleSeconds: 600,
    stops: [
      { place: "home", arriveAt: 0, activity: "sleep", travelSeconds: 0 },
      { place: "work", arriveAt: 120, activity: "work", travelSeconds: 20 },
      { place: "diner", arriveAt: 300, activity: "meal", travelSeconds: 20, refill: { hunger: 40 } },
      { place: "home", arriveAt: 420, activity: "home", travelSeconds: 20 },
    ],
  });
}

describe("resolveRoutine", () => {
  test("a day reaches home, work, meal and home at real arrival times", () => {
    const routine = resolveRoutine({
      stops: [
        { place: "home", arriveAt: 0, activity: "sleep", travelSeconds: 0 },
        { place: "work", arriveAt: at(8), activity: "work", travelSeconds: 600 },
        { place: "diner", arriveAt: at(12), activity: "meal", travelSeconds: 300 },
        { place: "home", arriveAt: at(17), activity: "home", travelSeconds: 480 },
      ],
    });

    expect(routine.cycleSeconds).toBe(DAY);
    expect(routine.stops.map((stop) => stop.arriveAt)).toEqual([0, at(8), at(12), at(17)]);
    expect(routine.stops[0]!.departAt).toBe(at(7, 50));
    expect(routine.stops[1]!.departAt).toBe(at(11, 55));
    expect(routine.stops[2]!.departAt).toBe(at(16, 52));
    expect(routine.stops[3]!.departAt).toBe(DAY);

    const walking = routine.phaseAt(at(7, 55));
    expect(walking).toMatchObject({ stop: 0, place: "home", nextPlace: "work", travelling: true });
    expect(walking.progress).toBeCloseTo(5 * 60 / 600, 5);

    expect(routine.phaseAt(at(9))).toMatchObject({ stop: 1, place: "work", activity: "work", travelling: false });
    expect(routine.phaseAt(at(16, 55))).toMatchObject({ stop: 2, place: "diner", nextPlace: "home", travelling: true });
    expect(routine.phaseAt(at(18))).toMatchObject({ stop: 3, place: "home", travelling: false });

    expect(routine.nextChangeAfter(at(7))).toBe(at(7, 50));
    expect(routine.nextChangeAfter(at(9))).toBe(at(11, 55));
    expect(routine.nextChangeAfter(at(20))).toBe(DAY);
  });

  test("a walk that runs into the next stop slips the arrival instead of teleporting", () => {
    const routine = resolveRoutine({
      stops: [
        { place: "home", arriveAt: at(7, 30), travelSeconds: 0 },
        { place: "work", arriveAt: at(8), travelSeconds: 3600 },
      ],
    });
    expect(routine.stops[1]!.plannedArriveAt).toBe(at(8));
    expect(routine.stops[1]!.arriveAt).toBe(at(8, 30));
    expect(routine.stops[0]!.departAt).toBe(at(7, 30));
    expect(routine.phaseAt(at(8))).toMatchObject({ place: "home", nextPlace: "work", travelling: true });
    expect(routine.phaseAt(at(8, 15)).progress).toBeCloseTo(0.75, 5);
    expect(routine.phaseAt(at(8, 30))).toMatchObject({ stop: 1, place: "work", travelling: false });
  });

  test("wraps every cycle and keeps a one-stop day at home", () => {
    const routine = dayOf();
    expect(routine.phaseAt(0).stop).toBe(0);
    expect(routine.phaseAt(DAY * 3 + 200).stop).toBe(1);
    expect(routine.phaseAt(DAY * 3 + 450).stop).toBe(3);
    expect(routine.nextChangeAfter(DAY * 3 + 450)).toBe(DAY * 3 + 600);

    const stay = resolveRoutine({ stops: [{ place: "chair", arriveAt: 0 }] });
    expect(stay.phaseAt(DAY * 2)).toMatchObject({ place: "chair", travelling: false, stop: 0 });
    expect(stay.nextChangeAfter(1234)).toBe(DAY);
  });

  test("refuses a day it cannot walk: unsorted stops, times outside the cycle, too little room", () => {
    expect(() =>
      resolveRoutine({
        stops: [
          { place: "work", arriveAt: 100 },
          { place: "home", arriveAt: 50 },
        ],
      }),
    ).toThrow("ascending");
    expect(() => resolveRoutine({ stops: [{ place: "home", arriveAt: DAY }] })).toThrow("arriveAt in");
    expect(() =>
      resolveRoutine({
        cycleSeconds: 3600,
        stops: [
          { place: "home", arriveAt: 0, travelSeconds: 3000 },
          { place: "work", arriveAt: 1800, travelSeconds: 3000 },
        ],
      }),
    ).toThrow("does not fit");
  });
});

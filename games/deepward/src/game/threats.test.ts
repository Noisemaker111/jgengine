import { describe, expect, test } from "bun:test";
import { TEMPLATES, type Point } from "../world";
import { CAT, EXTERMINATOR, jab, kidLooking, roombaActive, spawnThreat, tickThreats, webDrag, type Senses, type ThreatState } from "./threats";
import type { PlannedThreat } from "./runGen";

const room = TEMPLATES["living-rug"]!;
const at = (dx: number, dz: number): Point => [room.area.x + dx, 0, room.area.z + dz];
function threat(kind: PlannedThreat["kind"], dx: number, dz: number): ThreatState {
  return spawnThreat({ key: `t:${kind}`, kind, slot: { id: kind, kind, at: at(dx, dz), minDepth: 0, label: kind } });
}
const senses = (p: Point, extra: Partial<Senses> = {}): Senses => ({ at: p, noise: 0, visibility: 1, covered: false, torch: false, clock: 0, restless: false, pebble: null, ...extra });
function run(states: ThreatState[], s: Senses, seconds: number, dt = 0.05) {
  let current = states; const events: ReturnType<typeof tickThreats>["events"] = [];
  for (let t = 0; t < seconds; t += dt) { const r = tickThreats(room, current, { ...s, clock: s.clock + t }, dt); current = r.states; events.push(...r.events); }
  return { states: current, events };
}

describe("the house's hunters", () => {
  test("the Exterminator's torch finds you, the canister hisses, and the spray hangs where you stood", () => {
    const man = { ...threat("exterminator", 0, 10), facing: Math.PI, mode: "sweep" as const, timer: EXTERMINATOR.sweep, hits: Math.PI };
    const { events, states } = run([man], senses(at(0, 1)), 3.6);
    expect(events.some(e => e.type === "cue" && e.sound === "hiss")).toBe(true);
    expect(events.some(e => e.type === "hurt" && e.by === "exterminator" && e.damage === EXTERMINATOR.damage)).toBe(true);
    expect(states[0]!.mode).toBe("spray");
  });
  test("stepping away during the hiss leaves the cloud on nothing; cover keeps the torch off you", () => {
    const man = { ...threat("exterminator", 0, 10), facing: Math.PI, mode: "sweep" as const, timer: EXTERMINATOR.sweep, hits: Math.PI };
    let aimed = { states: [man] as ThreatState[], events: [] as ReturnType<typeof tickThreats>["events"] };
    for (let i = 0; i < 60 && aimed.states[0]!.mode !== "aim"; i++) aimed = run(aimed.states, senses(at(0, 1), { clock: i * 0.05 }), 0.05);
    expect(aimed.states[0]!.mode).toBe("aim");
    const after = run(aimed.states, senses(at(14, 1)), 4);
    expect(after.events.some(e => e.type === "hurt")).toBe(false);
    const hidden = run([man], senses(at(0, 1), { covered: true }), 3);
    expect(hidden.events.some(e => e.type === "hurt")).toBe(false);
    expect(hidden.states[0]!.mode).not.toBe("aim");
  });
  test("a noise turns his torch toward it, and the needle can't get through his boots", () => {
    const man = { ...threat("exterminator", 0, 10), facing: 0, mode: "patrol" as const };
    const turned = run([man], senses(at(0, 1), { noise: 20 }), 0.1);
    expect(turned.states[0]!.mode).toBe("sweep");
    expect(Math.abs(Math.cos(turned.states[0]!.facing - Math.PI))).toBeGreaterThan(0.9);
    expect(jab([man], at(0, 9)).text).toBeNull();
  });
  test("the Cat stalks what it sees, crouches with a wiggle, and pounces where you stood", () => {
    const cat = { ...threat("cat", 0, 10), facing: Math.PI };
    const you = at(0, 1);
    const { events } = run([cat], senses(you), 3);
    expect(events.some(e => e.type === "cue" && e.sound === "wiggle")).toBe(true);
    expect(events.some(e => e.type === "hurt" && e.by === "cat" && e.damage === CAT.damage)).toBe(true);
  });
  test("hiding under cover makes the crouching Cat lose you", () => {
    const cat = { ...threat("cat", 0, 10), facing: Math.PI };
    const { events } = run([cat], senses(at(0, 1), { covered: true }), 3);
    expect(events.some(e => e.type === "hurt")).toBe(false);
  });
  test("a noise the Cat cannot see sends it to listen, then to stalk the sound", () => {
    const cat = { ...threat("cat", 0, -12), facing: Math.PI };
    const r = run([cat], senses(at(0, 10), { noise: 30 }), 0.3);
    expect(["listen", "stalk"]).toContain(r.states[0]!.mode);
  });
  test("the Roomba sweeps on a schedule and bowls over a Little in its lane", () => {
    const roomba = threat("roomba", 0, 12);
    let clock = 0;
    while (!roombaActive(roomba, clock)) clock += 1;
    const active = run([roomba], senses(roomba.at, { clock }), 1);
    expect(active.events.some(e => e.type === "vacuum")).toBe(true);
    expect(active.events.some(e => e.type === "hurt" && e.by === "roomba")).toBe(true);
  });
  test("a mousetrap snaps once", () => {
    const trap = threat("trap", 4, 4);
    const first = run([trap], senses(trap.at), 0.2);
    expect(first.events.filter(e => e.type === "hurt").length).toBe(1);
    expect(first.states[0]!.mode).toBe("sprung");
    expect(run(first.states, senses(trap.at), 0.2).events.some(e => e.type === "hurt")).toBe(false);
  });
  test("a restless kid looks around, and a Little held in sight is picked up", () => {
    const kid = threat("kid", 0, -14);
    let clock = 0;
    while (!kidLooking(kid, clock, true)) clock += 0.5;
    const r = run([kid], senses(at(0, 0), { restless: true, clock }), 2);
    expect(r.events.some(e => e.type === "grab")).toBe(true);
    expect(run([kid], senses(at(0, 0), { restless: false, clock }), 2).events.some(e => e.type === "grab")).toBe(false);
  });
  test("the dog wakes to noise, barks, and wakes the Cat too", () => {
    const dog = threat("dog", 10, -10), cat = { ...threat("cat", -15, 15), facing: 0 };
    const r = run([dog, cat], senses(at(4, -4), { noise: 18 }), 3);
    expect(r.states[0]!.mode).not.toBe("asleep");
    expect(r.events.some(e => e.type === "bark")).toBe(true);
    expect(["stalk", "crouch", "pounce", "listen", "groom"]).toContain(r.states[1]!.mode);
  });
  test("a spider's web drags at you, its bite hurts, a torch keeps it back and two jabs finish it", () => {
    const spider = threat("spider", 0, 0);
    expect(webDrag([spider], spider.at)).toBeLessThan(1);
    expect(webDrag([spider], at(20, 15))).toBe(1);
    expect(run([spider], senses(at(1, 0)), 2).events.some(e => e.type === "hurt" && e.by === "spider")).toBe(true);
    expect(run([spider], senses(at(1, 0), { torch: true }), 2).events.some(e => e.type === "hurt")).toBe(false);
    const once = jab([spider], spider.at), twice = jab(once.states, spider.at);
    expect(once.states[0]!.mode).not.toBe("dead");
    expect(twice.states[0]!.mode).toBe("dead");
    expect(twice.silk).not.toBeNull();
  });
  test("a slingshot pebble pulls the Cat away to look", () => {
    const cat = { ...threat("cat", 0, 0), facing: 0 };
    const r = tickThreats(room, [cat], senses(at(20, 15), { pebble: at(-10, -10) }), 0.05);
    expect(r.states[0]!.mode).toBe("stalk");
    expect(r.states[0]!.target).toEqual(at(-10, -10));
  });
});

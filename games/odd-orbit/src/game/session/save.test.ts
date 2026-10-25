import { expect, test } from "bun:test";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import type { KeyValueStorage } from "@jgengine/core/game/keyValueStore";
import { game } from "../../game.config";
import { registerCommands } from "../commands";
import { bondLine, householdBook } from "../agents";
import { FURNITURE_BY_ID } from "../objects/catalog";
import { content } from "../content";
import { setupWorld } from "../sim/setup";
import { ANSWER_SECONDS } from "../sim/events";
import { simulateHousehold } from "../sim/simulate";
import { pairKey } from "./types";
import { householdStore } from "./store";
import { captureOrbitSave, ORBIT_SAVE_KEY, orbitProfile, orbitSlotKey, readOrbitSave, restoreOrbitSave, validOrbitSave, writeOrbitSave, type OrbitSave } from "./save";

function boot() {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: "orbit-save-test", isNew: true } });
  setupWorld(ctx);
  return ctx;
}
function memory(raw?: string): { storage: KeyValueStorage; values: Map<string, string> } {
  const values = new Map<string, string>(raw === undefined ? [] : [[ORBIT_SAVE_KEY, raw]]);
  return { values, storage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } } };
}

test("household, furniture, order, positions and clock roundtrip together", () => {
  const first = boot();
  first.time.setSpeed(4);
  simulateHousehold(first, first.time.advance(8));
  first.scene.object.place("sleep_pod", 5, 0, 5, { instanceId: "placed:sleep_pod:1", rotation: Math.PI / 2 });
  first.scene.object.rotate("hab:hab_wall:-9:-9", Math.PI);
  const state = householdStore.read(first);
  state.order.reverse();
  state.selectedMemberId = state.order[0]!;
  state.members[state.order[0]!]!.assignedByPlayer = true;
  state.members[state.order[0]!]!.action = { kind: "seek", goal: "energy", objId: "placed:sleep_pod:1" };
  state.debt = 81;
  state.pantry = 7;
  state.members[state.order[1]!]!.completedShifts = 3;
  first.scene.entity.stats.set(state.order[0]!, "health", { current: 88 });
  householdStore.write(first, { ...state });
  const before = captureOrbitSave(first);
  expect(validOrbitSave(before)).toBe(true);
  const { storage } = memory();
  expect(writeOrbitSave(first, storage)).toBe(true);
  const loaded = readOrbitSave(storage);
  expect(loaded).toEqual({ save: before, damaged: false, unavailable: false });
  const second = boot();
  restoreOrbitSave(second, loaded.save!);
  expect(captureOrbitSave(second)).toEqual(before);
  expect(second.scene.object.get("placed:sleep_pod:1")!.rotationY).toBe(Math.PI / 2);
  expect(second.scene.object.get("hab:hab_wall:-9:-9")!.rotationY).toBe(Math.PI);
  const dt = first.time.advance(1);
  simulateHousehold(first, dt);
  simulateHousehold(second, second.time.advance(1));
  expect(captureOrbitSave(second)).toEqual(captureOrbitSave(first));
});

test("nightly ledger cursor restores without charging twice", () => {
  const first = boot();
  simulateHousehold(first, first.time.advance(132));
  const settled = captureOrbitSave(first);
  expect(settled.household.day).toBe(1);
  expect(validOrbitSave(settled)).toBe(true);
  const second = boot(); restoreOrbitSave(second, settled);
  const credits = householdStore.read(second).credits;
  simulateHousehold(second, second.time.advance(0.25));
  expect(householdStore.read(second).credits).toBe(credits);
  expect(householdStore.read(second).economy).toEqual(settled.household.economy);
});

test("corrupt and newer saves are preserved, denied storage stays truthful", () => {
  for (const raw of ["broken", JSON.stringify({ ...captureOrbitSave(boot()), version: 2 }), " ".repeat(256 * 1024 + 1)]) {
    const { storage, values } = memory(raw);
    expect(readOrbitSave(storage)).toEqual({ save: null, damaged: true, unavailable: false });
    expect(values.get(ORBIT_SAVE_KEY)).toBe(raw);
  }
  const denied: KeyValueStorage = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("quota"); }, removeItem() { throw new Error("denied"); } };
  expect(readOrbitSave(denied)).toEqual({ save: null, damaged: false, unavailable: true });
  expect(writeOrbitSave(boot(), denied)).toBe(false);
  expect(writeOrbitSave(boot(), null)).toBe(false);
});

test("bounded needs, relationships, economy, schedules and world reject atomically", () => {
  const changes: ((save: OrbitSave) => void)[] = [
    save => { save.household.members[save.household.order[0]!]!.needs.hunger = 101; },
    save => { save.household.members[save.household.order[0]!]!.shiftProgress = 21; },
    save => { save.household.members[save.household.order[0]!]!.actionUntil = Number.POSITIVE_INFINITY; },
    save => { save.household.relationships[Object.keys(save.household.relationships)[0]!] = -101; },
    save => { save.household.economy.rules.upkeep!.amount = 0; },
    save => { save.household.economy.cursors.upkeep!.nextDueSeconds = 0; },
    save => { save.household.order[1] = save.household.order[0]!; },
    save => { save.household.debt = -1; },
    save => { save.clock.now = Number.NaN; },
    save => { save.household.charter!.term = 9; },
    save => { save.household.charter!.outcome = "won" as never; },
    save => { save.household.story = { elapsed: 0, points: -1, nextAt: 0, lastFiredAt: {}, recent: [], fired: 0 }; },
    save => { save.household.story = { elapsed: 0, points: 0, nextAt: 0, lastFiredAt: { meteorite: 1 }, recent: [], fired: 0 }; },
    save => { save.household.incident = { id: "flood", memberId: null, otherId: null, objId: null, objCatalog: null, deadline: 1 }; },
    save => { save.household.members[save.household.order[0]!]!.traits = ["anxious", "serene"]; },
    save => { save.household.hazards!.broken = [7 as never]; },
    save => { save.objects = [null] as unknown as OrbitSave["objects"]; },
    save => { save.entities = [null] as unknown as OrbitSave["entities"]; },
    save => { save.objects[0]!.catalogId = "unknown"; },
    save => { save.entities[0]!.position = [Number.POSITIVE_INFINITY, 0, 0]; },
  ];
  for (const change of changes) {
    const first = boot();
    const before = captureOrbitSave(first);
    const bad = structuredClone(before); change(bad);
    expect(validOrbitSave(bad)).toBe(false);
    expect(() => restoreOrbitSave(first, bad)).toThrow("Invalid Odd Orbit save");
    expect(captureOrbitSave(first)).toEqual(before);
  }
});


test("a transmission waiting across a reload resolves once, the same way in both households", () => {
  const first = boot();
  const notices: string[] = [];
  first.game.notices.onPush(notice => notices.push(notice.text));
  while (householdStore.read(first).incident == null && first.time.now() < 210 * 4) simulateHousehold(first, first.time.advance(1));
  const pending = householdStore.read(first).incident!;
  expect(pending).not.toBeNull();
  const { storage } = memory();
  expect(writeOrbitSave(first, storage)).toBe(true);
  const second = boot(); restoreOrbitSave(second, readOrbitSave(storage).save!);
  expect(householdStore.read(second).incident).toEqual(pending);
  const step = pending.deadline - first.time.now() + 0.5;
  simulateHousehold(first, first.time.advance(step));
  simulateHousehold(second, second.time.advance(step));
  expect(householdStore.read(first).incident).toBeNull();
  expect(notices.filter(text => text.startsWith("No answer in time"))).toHaveLength(1);
  expect(captureOrbitSave(second).household).toEqual(captureOrbitSave(first).household);
  expect(ANSWER_SECONDS).toBeGreaterThan(30);
});

test("a long unattended gap does not burst transmissions on return", () => {
  const ctx = boot();
  const notices: string[] = [];
  ctx.game.notices.onPush(notice => notices.push(notice.text));
  simulateHousehold(ctx, ctx.time.advance(210 * 3));
  expect(notices.filter(text => text.startsWith("Transmission:")).length).toBeLessThanOrEqual(1);
  const story = householdStore.read(ctx).story!;
  expect(story.elapsed).toBeLessThanOrEqual(11);
  expect(validOrbitSave(captureOrbitSave(ctx))).toBe(true);
});


test("building after reload allocates a distinct placement and charges once", () => {
  const first = boot(); registerCommands(first); setGamePhase(first, "playing");
  first.game.commands.run("build.tool", { toolId: "sleep_pod" });
  first.game.commands.run("world.pointer", { point: { x: 18, y: 0, z: 18 }, entity: null, object: null });
  const firstId = first.scene.object.list().find(object => object.instanceId.startsWith("placed:"))!.instanceId;
  const { storage } = memory();
  expect(writeOrbitSave(first, storage)).toBe(true);
  const second = boot(); restoreOrbitSave(second, readOrbitSave(storage).save!);
  registerCommands(second); setGamePhase(second, "playing");
  second.game.commands.run("build.tool", { toolId: "sleep_pod" });
  second.game.commands.run("world.pointer", { point: { x: 18, y: 0, z: 10 }, entity: null, object: null });
  const placed = second.scene.object.list().filter(object => object.instanceId.startsWith("placed:"));
  expect(placed.map(object => object.instanceId)).toEqual([firstId, "placed:sleep_pod:2"]);
  expect(householdStore.read(second).credits).toBe(640 - FURNITURE_BY_ID.sleep_pod!.cost * 2);
  expect(householdStore.read(second).buildTool).toBeNull();
  expect(validOrbitSave(captureOrbitSave(second))).toBe(true);
});

test("an interrupted reciprocal activity reload releases the partner without awarding a bond", () => {
  const first = boot();
  const state = householdStore.read(first);
  const [aId, bId] = state.order;
  const a = state.members[aId!]!;
  const b = state.members[bId!]!;
  a.needs = { hunger: 10, energy: 80, social: 60, fun: 60 };
  a.action = { kind: "idle" };
  b.action = { kind: "social", withId: a.id };
  b.assignedByPlayer = true;
  b.actionUntil = first.time.now() + 10;
  householdStore.write(first, { ...state, members: { ...state.members } });
  const before = captureOrbitSave(first);
  const second = boot(); restoreOrbitSave(second, before);
  for (const ctx of [first, second]) simulateHousehold(ctx, ctx.time.advance(0.25));
  const after = captureOrbitSave(second);
  expect(after).toEqual(captureOrbitSave(first));
  expect(after.household.members[b.id]!.action.kind).not.toBe("social");
  expect(after.household.members[b.id]!.assignedByPlayer).toBe(false);
  expect(after.household.relationships[pairKey(a.id, b.id)]).toBeLessThanOrEqual(before.household.relationships[pairKey(a.id, b.id)]!);
});


test("legacy v1 households retain pantry crops while new export choices roundtrip", () => {
  const first = boot();
  const legacy = captureOrbitSave(first);
  expect(validOrbitSave(legacy)).toBe(true);
  const second = boot();
  restoreOrbitSave(second, legacy);
  expect(householdStore.read(second).members["alien:1"]!.bloomCrop ?? "pantry").toBe("pantry");
  householdStore.read(second).members["alien:1"]!.bloomCrop = "export";
  const current = captureOrbitSave(second);
  expect(validOrbitSave(current)).toBe(true);
  restoreOrbitSave(first, current);
  expect(householdStore.read(first).members["alien:1"]!.bloomCrop).toBe("export");
  (current.household.members["alien:1"] as any).bloomCrop = "free-money";
  expect(validOrbitSave(current)).toBe(false);
});

test("a stroll kept in a friend's company survives a reload and reads in the panel", () => {
  const first = boot();
  const state = householdStore.read(first);
  const [a, b] = [state.members["alien:1"]!, state.members["alien:3"]!];
  a.action = { kind: "wander", x: 2.5, z: -1.5, company: b.id };
  a.actionUntil = first.time.now() + 8;
  householdStore.write(first, { ...state, members: { ...state.members } });
  const saved = captureOrbitSave(first);
  expect(validOrbitSave(saved)).toBe(true);
  const second = boot(); restoreOrbitSave(second, saved);
  expect(householdStore.read(second).members[a.id]!.action).toEqual({ kind: "wander", x: 2.5, z: -1.5, company: b.id });
  (saved.household.members[a.id] as any).action.company = "alien:9";
  expect(validOrbitSave(saved)).toBe(false);
});

test("a bond survives save and reload and still refuses to split the pair's shift", () => {
  const first = boot(); registerCommands(first); setGamePhase(first, "playing");
  const state = householdStore.read(first);
  const a = state.members["alien:0"]!;
  const b = state.members["alien:2"]!;
  for (const member of [a, b]) first.game.commands.run("member.lifestyle", { id:member.id, lifestyle:"yield" });
  state.relationships[pairKey(a.id, b.id)] = 97;
  state.familiarity[pairKey(a.id, b.id)] = 0.9;
  householdStore.write(first, { ...state, members: { ...state.members } });
  const saved = captureOrbitSave(first);
  expect(validOrbitSave(saved)).toBe(true);
  const { storage } = memory();
  expect(writeOrbitSave(first, storage)).toBe(true);

  const second = boot(); restoreOrbitSave(second, readOrbitSave(storage).save!);
  registerCommands(second); setGamePhase(second, "playing");
  const loaded = householdStore.read(second);
  expect(bondLine(loaded, a.id)).toMatchObject({ id: b.id, name: b.name, word: "Bonded" });
  expect(householdBook(loaded).refusesToSplit(a.id, b.id)).toBe(true);
  second.game.commands.run("member.direct", { id:a.id, goal:"work" });
  expect(loaded.members[a.id]!.action.kind).toBe("idle");
  expect(loaded.members[b.id]!.action.kind).toBe("idle");
  expect(loaded.members[a.id]!.concern).toContain("bonded and will not split");
});

test("a named household writes to its own slot and continues with its name and frame", () => {
  orbitProfile.name = "Vega Household";
  orbitProfile.thumbnail = "data:image/jpeg;base64,AAAA";
  orbitProfile.savedAt = 1_700_000_000_000;
  const first = boot();
  householdStore.write(first, { ...householdStore.read(first), credits: 512 });
  const { storage, values } = memory();
  expect(writeOrbitSave(first, storage, "household-2")).toBe(true);
  expect(values.has(ORBIT_SAVE_KEY)).toBe(false);
  expect(values.has(orbitSlotKey("household-2"))).toBe(true);

  const written = readOrbitSave(storage, "household-2").save!;
  expect(written.profile).toMatchObject({ name: "Vega Household", thumbnail: "data:image/jpeg;base64,AAAA", savedAt: 1_700_000_000_000 });
  const second = boot();
  restoreOrbitSave(second, written);
  expect(householdStore.read(second).credits).toBe(512);
  expect(orbitProfile.name).toBe("Vega Household");
  expect(orbitProfile.thumbnail).toBe("data:image/jpeg;base64,AAAA");
  orbitProfile.name = "";
  orbitProfile.thumbnail = null;
  orbitProfile.savedAt = 0;
});

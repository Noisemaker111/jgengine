import { expect, test } from "bun:test";
import { createAssetCatalog } from "./assetCatalog";
import { defineGameDefinition } from "../game/defineGame";
import { createGameContext } from "../runtime/gameContext";
import { boardVehicle, createVehicleSeats, leaveVehicle } from "./vehicleSeat";
import { createKinematicVehicle } from "../physics/kinematicVehicle";
import { createBoatDynamics } from "../physics/boatDynamics";
import { tickDrivableVehicle, type DrivableSimStep } from "../physics/drivableVehicle";
import { resolvePlayerMovementTuning, snapshotPlayerMovement, stepPlayerMovement } from "../movement/playerMovement";
import { createMountController } from "./mount";
import { memorySaveBackend } from "../game/saveStore";
import type { RuntimeSaveOptions } from "../runtime/runtimeSave";

function fixture(kind: "ground" | "boat" = "ground", save?: RuntimeSaveOptions) {
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "Transit", assets: createAssetCatalog(), multiplayer: "off", persist: false }),
    content: {}, player: { userId: "local", isNew: true }, ...(save === undefined ? {} : { save }),
  });
  for (const id of ["local", "alice", "bob"]) ctx.scene.entity.spawn("rider", { id, role: "player", movement: { walkSpeed: 3 } });
  ctx.scene.entity.spawn(kind === "ground" ? "courier-cart" : "cargo-ferry", { id: "v", position: [0, 0, 0] });
  const seats = createVehicleSeats();
  seats.register({ id: "v", kit: { kind }, seats: [
    { id: "helm", offset: [0, 0, 0], control: true },
    { id: "lookout", offset: [1, 0, 0] },
  ] });
  ctx.game.registerSave?.({ key: "transitSeats", snapshot: seats.snapshot.bind(seats), hydrate: (rows) => seats.restore(rows as ReturnType<typeof seats.snapshot>) });
  return { ctx, seats };
}

for (const kind of ["ground", "boat"] as const) {
  test(`${kind} composition enters, routes only helm input to its actual motor, saves/reloads and exits`, () => {
    const { ctx, seats } = fixture(kind);
    const movement = resolvePlayerMovementTuning({});
    stepPlayerMovement(ctx, "local", { held: ["moveForward"], pointer: null }, 0.25, movement);
    expect(snapshotPlayerMovement(ctx, "local")).not.toBeNull();
    expect(boardVehicle(ctx, seats, "local", "v", { rig: "chase", config: { chase: { height: 4 } }, chase: { distance: 9 } }).ok).toBe(true);
    expect(snapshotPlayerMovement(ctx, "local")).toBeNull();
    expect(boardVehicle(ctx, seats, "alice", "v", { camera: false }).ok).toBe(true);
    expect(seats.drivenBy("local")).toBe("v"); expect(seats.drivenBy("alice")).toBeNull();
    expect(seats.drivenBy("bob")).toBeNull(); expect(seats.mounts.driveTarget("bob")).toBe("bob");
    expect(ctx.scene.entity.get("local")).toMatchObject({ hidden: true, movement: { frozen: true, walkSpeed: 3 }, velocity: [0, 0, 0] });
    const frozen = ctx.scene.entity.get("local")!.position;
    stepPlayerMovement(ctx, "local", { held: ["moveForward"], pointer: null }, 0.25, movement);
    expect(ctx.scene.entity.get("local")!.position).toEqual(frozen);
    const sim = kind === "ground" ? createKinematicVehicle({ engineAccel: 8, brakeAccel: 10, topSpeed: 15, reverseSpeed: 3,
      turnRate: 1, turnSpeedRef: 4, gripStrength: 5, handbrakeGrip: 1 }) : createBoatDynamics({
      massKg: 5000, length: 9, beam: 3, maxThrust: 20000, propSpeed: 8, steering: { kind: "rudder", area: 1 },
    });
    ctx.input.publish(["moveForward"]);
    const axis = ctx.input.axis({ throttle: { positive: ["moveForward"] }, brake: { positive: [] }, steer: { positive: [] }, handbrake: { positive: [] } }, { throttle: { min: 0, max: 1 } });
    for (let i = 0; i < 60; i++) {
      const drive = tickDrivableVehicle<DrivableSimStep, never>(sim, 1 / 60, axis);
      ctx.scene.entity.setPose(seats.drivenBy("local")!, drive.pose);
      for (const { riderId } of seats.snapshot()) ctx.scene.entity.setPose(riderId, drive.pose);
    }
    expect(ctx.scene.entity.get("v")!.position[2]).toBeGreaterThan(0.5);
    expect(ctx.camera.followedEntityId()).toBe("v"); expect(ctx.camera.rig()?.kind).toBe("chase");
    const saved = JSON.parse(JSON.stringify(ctx.state()));
    const fresh = fixture(kind); fresh.ctx.restore(saved);
    expect(fresh.seats.snapshot()).toEqual(seats.snapshot());
    expect(fresh.ctx.scene.entity.get("local")).toMatchObject({ hidden: true, movement: { frozen: true }, position: ctx.scene.entity.get("local")!.position });
    expect(fresh.ctx.camera.snapshot()).toEqual(ctx.camera.snapshot());
    expect(fresh.ctx.snapshot()).not.toHaveProperty("camera");
    expect(fresh.ctx.snapshot()).not.toHaveProperty("transitSeats");
    const out = leaveVehicle(fresh.ctx, fresh.seats, "local", { side: "left", distance: 3 });
    expect(out.ok).toBe(true); if (!out.ok) return;
    expect(fresh.ctx.scene.entity.get("local")).toMatchObject({ position: out.placement.position, rotationY: out.placement.rotationY,
      hidden: false, movement: { frozen: false, walkSpeed: 3 }, velocity: [0, 0, 0] });
    expect(fresh.seats.drivenBy("local")).toBeNull(); expect(fresh.seats.mounts.driveTarget("local")).toBe("local");
    expect(fresh.ctx.camera.rig()).toBeNull(); expect(fresh.ctx.camera.chaseTuning()).toBeNull(); expect(fresh.ctx.camera.followedEntityId()).toBe("local");
    const exitPosition = fresh.ctx.scene.entity.get("local")!.position;
    stepPlayerMovement(fresh.ctx, "local", { held: [], pointer: null }, 0.1, movement, out.placement.rotationY);
    expect(fresh.ctx.scene.entity.get("local")!.position).toEqual(exitPosition);
    expect(fresh.seats.isSeated("alice")).toBe(true);
    leaveVehicle(fresh.ctx, fresh.seats, "alice", { camera: false }); fresh.seats.reset(); fresh.ctx.camera.reset();
    expect(fresh.seats.snapshot()).toEqual([]); expect(fresh.ctx.camera.followedEntityId()).toBeUndefined();
    expect(fresh.ctx.scene.entity.get("alice")?.hidden).toBe(false);
  });
}

test("failed transitions preserve occupancy, entity state and camera policy", () => {
  const { ctx, seats } = fixture();
  boardVehicle(ctx, seats, "local", "v", { rig: "chase", chase: { height: 3 } });
  const before = ctx.state();
  for (const result of [boardVehicle(ctx, seats, "bob", "v", { seatId: "helm", rig: "none" }),
    boardVehicle(ctx, seats, "missing", "v"), boardVehicle(ctx, seats, "bob", "missing"), leaveVehicle(ctx, seats, "bob")]) {
    expect(result.ok).toBe(false); expect(ctx.state()).toEqual(before);
  }
  for (const chase of [{ distance: NaN }, { height: Infinity }]) {
    expect(() => boardVehicle(ctx, seats, "bob", "v", { chase })).toThrow(); expect(ctx.state()).toEqual(before);
  }
  for (const options of [{ distance: NaN }, { distance: Infinity }, { pose: { position: [0, NaN, 0] as const, rotationY: 0 } },
    { pose: { position: [Number.MAX_VALUE, 0, 0] as const, rotationY: 0 }, distance: Number.MAX_VALUE }]) {
    expect(leaveVehicle(ctx, seats, "local", options)).toEqual({ ok: false, reason: "invalid_pose" }); expect(ctx.state()).toEqual(before);
  }
  ctx.scene.entity.despawn("v"); const removed = ctx.state();
  expect(leaveVehicle(ctx, seats, "local")).toEqual({ ok: false, reason: "unknown_vehicle" });
  expect(ctx.state()).toEqual(removed);
  expect(leaveVehicle(ctx, seats, "local", { pose: { position: [20, 0, 30], rotationY: 0 } }).ok).toBe(true);
});

test("explicit remote rider identity and camera:false preserve local presentation through command attribution", () => {
  const { ctx, seats } = fixture(); ctx.camera.follow("local"); ctx.camera.setRig("orbit");
  const camera = ctx.camera.snapshot();
  ctx.game.commands.define("board", { apply(state) { boardVehicle(state, seats, state.player.userId, "v", { camera: false, rig: "chase" }); } });
  ctx.game.commands.runAs("alice", "board", {});
  expect(seats.driverOf("v")).toBe("alice"); expect(ctx.player.userId).toBe("local");
  expect(ctx.scene.entity.get("alice")).toMatchObject({ hidden: true, movement: { frozen: true } });
  expect(ctx.scene.entity.get("local")?.hidden).toBeUndefined(); expect(ctx.camera.snapshot()).toEqual(camera);
  leaveVehicle(ctx, seats, "alice", { camera: false }); expect(ctx.camera.snapshot()).toEqual(camera);
});

test("same ids in separate worlds have independent seats, camera and save state", () => {
  const a = fixture(), b = fixture();
  stepPlayerMovement(b.ctx, "local", { held: ["moveForward"], pointer: null }, 0.25,
    resolvePlayerMovementTuning({ movement: { flight: { mode: "spectator", acceleration: 2 } } }));
  const otherWorldMovement = snapshotPlayerMovement(b.ctx, "local");
  expect(otherWorldMovement).not.toBeNull();
  boardVehicle(a.ctx, a.seats, "local", "v", { rig: "chase" });
  expect(snapshotPlayerMovement(b.ctx, "local")).toEqual(otherWorldMovement);
  expect(b.seats.snapshot()).toEqual([]); expect(b.ctx.camera.rig()).toBeNull(); expect(b.ctx.scene.entity.get("local")?.hidden).toBeUndefined();
  expect(boardVehicle(b.ctx, b.seats, "alice", "v", { camera: false }).ok).toBe(true);
  expect(a.seats.driverOf("v")).toBe("local"); expect(b.seats.driverOf("v")).toBe("alice");
});

test("shared-controller occupancy restores atomically and reset preserves registrations", () => {
  const controller = createMountController(); controller.register({ id: "raft", kit: { kind: "boat" } });
  const seats = createVehicleSeats(controller); controller.mount("alice", "raft");
  const saved = JSON.parse(JSON.stringify(seats.snapshot()));
  for (const bad of [[...saved, { riderId: "bob", mountId: "raft", seatId: "driver" }],
    [{ riderId: "alice", mountId: "missing", seatId: "driver" }], [{ riderId: "bob", mountId: "raft", seatId: "missing" }],
    [saved[0], saved[0]], [null], null]) {
    expect(() => seats.restore(bad as unknown as ReturnType<typeof seats.snapshot>)).toThrow(); expect(seats.snapshot()).toEqual(saved);
  }
  seats.reset(); expect(controller.isRegistered("raft")).toBe(true); expect(seats.snapshot()).toEqual([]);
  seats.restore(saved); saved[0].riderId = "mutated"; expect(seats.driverOf("raft")).toBe("alice");
});

test("actual save backend restores boarded visibility, occupancy and camera before a clean exit", async () => {
  const backend = memorySaveBackend();
  const save = { backend, key: "transit", mode: "manual" as const, load: false };
  const source = fixture("boat", save);
  boardVehicle(source.ctx, source.seats, "local", "v", { rig: "chase", chase: { yawResponse: Infinity, fov: { response: Infinity } } });
  source.ctx.scene.entity.setPose("local", { position: [4, 0, 8], dt: 1 });
  await source.ctx.game.save!.checkpoint();
  const fresh = fixture("boat", save); await fresh.ctx.game.save!.load();
  expect(fresh.seats.driverOf("v")).toBe("local");
  expect(fresh.ctx.scene.entity.get("local")).toMatchObject({ hidden: true, movement: { frozen: true }, position: [4, 0, 8] });
  expect(fresh.ctx.camera.rig()?.kind).toBe("chase"); expect(fresh.ctx.camera.followedEntityId()).toBe("v");
  expect(fresh.ctx.camera.chaseTuning()).toEqual({ yawResponse: Infinity, fov: { response: Infinity } });
  expect(leaveVehicle(fresh.ctx, fresh.seats, "local").ok).toBe(true);
  expect(fresh.ctx.scene.entity.get("local")).toMatchObject({ hidden: false, movement: { frozen: false }, velocity: [0, 0, 0] });
  const camera = fresh.ctx.camera.snapshot(); fresh.ctx.restore({}); expect(fresh.ctx.camera.snapshot()).toEqual(camera);
  fresh.ctx.restore({ camera: { ...camera, rig: { kind: "chase", config: { chase: { distance: "bad" } } } } });
  expect(fresh.ctx.camera.snapshot()).toEqual(camera);
});

test("new camera mutations notify the owning context once and reject invalid policy without notification", () => {
  const { ctx } = fixture(); let changes = 0; ctx.subscribe(() => changes++);
  const before = ctx.version(); ctx.camera.setRig("chase"); expect(changes).toBe(1); expect(ctx.version()).toBeGreaterThan(before);
  ctx.camera.restore(ctx.camera.snapshot()); expect(changes).toBe(2);
  ctx.camera.reset(); expect(changes).toBe(3);
  expect(() => ctx.camera.setRig("chase", { chase: { distance: NaN } })).toThrow(); expect(changes).toBe(3);
});

test("explicit rider entity distinct from possession user clears that user's retained movement",()=>{
 const ctx=createGameContext({definition:defineGameDefinition({name:"Possessed rider",multiplayer:"off",persist:false}),content:{},player:{userId:"account",isNew:true}});
 ctx.scene.entity.spawn("person",{id:"pawn",movement:{walkSpeed:3}});ctx.scene.entity.spawn("car",{id:"vehicle",position:[10,0,20]});
 ctx.player.possession.own("account","pawn");expect(ctx.player.possession.possess("account","pawn")).toBeNull();
 const tuning=resolvePlayerMovementTuning({movement:{flight:{mode:"spectator",acceleration:2}}});
 stepPlayerMovement(ctx,"account",{held:["moveForward"],pointer:null},0.25,tuning);
 const motionBefore=snapshotPlayerMovement(ctx,"account");expect(motionBefore).not.toBeNull();
 const seats=createVehicleSeats();seats.register({id:"vehicle",kit:{kind:"ground"}});
 expect(boardVehicle(ctx,seats,"pawn","vehicle",{camera:false}).ok).toBe(true);
 const afterBoard=snapshotPlayerMovement(ctx,"account");
 expect(leaveVehicle(ctx,seats,"pawn",{camera:false}).ok).toBe(true);
 const afterLeave=snapshotPlayerMovement(ctx,"account");const exitPosition=[...ctx.scene.entity.get("pawn")!.position];
 stepPlayerMovement(ctx,"account",{held:[],pointer:null},0.1,tuning);
 const resumed=[...ctx.scene.entity.get("pawn")!.position];
 expect(afterBoard).toBeNull();expect(afterLeave).toBeNull();expect(resumed).toEqual(exitPosition);
});

test("shared active possession users are cleared while an inactive owner's different pawn stays intact",()=>{
 const ctx=createGameContext({definition:defineGameDefinition({name:"Shared rider",multiplayer:"off",persist:false}),content:{},player:{userId:"a",isNew:true}});
 for(const id of ["pawn","otherPawn","vehicle"])ctx.scene.entity.spawn("person",{id});
 for(const user of ["a","b"]){ctx.player.possession.own(user,"pawn");expect(ctx.player.possession.possess(user,"pawn")).toBeNull();}
 ctx.player.possession.own("inactive","pawn");ctx.player.possession.own("inactive","otherPawn");ctx.player.possession.possess("inactive","otherPawn");
 const tuning=resolvePlayerMovementTuning({movement:{flight:{mode:"spectator",acceleration:2}}});
 for(const user of ["a","b","inactive"])stepPlayerMovement(ctx,user,{held:["moveForward"],pointer:null},0.25,tuning);
 const untouched=snapshotPlayerMovement(ctx,"inactive");expect(untouched).not.toBeNull();
 const seats=createVehicleSeats();seats.register({id:"vehicle",kit:{kind:"ground"}});
 expect(boardVehicle(ctx,seats,"pawn","vehicle",{camera:false}).ok).toBe(true);
 const a=snapshotPlayerMovement(ctx,"a"),b=snapshotPlayerMovement(ctx,"b"),inactive=snapshotPlayerMovement(ctx,"inactive");
 expect(a).toBeNull();expect(b).toBeNull();expect(inactive).toEqual(untouched);
});
test("a same-id original rider entity must not erase its user's current different pawn cache",()=>{
 const ctx=createGameContext({definition:defineGameDefinition({name:"Original rider",multiplayer:"off",persist:false}),content:{},player:{userId:"account",isNew:true}});
 for(const id of ["account","currentPawn","vehicle"])ctx.scene.entity.spawn("person",{id});
 ctx.player.possession.own("account","currentPawn");expect(ctx.player.possession.possess("account","currentPawn")).toBeNull();
 const tuning=resolvePlayerMovementTuning({movement:{flight:{mode:"spectator",acceleration:2}}});
 stepPlayerMovement(ctx,"account",{held:["moveForward"],pointer:null},0.25,tuning);
 const retained=snapshotPlayerMovement(ctx,"account");expect(retained).not.toBeNull();
 const seats=createVehicleSeats();seats.register({id:"vehicle",kit:{kind:"ground"}});
 expect(boardVehicle(ctx,seats,"account","vehicle",{camera:false}).ok).toBe(true);
 const afterBoard=snapshotPlayerMovement(ctx,"account");
 expect(leaveVehicle(ctx,seats,"account",{camera:false}).ok).toBe(true);
 const afterLeave=snapshotPlayerMovement(ctx,"account");
 expect(afterBoard).toEqual(retained);expect(afterLeave).toEqual(retained);
});

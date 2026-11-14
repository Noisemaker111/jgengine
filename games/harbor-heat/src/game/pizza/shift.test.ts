import { describe, expect, test } from "bun:test";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { game } from "../../game.config";
import { loop } from "../../loop";
import { content } from "../content";
import { secondsAtHour, DAY_SECONDS } from "../clock";
import { streetPlayOf } from "../streetPlay";
import { tickTide, waterAt, FLOOD_SHEETS } from "../tide/tideRuntime";
import { buyUpgrade } from "./pizzeria";
import { CALL_PATIENCE, customerSpot, OVEN, pizzeriaStore, RIVAL_ID, SHOP_SCOOTER, shiftStore, SWAP_DOCKS, tickShift } from "./shift";

function boot() {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: "shift-test", isNew: true } });
  loop.onInit(ctx);
  loop.onNewPlayer(ctx);
  ctx.game.commands.run("game.start", {});
  return ctx;
}
type Ctx = ReturnType<typeof boot>;

function at(ctx: Ctx, hour: number): void {
  const clock = ctx.time.snapshot();
  ctx.time.hydrate({ ...clock, now: Math.floor(clock.now / DAY_SECONDS) * DAY_SECONDS + secondsAtHour(hour) });
}

function moveTo(ctx: Ctx, spot: readonly [number, number]): void {
  ctx.scene.entity.setPose(ctx.player.userId, { position: [spot[0], ctx.world.groundHeightAt(spot[0], spot[1]), spot[1]] });
}

function run(ctx: Ctx, seconds: number, step = 0.5): void {
  for (let t = 0; t < seconds; t += step) {
    tickTide(ctx);
    tickShift(ctx, step);
  }
}

const cash = (ctx: Ctx) => ctx.game.economy.balance(ctx.player.userId, "cash");

describe("a night at Vell's", () => {
  test("the shop opens at dusk, an order lands, rides out hot and pays on the doorstep", () => {
    const ctx = boot();
    expect(ctx.scene.entity.get(SHOP_SCOOTER)?.meta).toMatchObject({ owned: true });
    at(ctx, 17.6);
    moveTo(ctx, OVEN);
    run(ctx, 2);
    expect(ctx.game.commands.run("pizza.take", {}).status).toBe("rejected");
    at(ctx, 18.05);
    run(ctx, 5);
    const board = shiftStore.read(ctx).board;
    expect(board.length).toBeGreaterThan(0);
    expect(ctx.game.commands.run("pizza.take", {}).status).not.toBe("rejected");
    const bag = shiftStore.read(ctx).bag;
    expect(bag.length).toBe(1);
    const customer = bag[0]!.customerId;
    // The box cools on the way over.
    run(ctx, 20);
    expect(shiftStore.read(ctx).bag[0]!.heat).toBeLessThan(bag[0]!.heat);
    expect(ctx.game.commands.run("pizza.deliver", {}).status).toBe("rejected");
    moveTo(ctx, customerSpot(customer)!);
    const before = cash(ctx);
    expect(ctx.game.commands.run("pizza.deliver", {}).status).not.toBe("rejected");
    expect(cash(ctx)).toBeGreaterThan(before);
    const after = shiftStore.read(ctx);
    expect(after.bag).toHaveLength(0);
    expect(after.delivered).toBe(1);
    expect(after.lastReceipt?.lines[0]?.amount).toBeGreaterThan(0);
    expect(pizzeriaStore.read(ctx).deliveries).toBe(1);
  });

  test("the tide floods the docks first and lifts a sheet of water over them", () => {
    const ctx = boot();
    at(ctx, 17);
    tickTide(ctx);
    expect(ctx.scene.object.list().filter((object) => object.catalogId === "obj_tide_water")).toHaveLength(0);
    at(ctx, 20.5);
    tickTide(ctx);
    const port = FLOOD_SHEETS.find((sheet) => sheet.district === "port_carmine")!;
    const sheet = ctx.scene.object.get("tide_sheet_port_carmine");
    expect(sheet).not.toBeNull();
    expect(sheet!.position[1]).toBeGreaterThan(ctx.world.groundHeightAt(port.center[0], port.center[1]));
    expect(waterAt(ctx, port.center[0], port.center[1])!.depth).toBeGreaterThan(0.45);
    // Palm Heights never floods; the bay is always water.
    expect(waterAt(ctx, 70, -240)).toBeNull();
    expect(waterAt(ctx, -260, 160)?.openSea).toBe(true);
    at(ctx, 23.9);
    tickTide(ctx);
    expect(ctx.scene.object.get("tide_sheet_downtown")).not.toBeNull();
  });

  test("a Carmine's Crust rider shadows a stacked bag and snatches the hottest box", () => {
    const ctx = boot();
    pizzeriaStore.write(ctx, buyUpgrade(pizzeriaStore.read(ctx), "oven"));
    at(ctx, 18.1);
    moveTo(ctx, OVEN);
    run(ctx, 5);
    // The twins order two at once; whoever called, fill the bag to two.
    while (shiftStore.read(ctx).bag.length < 2) {
      if (shiftStore.read(ctx).board.length === 0) run(ctx, 30);
      else ctx.game.commands.run("pizza.take", {});
    }
    shiftStore.write(ctx, { ...shiftStore.read(ctx), rivalIn: 0.1 });
    run(ctx, 0.5);
    const rival = ctx.scene.entity.get(RIVAL_ID);
    expect(rival).not.toBeNull();
    // Let them catch up.
    const me = ctx.scene.entity.get(ctx.player.userId)!.position;
    ctx.scene.entity.setPose(RIVAL_ID, { position: [me[0] + 1, me[1], me[2]] });
    run(ctx, 2, 0.25);
    expect(shiftStore.read(ctx).bag).toHaveLength(1);
    expect(shiftStore.read(ctx).lost).toBe(1);
    expect(ctx.scene.entity.get(RIVAL_ID)).toBeNull();
  });

  test("swap docks trade the scooter for a jet-ski that floats on the flood", () => {
    const ctx = boot();
    const dock = SWAP_DOCKS.find((d) => d.id === "swap_dock_port")!;
    at(ctx, 21);
    tickTide(ctx);
    moveTo(ctx, dock.position);
    expect(ctx.game.commands.run("pizza.swap", {}).status).not.toBe("rejected");
    const boat = streetPlayOf(ctx).drivingVehicleId();
    expect(ctx.scene.entity.get(boat!)?.name).toBe("car_sport");
    streetPlayOf(ctx).tick(ctx, 1 / 60);
    const hull = ctx.scene.entity.get(boat!)!;
    expect(hull.position[1]).toBeGreaterThan(ctx.world.groundHeightAt(hull.position[0], hull.position[2]) + 0.3);
    expect(ctx.game.commands.run("pizza.swap", {}).status).not.toBe("rejected");
    expect(ctx.scene.entity.get(streetPlayOf(ctx).drivingVehicleId()!)?.name).toBe("car_compact");
  });

  test("midnight closes the shift against the quota, and the rider sleeps till dusk", () => {
    const ctx = boot();
    at(ctx, 23.95);
    moveTo(ctx, OVEN);
    run(ctx, 1);
    expect(shiftStore.read(ctx).openDay).not.toBeNull();
    const clock = ctx.time.snapshot();
    ctx.time.hydrate({ ...clock, now: clock.now + secondsAtHour(0.2) });
    run(ctx, 1);
    const summary = shiftStore.read(ctx).summary;
    expect(summary).not.toBeNull();
    expect(summary!.metQuota).toBe(false);
    expect(pizzeriaStore.read(ctx).shifts).toBe(1);
    // The midnight card's Sleep works from across town: the rider rides home first.
    moveTo(ctx, [40, -60]);
    expect(ctx.game.commands.run("shift.sleep", {}).status).not.toBe("rejected");
    const home = ctx.scene.entity.get(ctx.player.userId)!.position;
    expect(Math.hypot(home[0] - OVEN[0], home[2] - OVEN[1])).toBeLessThan(5);
    expect(ctx.time.calendar().hour).toBe(18);
    expect(ctx.time.calendar().minute).toBe(0);
    expect(shiftStore.read(ctx).summary).toBeNull();
  });

  test("tips buy ovens, and paying off the note saves the shop", () => {
    const ctx = boot();
    moveTo(ctx, OVEN);
    ctx.game.economy.grant(ctx.player.userId, "cash", 20000);
    const start = cash(ctx);
    expect(ctx.game.commands.run("pizzeria.upgrade", { kind: "oven" }).status).not.toBe("rejected");
    expect(pizzeriaStore.read(ctx).oven).toBe(2);
    expect(ctx.game.commands.run("pizzeria.pay", { amount: pizzeriaStore.read(ctx).debt }).status).not.toBe("rejected");
    expect(pizzeriaStore.read(ctx).saved).toBe(true);
    expect(cash(ctx)).toBe(start - 1200 - 12000);
  });
  test("a call left on the board too long walks to a rival, and the first stack teaches the risk once", () => {
    const ctx = boot();
    at(ctx, 18.05);
    moveTo(ctx, OVEN);
    run(ctx, 5);
    const first = shiftStore.read(ctx).board[0]!;
    shiftStore.write(ctx, { ...shiftStore.read(ctx), board: [{ ...first, calledAt: ctx.time.now() - CALL_PATIENCE - 1 }], nextCallIn: 999 });
    run(ctx, 0.5);
    expect(shiftStore.read(ctx).board.find((call) => call.id === first.id)).toBeUndefined();
    expect(shiftStore.read(ctx).lost).toBeGreaterThan(0);
    const order = { id: "x1", customerId: "gus", pizzaId: "margherita", heat: 90, soak: 0, age: 0, par: 60 };
    shiftStore.write(ctx, { ...shiftStore.read(ctx), bag: [order, { ...order, id: "x2" }], rivalIn: 999 });
    run(ctx, 0.5);
    expect(pizzeriaStore.read(ctx).hints).toContain("stack");
    const notices = ctx.game.notices.list().filter((n) => n.text.startsWith("Two boxes in the bag")).length;
    run(ctx, 2);
    expect(ctx.game.notices.list().filter((n) => n.text.startsWith("Two boxes in the bag")).length).toBe(notices);
  });
  test("great drops in a row build a hot streak on the tips; a cold box ends it", () => {
    const ctx = boot();
    at(ctx, 18.2);
    run(ctx, 1);
    const hot = { id: "h1", customerId: "gus", pizzaId: "margherita", heat: 95, soak: 0, age: 10, par: 60 };
    const spot = customerSpot("gus")!;
    moveTo(ctx, spot);
    shiftStore.write(ctx, { ...shiftStore.read(ctx), bag: [hot], streak: 3, board: [], nextCallIn: 999 });
    ctx.game.commands.run("pizza.deliver", {});
    const slip = shiftStore.read(ctx).lastReceipt!;
    expect(slip.lines.some((line) => line.label === "Hot streak ×3")).toBe(true);
    expect(shiftStore.read(ctx).streak).toBe(4);
    shiftStore.write(ctx, { ...shiftStore.read(ctx), bag: [{ ...hot, id: "h2", heat: 5 }] });
    ctx.game.commands.run("pizza.deliver", {});
    expect(shiftStore.read(ctx).streak).toBe(0);
  });
  test("the submarine only takes boxes from a boat or the blimp", () => {
    const ctx = boot();
    at(ctx, 20);
    const spot = customerSpot("captain_brine")!;
    moveTo(ctx, spot);
    shiftStore.write(ctx, { ...shiftStore.read(ctx), bag: [{ id: "s1", customerId: "captain_brine", pizzaId: "pineapple_sub", heat: 90, soak: 0, age: 5, par: 60 }], nextCallIn: 999 });
    expect(ctx.game.commands.run("pizza.deliver", {}).status).toBe("rejected");
    ctx.scene.entity.spawn("car_sport", { id: "sub_ski", position: [spot[0], -0.4, spot[1]], role: "prop" });
    streetPlayOf(ctx).enterVehicle(ctx, "sub_ski");
    expect(ctx.game.commands.run("pizza.deliver", {}).status).not.toBe("rejected");
  });
  test("each shift names a special that pays a bonus on every box of it", () => {
    const ctx = boot();
    at(ctx, 18.1);
    run(ctx, 1);
    const special = shiftStore.read(ctx).special!;
    expect(special).toBeDefined();
    moveTo(ctx, customerSpot("gus")!);
    shiftStore.write(ctx, { ...shiftStore.read(ctx), bag: [{ id: "sp1", customerId: "gus", pizzaId: special, heat: 90, soak: 0, age: 10, par: 60 }], nextCallIn: 999 });
    ctx.game.commands.run("pizza.deliver", {});
    expect(shiftStore.read(ctx).lastReceipt!.lines.some((line) => line.label === "Tonight's special")).toBe(true);
  });
});

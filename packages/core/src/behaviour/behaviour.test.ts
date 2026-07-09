import { describe, expect, test } from "bun:test";
import {
  Behaviour,
  BehaviourModule,
  createBehaviourWorld,
  type BehaviourWorld,
} from "./behaviour";

class Recorder extends Behaviour {
  constructor(
    readonly label: string,
    readonly log: string[],
  ) {
    super();
  }
  override onAwake(): void {
    this.log.push(`${this.label}:awake`);
  }
  override onEnable(): void {
    this.log.push(`${this.label}:enable`);
  }
  override onStart(): void {
    this.log.push(`${this.label}:start`);
  }
  override onUpdate(dt: number): void {
    this.log.push(`${this.label}:update:${dt}`);
  }
  override onDisable(): void {
    this.log.push(`${this.label}:disable`);
  }
  override onDestroy(): void {
    this.log.push(`${this.label}:destroy`);
  }
}

class HookOnly extends Behaviour {
  awoke = 0;
  override onAwake(): void {
    this.awoke += 1;
  }
}

function startedWorld(): BehaviourWorld {
  const world = createBehaviourWorld();
  world.start();
  return world;
}

describe("lifecycle ordering", () => {
  test("bootstrap awakes every behaviour before any enable/start", () => {
    const world = createBehaviourWorld();
    const log: string[] = [];
    world.attach("a", new Recorder("a", log));
    world.attach("b", new Recorder("b", log));
    world.start();
    expect(log).toEqual(["a:awake", "b:awake", "a:enable", "a:start", "b:enable", "b:start"]);
  });

  test("post-start attach activates single-pass: awake, enable, start", () => {
    const world = startedWorld();
    const log: string[] = [];
    world.attach("a", new Recorder("a", log));
    expect(log).toEqual(["a:awake", "a:enable", "a:start"]);
  });

  test("awake and start fire once across disable/enable cycles; enable/disable fire each transition", () => {
    const world = startedWorld();
    const log: string[] = [];
    const b = world.attach("a", new Recorder("a", log));
    b.disable();
    b.enable();
    expect(log).toEqual(["a:awake", "a:enable", "a:start", "a:disable", "a:enable"]);
  });

  test("disabled behaviour on an active node still awakens during bootstrap, but does not enable/start", () => {
    const world = createBehaviourWorld();
    const log: string[] = [];
    const b = world.attach("a", new Recorder("a", log));
    b.disable();
    world.start();
    expect(log).toEqual(["a:awake"]);
    b.enable();
    expect(log).toEqual(["a:awake", "a:enable", "a:start"]);
  });

  test("destroy fires onDisable only when active, onDestroy always, exactly once", () => {
    const world = startedWorld();
    const activeLog: string[] = [];
    const active = world.attach("a", new Recorder("a", activeLog));
    active.destroy();
    active.destroy();
    expect(activeLog).toEqual(["a:awake", "a:enable", "a:start", "a:disable", "a:destroy"]);

    const dormantLog: string[] = [];
    const dormant = new Recorder("d", dormantLog);
    dormant.disable();
    world.attach("d", dormant);
    dormant.destroy();
    expect(dormantLog).toEqual(["d:destroy"]);
  });

  test("nodeId and world are unavailable in the constructor, available from onAwake", () => {
    class Probe extends Behaviour {
      sawNodeId: string | null = null;
      override onAwake(): void {
        this.sawNodeId = this.nodeId;
      }
    }
    const probe = new Probe();
    expect(() => probe.nodeId).toThrow();
    expect(() => probe.world).toThrow();
    const world = startedWorld();
    world.attach("n", probe);
    expect(probe.sawNodeId).toBe("n");
  });
});

describe("activation cascade", () => {
  test("deactivating a parent disables the whole subtree; reactivation restores per-child flags", () => {
    const world = createBehaviourWorld();
    const log: string[] = [];
    world.add("parent");
    world.add("kept", "parent");
    world.add("dropped", "parent");
    world.attach("kept", new Recorder("kept", log));
    world.attach("dropped", new Recorder("dropped", log));
    world.start();
    log.length = 0;

    world.setActive("dropped", false);
    expect(log).toEqual(["dropped:disable"]);
    log.length = 0;

    world.setActive("parent", false);
    expect(log).toEqual(["kept:disable"]);
    log.length = 0;

    world.setActive("parent", true);
    expect(log).toEqual(["kept:enable"]);
    expect(world.isActive("dropped")).toBe(false);
    expect(world.isActiveSelf("dropped")).toBe(false);
  });

  test("flipping activeSelf under an inactive ancestor changes only the flag", () => {
    const world = startedWorld();
    const log: string[] = [];
    world.add("parent");
    world.add("child", "parent");
    world.attach("child", new Recorder("child", log));
    log.length = 0;
    world.setActive("parent", false);
    world.setActive("child", false);
    world.setActive("child", true);
    expect(log).toEqual(["child:disable"]);
    expect(world.isActive("child")).toBe(false);
  });

  test("a subtree deactivated before start never awakens; first activation runs awake/enable/start", () => {
    const world = createBehaviourWorld();
    const log: string[] = [];
    world.add("parent");
    world.add("child", "parent");
    world.attach("child", new Recorder("child", log));
    world.setActive("parent", false);
    world.start();
    expect(log).toEqual([]);
    world.setActive("parent", true);
    expect(log).toEqual(["child:awake", "child:enable", "child:start"]);
  });

  test("deactivating a parent from a child's onStart during bootstrap", () => {
    const world = createBehaviourWorld();
    const log: string[] = [];
    class Saboteur extends Behaviour {
      override onStart(): void {
        this.world.setActive("parent", false);
      }
    }
    world.add("parent");
    world.add("first", "parent");
    world.add("second", "parent");
    world.attach("first", new Saboteur());
    world.attach("second", new Recorder("second", log));
    world.start();
    expect(log).toEqual(["second:awake"]);
    expect(world.isActive("second")).toBe(false);
  });

  test("setEnabled on a hierarchy-inactive node is flag-only until reactivation", () => {
    const world = startedWorld();
    const log: string[] = [];
    world.add("parent");
    world.add("child", "parent");
    const b = world.attach("child", new Recorder("child", log));
    log.length = 0;
    world.setActive("parent", false);
    b.disable();
    b.enable();
    expect(log).toEqual(["child:disable"]);
    world.setActive("parent", true);
    expect(log).toEqual(["child:disable", "child:enable"]);
  });

  test("reparenting under an inactive parent deactivates; back to an active one reactivates", () => {
    const world = startedWorld();
    const log: string[] = [];
    world.add("off");
    world.setActive("off", false);
    world.attach("mover", new Recorder("mover", log));
    log.length = 0;
    world.setParent("mover", "off");
    expect(log).toEqual(["mover:disable"]);
    world.setParent("mover", null);
    expect(log).toEqual(["mover:disable", "mover:enable"]);
  });

  test("setParent rejects cycles", () => {
    const world = startedWorld();
    world.add("a");
    world.add("b", "a");
    expect(() => world.setParent("a", "b")).toThrow();
  });

  test("unknown ids count active", () => {
    const world = startedWorld();
    expect(world.isActive("ghost")).toBe(true);
    expect(world.isActiveSelf("ghost")).toBe(true);
  });
});

describe("bootstrap gating", () => {
  test("behaviours attached during a module's onAwake defer activation until after modules subscribe", () => {
    const world = createBehaviourWorld();
    const order: string[] = [];
    class Ticker extends Behaviour {
      override onUpdate(): void {
        order.push("behaviour");
      }
    }
    class Spawner extends BehaviourModule {
      override onAwake(): void {
        this.world.attach("spawned", new Ticker());
      }
      override onUpdate(): void {
        order.push("module");
      }
    }
    world.addModules({ spawner: new Spawner() });
    world.start();
    world.update(1);
    expect(order).toEqual(["module", "behaviour"]);
  });

  test("nodes added during another behaviour's bootstrap hook activate in the same start()", () => {
    const world = createBehaviourWorld();
    const log: string[] = [];
    class Spawner extends Behaviour {
      override onAwake(): void {
        this.world.attach("late", new Recorder("late", log));
      }
    }
    world.attach("early", new Spawner());
    world.start();
    expect(log).toEqual(["late:awake", "late:enable", "late:start"]);
  });

  test("module onAwake all runs before module onStart", () => {
    const world = createBehaviourWorld();
    const order: string[] = [];
    class A extends BehaviourModule {
      override onAwake(): void {
        order.push("a:awake");
      }
      override onStart(): void {
        order.push("a:start");
      }
    }
    class B extends BehaviourModule {
      override onAwake(): void {
        order.push("b:awake");
      }
      override onStart(): void {
        order.push("b:start");
      }
    }
    world.addModules({ a: new A(), b: new B() });
    world.start();
    expect(order).toEqual(["a:awake", "b:awake", "a:start", "b:start"]);
  });

  test("addModules after start throws; duplicate keys throw", () => {
    const world = createBehaviourWorld();
    world.addModules({ m: new BehaviourModule() });
    expect(() => world.addModules({ m: new BehaviourModule() })).toThrow();
    world.start();
    expect(() => world.addModules({ other: new BehaviourModule() })).toThrow();
  });

  test("modules access siblings via this.modules from onStart", () => {
    const world = createBehaviourWorld();
    class Counter extends BehaviourModule {
      count = 41;
    }
    class Reader extends BehaviourModule {
      seen = 0;
      override onStart(): void {
        this.seen = (this.modules["counter"] as Counter).count + 1;
      }
    }
    const reader = new Reader();
    world.addModules({ counter: new Counter(), reader });
    world.start();
    expect(reader.seen).toBe(42);
  });
});

describe("lazy update dispatch", () => {
  test("a behaviour that does not override onUpdate never joins dispatch; the check runs at activation time", () => {
    const world = startedWorld();
    const plain = world.attach("a", new HookOnly());
    expect(plain.awoke).toBe(1);
    let called = 0;
    plain.onUpdate = () => {
      called += 1;
    };
    world.update(1);
    expect(called).toBe(0);
    plain.disable();
    plain.enable();
    world.update(1);
    expect(called).toBe(1);
  });

  test("update receives dt and stops while disabled, resumes on enable at the end of dispatch order", () => {
    const world = startedWorld();
    const log: string[] = [];
    const first = world.attach("a", new Recorder("a", log));
    world.attach("b", new Recorder("b", log));
    log.length = 0;
    world.update(1);
    expect(log).toEqual(["a:update:1", "b:update:1"]);
    log.length = 0;
    first.disable();
    world.update(2);
    first.enable();
    log.length = 0;
    world.update(3);
    expect(log).toEqual(["b:update:3", "a:update:3"]);
  });

  test("an instance-assigned onUpdate arrow also subscribes", () => {
    const world = startedWorld();
    let ticks = 0;
    const b = new Behaviour();
    b.onUpdate = () => {
      ticks += 1;
    };
    world.attach("a", b);
    world.update(1);
    expect(ticks).toBe(1);
  });

  test("a behaviour attached during dispatch first updates on the next update", () => {
    const world = startedWorld();
    const ticks: string[] = [];
    class Late extends Behaviour {
      override onUpdate(): void {
        ticks.push("late");
      }
    }
    class Spawner extends Behaviour {
      spawned = false;
      override onUpdate(): void {
        ticks.push("spawner");
        if (!this.spawned) {
          this.spawned = true;
          this.world.attach("late", new Late());
        }
      }
    }
    world.attach("s", new Spawner());
    world.update(1);
    expect(ticks).toEqual(["spawner"]);
    world.update(1);
    expect(ticks).toEqual(["spawner", "spawner", "late"]);
  });

  test("module updates dispatch before behaviour updates every frame", () => {
    const world = createBehaviourWorld();
    const order: string[] = [];
    class Mod extends BehaviourModule {
      override onUpdate(dt: number): void {
        order.push(`module:${dt}`);
      }
    }
    class Beh extends Behaviour {
      override onUpdate(dt: number): void {
        order.push(`behaviour:${dt}`);
      }
    }
    world.addModules({ mod: new Mod() });
    world.attach("a", new Beh());
    world.start();
    world.update(5);
    expect(order).toEqual(["module:5", "behaviour:5"]);
  });
});

describe("node and world teardown", () => {
  test("destroyNode destroys the whole subtree parent-first and removes the nodes", () => {
    const world = startedWorld();
    const log: string[] = [];
    world.add("parent");
    world.add("child", "parent");
    world.attach("parent", new Recorder("parent", log));
    world.attach("child", new Recorder("child", log));
    log.length = 0;
    expect(world.destroyNode("parent")).toBe(true);
    expect(log).toEqual(["parent:disable", "parent:destroy", "child:disable", "child:destroy"]);
    expect(world.has("parent")).toBe(false);
    expect(world.has("child")).toBe(false);
    expect(world.destroyNode("parent")).toBe(false);
  });

  test("destroyed behaviours stop receiving updates", () => {
    const world = startedWorld();
    const log: string[] = [];
    world.attach("a", new Recorder("a", log));
    world.destroyNode("a");
    log.length = 0;
    world.update(1);
    expect(log).toEqual([]);
  });

  test("world.destroy tears down every node", () => {
    const world = startedWorld();
    const log: string[] = [];
    world.add("x");
    world.add("y", "x");
    world.attach("y", new Recorder("y", log));
    log.length = 0;
    world.destroy();
    expect(log).toEqual(["y:disable", "y:destroy"]);
    expect(world.has("x")).toBe(false);
    world.update(1);
    expect(log).toEqual(["y:disable", "y:destroy"]);
  });

  test("attach auto-creates root nodes keyed by entity-style ids", () => {
    const world = startedWorld();
    world.attach("entity-7", new HookOnly());
    expect(world.has("entity-7")).toBe(true);
    expect(world.parentOf("entity-7")).toBe(null);
    expect(world.childrenOf("entity-7")).toEqual([]);
  });
});

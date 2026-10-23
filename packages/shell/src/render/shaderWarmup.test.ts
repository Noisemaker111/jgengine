import { describe, expect, test } from "bun:test";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, Scene } from "three";

import {
  compileSubset,
  createShaderWarmup,
  planFirstFrame,
  SHADER_WARMUP_DEFAULTS,
  type ShaderWarmupOptions,
  type ShaderWarmupState,
} from "./shaderWarmup";

/** The covered wait is a floor per round plus the budget, which the tests bound instead of guessing. */
function planBudget(budgetMs: number): number {
  return budgetMs + SHADER_WARMUP_DEFAULTS.planFloorMs + 50;
}

interface FakeProgram {
  isReady(): boolean;
}

/** A frozen clock with a fake that never stops linking would grow forever; fail loudly instead. */
const MAX_FIXTURE_ROUNDS = 200;
const MAX_FIXTURE_PROGRAMS = 400;

function fixture(
  overrides: Partial<ShaderWarmupOptions> & { linkPerRound?: readonly number[]; readyAfterPolls?: number } = {},
) {
  const { linkPerRound = [3], readyAfterPolls = 0, ...rest } = overrides;
  const rounds: number[] = [];
  let starts = 0;
  const states: ShaderWarmupState[] = [];
  const renderer = {
    info: { programs: [] as FakeProgram[] },
    compile() {
      if (rounds.length >= MAX_FIXTURE_ROUNDS || renderer.info.programs.length >= MAX_FIXTURE_PROGRAMS) {
        throw new Error("warmup fixture: a frozen clock let the rounds run away");
      }
      rounds.push(rounds.length);
      const linked = linkPerRound[rounds.length - 1] ?? 0;
      for (let i = 0; i < linked; i += 1) {
        let polls = 0;
        renderer.info.programs.push({ isReady: () => polls++ >= readyAfterPolls });
      }
    },
  };
  const warmup = createShaderWarmup({
    renderer,
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    quietMs: 0,
    sleep: async () => {},
    now: () => 0,
    loaderQuiet: () => true,
    loaderStarts: () => starts,
    onState: (state) => states.push(state),
    ...rest,
  });
  return {
    warmup,
    rounds,
    states,
    renderer,
    /** Simulate a new burst of model loading between rounds. */
    stream: () => {
      starts += 1;
    },
  };
}

function meshAt(x: number, y = 0, z = 0, material = new MeshBasicMaterial()): Mesh {
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), material);
  mesh.position.set(x, y, z);
  return mesh;
}

describe("planFirstFrame", () => {
  test("keeps what the camera can see and defers the rest", () => {
    const scene = new Scene();
    const near = meshAt(0, 0, -5);
    const behind = meshAt(0, 0, 40);
    scene.add(near, behind);
    const camera = new PerspectiveCamera(55, 16 / 9, 0.1, 200);

    const plan = planFirstFrame(scene, camera);

    expect(plan.objects.has(near)).toBe(true);
    expect(plan.objects.has(behind)).toBe(false);
    expect(plan.reachable).toBe(1);
    expect(plan.deferred).toBe(1);
  });

  test("drops hidden subtrees whole, so a preloaded room is not compiled", () => {
    const scene = new Scene();
    const room = new Group();
    room.visible = false;
    const prop = meshAt(0, 0, -5);
    room.add(prop);
    scene.add(room);
    const camera = new PerspectiveCamera(55, 16 / 9, 0.1, 200);

    const plan = planFirstFrame(scene, camera);

    expect(plan.objects.has(prop)).toBe(false);
    expect(plan.deferred).toBe(1);
  });

  test("drops a layer the camera does not render", () => {
    const scene = new Scene();
    const hidden = meshAt(0, 0, -5);
    hidden.layers.set(3);
    scene.add(hidden);
    const camera = new PerspectiveCamera(55, 16 / 9, 0.1, 200);

    expect(planFirstFrame(scene, camera).reachable).toBe(0);
  });

  test("keeps shadow casters the camera has not turned to yet, because the shadow pass draws them", () => {
    const scene = new Scene();
    const caster = meshAt(0, 0, 60);
    caster.castShadow = true;
    scene.add(caster);
    const camera = new PerspectiveCamera(55, 16 / 9, 0.1, 200);

    expect(planFirstFrame(scene, camera).objects.has(caster)).toBe(true);
  });

  test("keeps unsullied drawables such as a sky dome", () => {
    const scene = new Scene();
    const sky = meshAt(0, 0, 0);
    sky.frustumCulled = false;
    scene.add(sky);
    const camera = new PerspectiveCamera(55, 16 / 9, 0.1, 200);

    expect(planFirstFrame(scene, camera).objects.has(sky)).toBe(true);
  });
});

describe("compileSubset", () => {
  test("compiles only the kept drawables and puts the rest back exactly once", () => {
    const scene = new Scene();
    const first = meshAt(0, 0, -5);
    const second = meshAt(1, 0, -5);
    const third = meshAt(2, 0, -5);
    scene.add(first, second, third);
    const seen: string[] = [];
    const renderer = {
      compile(object: Object3D) {
        const names: string[] = [];
        object.traverse((node) => {
          if ((node as Mesh).isMesh === true) names.push(node.uuid);
        });
        seen.push(names.sort().join(","));
      },
    };
    const order = () => scene.children.map((child) => child.uuid);

    compileSubset(renderer, scene, new PerspectiveCamera(), (object) => object !== second);

    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe([first.uuid, third.uuid].sort().join(","));
    expect(order()).toEqual([first.uuid, second.uuid, third.uuid]);
    expect(second.parent).toBe(scene);
  });
});

describe("createShaderWarmup", () => {
  test("compiles the first frame's reachable set and stops waiting once the driver reports it usable", async () => {
    const { warmup, rounds, states } = fixture();
    const final = await warmup.done;

    expect(rounds[0]).toBe(0);
    expect(final.phase).toBe("ready");
    // One round queues the plan, the next confirms nothing new landed.
    expect(final.rounds).toBeGreaterThanOrEqual(1);
    expect(final.programs).toBe(3);
    expect(states.some((state) => state.phase === "compiling")).toBe(true);
  });

  test("does not hold the reveal for a scene that keeps streaming", async () => {
    let clock = 0;
    const { warmup, states } = fixture({
      linkPerRound: [1, 1, 1, 1],
      quietMs: 100,
      planBudgetMs: 400,
      backgroundMs: 0,
      sleep: async (ms) => {
        clock += ms;
      },
      now: () => clock,
      loaderQuiet: () => false,
    });
    const final = await warmup.done;

    expect(final.phase).toBe("ready");
    expect(final.elapsedMs).toBeLessThanOrEqual(planBudget(400));
    expect(states.at(-1)?.phase).toBe("ready");
  });

  test("waits for the driver to report every planned program usable", async () => {
    let clock = 0;
    const { warmup, rounds } = fixture({
      linkPerRound: [2],
      readyAfterPolls: 3,
      backgroundMs: 0,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });
    const final = await warmup.done;

    expect(rounds[0]).toBe(0);
    expect(final.phase).toBe("ready");
    expect(clock).toBeGreaterThanOrEqual(20);
  });

  test("a renderer that refuses to compile still releases the loading screen", async () => {
    const states: ShaderWarmupState[] = [];
    const warmup = createShaderWarmup({
      renderer: {
        info: { programs: [] },
        compile() {
          throw new Error("GL context lost");
        },
      },
      scene: new Scene(),
      camera: new PerspectiveCamera(),
      quietMs: 0,
      backgroundMs: 0,
      loaderQuiet: () => true,
      onState: (state) => states.push(state),
    });
    const final = await warmup.done;

    expect(final.phase).toBe("failed");
    expect(states.at(-1)?.phase).toBe("failed");
  });

  test("a program that never reports usable is cut off by the plan floor", async () => {
    const started = Date.now();
    const warmup = createShaderWarmup({
      renderer: {
        info: { programs: [{ isReady: () => false }] },
        compile() {
          this.info.programs.push({ isReady: () => false });
        },
      },
      scene: new Scene(),
      camera: new PerspectiveCamera(),
      planBudgetMs: 0,
      backgroundMs: 0,
      quietMs: 0,
    });
    const final = await warmup.done;

    expect(final.phase).toBe("ready");
    expect(Date.now() - started).toBeGreaterThanOrEqual(1_000);
  }, 10_000);

  test("cancel stops the next round but resolves the promise", async () => {
    let clock = 0;
    const { warmup, rounds } = fixture({
      quietMs: 100,
      planBudgetMs: 10_000,
      backgroundMs: 0,
      sleep: async (ms) => {
        clock += ms;
        warmup.cancel();
      },
      now: () => clock,
      loaderQuiet: () => false,
    });
    const final = await warmup.done;

    expect(rounds).toHaveLength(1);
    expect(final.phase).toBe("ready");
  });

  test("keeps compiling content that streamed in after the reveal, without touching the cover", async () => {
    let clock = 0;
    const compiles: number[] = [];
    let compilesAtReveal = -1;
    const renderer = {
      info: { programs: [] as FakeProgram[] },
      compile() {
        compiles.push(clock);
        renderer.info.programs.push({ isReady: () => true });
      },
    };
    const warmup = createShaderWarmup({
      renderer,
      scene: new Scene(),
      camera: new PerspectiveCamera(),
      quietMs: 0,
      backgroundMs: 500,
      backgroundEveryMs: 50,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
      loaderQuiet: () => true,
      loaderStarts: () => 0,
      onState: (state) => {
        if (state.phase === "ready" && compilesAtReveal === -1) compilesAtReveal = compiles.length;
      },
    });
    const final = await warmup.done;
    const coveredRoundCount = final.rounds;
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(final.phase).toBe("ready");
    expect(compilesAtReveal).toBeGreaterThan(0);
    // Background rounds queue links for late content and never extend the covered round count.
    expect(warmup.state().rounds).toBe(coveredRoundCount);
    expect(compiles.length).toBeGreaterThan(compilesAtReveal);
  });
});

describe("createShaderWarmup frame target", () => {
  test("compiles with the frame's render target bound, then puts the renderer back", async () => {
    const canvas = { name: "canvas" };
    let bound: unknown = canvas;
    const boundDuringCompile: unknown[] = [];
    const renderer = {
      info: { programs: [] as FakeProgram[] },
      getRenderTarget: () => bound,
      setRenderTarget: (target: unknown) => {
        bound = target;
      },
      compile() {
        if (renderer.info.programs.length > 0) return;
        boundDuringCompile.push(bound);
        renderer.info.programs.push({ isReady: () => true });
      },
    };
    const warmup = createShaderWarmup({
      renderer,
      scene: new Scene(),
      camera: new PerspectiveCamera(),
      quietMs: 0,
      planBudgetMs: 500,
      backgroundMs: 0,
      now: () => 0,
      sleep: async () => {},
      loaderQuiet: () => true,
      loaderStarts: () => 0,
      sceneDrawsToTarget: () => true,
    });
    await warmup.done;

    expect(boundDuringCompile.length).toBeGreaterThan(0);
    // A bound target is what makes three build the linear, untone-mapped program the post chain draws.
    for (const target of boundDuringCompile) expect(target).not.toBeNull();
    expect(boundDuringCompile[0]).not.toBe(canvas);
    expect(bound).toBe(canvas);
    expect(renderer.info.programs.length).toBe(1);
  });

  test("leaves the renderer's target alone when the frame draws to the canvas", async () => {
    let setCalls = 0;
    const renderer = {
      info: { programs: [] as FakeProgram[] },
      getRenderTarget: () => null,
      setRenderTarget: () => {
        setCalls += 1;
      },
      compile() {
        if (renderer.info.programs.length > 0) return;
        renderer.info.programs.push({ isReady: () => true });
      },
    };
    const warmup = createShaderWarmup({
      renderer,
      scene: new Scene(),
      camera: new PerspectiveCamera(),
      quietMs: 0,
      planBudgetMs: 500,
      backgroundMs: 0,
      now: () => 0,
      sleep: async () => {},
      loaderQuiet: () => true,
      loaderStarts: () => 0,
      sceneDrawsToTarget: () => false,
    });
    await warmup.done;

    expect(setCalls).toBe(0);
    expect(renderer.info.programs.length).toBe(1);
  });

  test("restores the renderer's target when the compile throws", async () => {
    const canvas = { name: "canvas" };
    let bound: unknown = canvas;
    const renderer = {
      info: { programs: [] as FakeProgram[] },
      getRenderTarget: () => bound,
      setRenderTarget: (target: unknown) => {
        bound = target;
      },
      compile(): void {
        throw new Error("driver refused");
      },
    };
    const warmup = createShaderWarmup({
      renderer,
      scene: new Scene(),
      camera: new PerspectiveCamera(),
      quietMs: 0,
      planBudgetMs: 500,
      backgroundMs: 0,
      now: () => 0,
      sleep: async () => {},
      loaderQuiet: () => true,
      loaderStarts: () => 0,
      sceneDrawsToTarget: () => true,
    });
    const final = await warmup.done;

    expect(final.phase).toBe("failed");
    expect(bound).toBe(canvas);
  });
});

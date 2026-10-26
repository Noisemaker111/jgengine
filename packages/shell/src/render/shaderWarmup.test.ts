import { describe, expect, test } from "bun:test";
import { BoxGeometry, DataTexture, DirectionalLight, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshDepthMaterial, MeshNormalMaterial, Object3D, OrthographicCamera, PerspectiveCamera, PointLight, Scene, WebGLRenderTarget, type Material } from "three";

import {
  batchByProgram,
  compileObjects,
  drawSubset,
  createShaderWarmup,
  gpuFence,
  drawsHeld,
  firstUnlinkedDrawable,
  holdDraws,
  warmupDraws,
  warmupDrawsToTarget,
  warmupWaitsFor,
  type HeldDraw,
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

  test("keeps shadow casters the camera has not turned to yet apart: the shadow pass needs only their depth programs", () => {
    const scene = new Scene();
    const caster = meshAt(0, 0, 60);
    caster.castShadow = true;
    const behind = meshAt(0, 0, 60);
    scene.add(caster, behind);
    const camera = new PerspectiveCamera(55, 16 / 9, 0.1, 200);

    const plan = planFirstFrame(scene, camera);
    expect(plan.casters.has(caster)).toBe(true);
    expect(plan.objects.has(caster)).toBe(false);
    expect(plan.casters.has(behind)).toBe(false);
  });

  test("keeps an instanced mesh whose instances reach the view though its origin does not", () => {
    const scene = new Scene();
    const cars = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial(), 2);
    cars.position.set(0, 0, 60);
    cars.setMatrixAt(0, new Matrix4());
    cars.setMatrixAt(1, new Matrix4().makeTranslation(0, 0, -120));
    scene.add(cars);
    const camera = new PerspectiveCamera(55, 16 / 9, 0.1, 200);

    expect(planFirstFrame(scene, camera).objects.has(cars)).toBe(true);
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

describe("compileObjects", () => {
  test("compiles only the given drawables, lit by the scene, and leaves the graph untouched", () => {
    const scene = new Scene();
    const first = meshAt(0, 0, -5);
    const second = meshAt(1, 0, -5);
    const third = meshAt(2, 0, -5);
    // A lamp under a drawable: its light belongs to the scene's lights, not to the compiled batch.
    const lamp = new PointLight();
    first.add(lamp);
    scene.add(first, second, third);
    const seen: string[] = [];
    let lightsFrom: Object3D | undefined;
    let batchLights = 0;
    const renderer = {
      compile(object: Object3D, _camera: unknown, target?: Object3D) {
        lightsFrom = target;
        const names: string[] = [];
        object.traverse((node) => {
          if ((node as Mesh).isMesh === true) names.push(node.uuid);
          if ((node as PointLight).isLight === true) batchLights += 1;
        });
        seen.push(names.sort().join(","));
      },
    };
    const before = scene.children.slice();

    compileObjects(renderer, scene, new PerspectiveCamera(), [first, third]);

    expect(seen).toEqual([[first.uuid, third.uuid].sort().join(",")]);
    expect(lightsFrom).toBe(scene);
    expect(batchLights).toBe(0);
    expect(scene.children).toEqual(before);
    expect(first.children).toEqual([lamp]);
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
    const scene = new Scene();
    const warmup = createShaderWarmup({
      renderer,
      scene,
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
        if (state.phase !== "ready" || compilesAtReveal !== -1) return;
        compilesAtReveal = compiles.length;
        // A model that lands after the reveal: the background links it.
        scene.add(meshAt(0, 0, -5));
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

describe("preparing the view a cover hid", () => {
  /** A renderer that links one program per material it has not seen, as three does. */
  function linkingRenderer() {
    const seen = new Set<string>();
    const renderer = {
      info: { programs: [] as FakeProgram[] },
      compiled: [] as string[],
      compile(root: Object3D) {
        root.traverse((object) => {
          const material = (object as Mesh).material as Material | undefined;
          if (material === undefined || seen.has(material.uuid)) return;
          seen.add(material.uuid);
          renderer.compiled.push(material.name);
          renderer.info.programs.push({ isReady: () => true });
        });
      },
    };
    return renderer;
  }

  test("links what was mounted since the reveal before it resolves, and leaves the cover down", async () => {
    let clock = 0;
    const renderer = linkingRenderer();
    const scene = new Scene();
    scene.add(meshAt(0, 0, -5, Object.assign(new MeshBasicMaterial(), { name: "menu" })));
    const states: ShaderWarmupState[] = [];
    const warmup = createShaderWarmup({
      renderer,
      scene,
      camera: new PerspectiveCamera(),
      quietMs: 0,
      backgroundMs: 0,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
      loaderQuiet: () => true,
      loaderStarts: () => 0,
      onState: (state) => states.push(state),
    });
    await warmup.done;
    expect(renderer.compiled).toEqual(["menu"]);

    // Play mounts the level: a new material, behind the camera too.
    scene.add(meshAt(0, 0, 5, Object.assign(new MeshNormalMaterial(), { name: "level" })));
    const shown = states.length;
    await warmup.prepare();
    expect(renderer.compiled).toEqual(["menu", "level"]);
    expect(states.slice(shown).some((state) => state.phase !== "ready"), "a quick prepare must not flash the cover").toBe(false);

    const before = renderer.compiled.length;
    await warmup.prepare();
    expect(renderer.compiled.length, "nothing new links nothing").toBe(before);
  });

  test("a frame would link mid-draw only for a visible drawable whose program is missing or still building", () => {
    const programs = new Map<object, { currentProgram?: FakeProgram }>();
    const renderer = { properties: { get: (material: object) => programs.get(material) ?? {} } };
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    const linked = meshAt(0);
    programs.set(linked.material as object, { currentProgram: { isReady: () => true } });
    scene.add(linked);
    expect(firstUnlinkedDrawable(renderer, scene, camera)).toBeNull();

    const hidden = meshAt(1);
    hidden.visible = false;
    scene.add(hidden);
    expect(firstUnlinkedDrawable(renderer, scene, camera), "a hidden mesh is not drawn").toBeNull();

    const building = meshAt(2);
    programs.set(building.material as object, { currentProgram: { isReady: () => false } });
    scene.add(building);
    expect(firstUnlinkedDrawable(renderer, scene, camera), "a program still building would be waited on in the draw").toBe(building);
    scene.remove(building);

    const added = meshAt(3);
    scene.add(added);
    expect(firstUnlinkedDrawable(renderer, scene, camera), "a new material has no program yet").toBe(added);
  });

  test("waits for models the press started loading, then links them", async () => {
    let clock = 0;
    let loading = false;
    const renderer = linkingRenderer();
    const scene = new Scene();
    const warmup = createShaderWarmup({
      renderer,
      scene,
      camera: new PerspectiveCamera(),
      quietMs: 0,
      backgroundMs: 0,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
        // The model lands while the prepare waits on the loader.
        if (loading && clock >= 1_000) {
          loading = false;
          scene.add(meshAt(0, 0, -5, Object.assign(new MeshBasicMaterial(), { name: "landed" })));
        }
      },
      loaderQuiet: () => !loading,
      loaderStarts: () => 0,
    });
    await warmup.done;
    loading = true;
    clock = 0;
    await warmup.prepare();
    expect(renderer.compiled).toContain("landed");
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

describe("batchByProgram", () => {
  test("puts at most the batch size of distinct materials in a flush, and every drawable in one batch", () => {
    const shared = new MeshBasicMaterial();
    const objects = [meshAt(0, 0, 0, shared), meshAt(1, 0, 0, shared), meshAt(2), meshAt(3), meshAt(4), new Group()];
    const batches = batchByProgram(objects, 2);

    expect(batches).toHaveLength(2);
    expect([...batches[0]!]).toEqual([objects[0]!, objects[1]!, objects[2]!]);
    expect([...batches[1]!]).toEqual([objects[3]!, objects[4]!]);
  });
});

describe("gpuFence", () => {
  test("polls a zero-timeout fence until the GPU reports it signalled, then frees it", async () => {
    const calls: string[] = [];
    let polls = 0;
    const gl = {
      SYNC_GPU_COMMANDS_COMPLETE: 1,
      ALREADY_SIGNALED: 2,
      CONDITION_SATISFIED: 3,
      WAIT_FAILED: 4,
      fenceSync: () => (calls.push("fence"), { id: 1 }),
      flush: () => calls.push("flush"),
      clientWaitSync: (_sync: unknown, _flags: number, timeout: number) => {
        calls.push(`wait:${timeout}`);
        return ++polls >= 3 ? 2 : 5;
      },
      deleteSync: () => calls.push("delete"),
    };
    await gpuFence(gl, async () => {}, () => false);

    expect(calls).toEqual(["fence", "flush", "wait:0", "wait:0", "wait:0", "delete"]);
  });

  test("without a WebGL2 context it only yields", async () => {
    let slept = 0;
    await gpuFence({}, async () => {
      slept += 1;
    }, () => false);
    expect(slept).toBe(1);
  });
});

describe("holdDraws", () => {
  test("stops draws until released, then restores the renderer's own method", () => {
    let draws = 0;
    class FakeRenderer {
      render() {
        draws += 1;
      }
    }
    const renderer = new FakeRenderer();
    const release = holdDraws(renderer);
    renderer.render();
    expect(draws).toBe(0);
    release();
    renderer.render();
    expect(draws).toBe(1);
    expect(Object.prototype.hasOwnProperty.call(renderer, "render")).toBe(false);
  });

  test("holds only while asked, reports what it held, and passes through under a later wrapper", () => {
    const drawn: Object3D[] = [];
    const renderer = {
      render(scene: Object3D) {
        drawn.push(scene);
      },
      getRenderTarget: () => "target",
    };
    let holding = true;
    const held: HeldDraw[] = [];
    const release = holdDraws(renderer as never, { holding: () => holding, onHeld: (draw) => held.push(draw) });
    const scene = new Scene();
    scene.overrideMaterial = new MeshNormalMaterial();
    const camera = new PerspectiveCamera();
    renderer.render(scene);
    (renderer.render as (scene: Object3D, camera: PerspectiveCamera) => void)(scene, camera);
    expect(drawn).toEqual([]);
    expect(held[1]).toEqual({ object: scene, camera, target: "target", override: scene.overrideMaterial, material: null });
    holding = false;
    const bake = new Scene();
    renderer.render(bake);
    expect(drawn).toEqual([bake]);
    // Something wraps render after the hold: release leaves the wrapper and the hold passes through.
    holding = true;
    const inner = renderer.render;
    const wrapper = (target: Object3D) => inner.call(renderer, target);
    renderer.render = wrapper;
    release();
    renderer.render(scene);
    expect(renderer.render).toBe(wrapper);
    expect(drawn).toEqual([bake, scene]);
  });
});

describe("createShaderWarmup links what the first frame draws outside the scene's own materials", () => {
  function linkingRenderer() {
    const compiled: { root: Object3D; materials: Material[]; target: unknown; lightsFrom: Object3D | undefined }[] = [];
    let bound: unknown = null;
    const linked = new Set<string>();
    const renderer = {
      info: { programs: [] as FakeProgram[] },
      shadowMap: { enabled: true },
      getRenderTarget: () => bound,
      setRenderTarget: (target: unknown) => {
        bound = target;
      },
      compile(root: Object3D, _camera: unknown, lightsFrom?: Object3D) {
        const materials: Material[] = [];
        root.traverse((object) => {
          const material = (object as Mesh).material as Material | Material[] | undefined;
          if (material !== undefined) materials.push(...(Array.isArray(material) ? material : [material]));
        });
        compiled.push({ root, materials, target: bound, lightsFrom });
        // One program per material and target, the way a cached link would come back.
        for (const material of materials) {
          const key = `${material.uuid}|${String(bound)}`;
          if (linked.has(key)) continue;
          linked.add(key);
          renderer.info.programs.push({ isReady: () => true });
        }
      },
    };
    return { renderer, compiled };
  }

  test("post-processing quads and an override-material pass held by the frame loop are linked against their own targets", async () => {
    const scene = new Scene();
    const mesh = meshAt(0, 0, -5);
    scene.add(mesh);
    const camera = new PerspectiveCamera();
    const { renderer, compiled } = linkingRenderer();
    const blur = new MeshBasicMaterial();
    const blend = new MeshBasicMaterial();
    const quad = new Mesh(new BoxGeometry(), blur);
    const normals = new MeshNormalMaterial();
    const quadCamera = new OrthographicCamera();
    // One quad drawn with two materials, the way a pass chain swaps a full-screen quad's material.
    let draws: HeldDraw[] = [
      { object: scene, camera, target: "scene-target", override: null, material: null },
      { object: scene, camera, target: "normal-target", override: normals, material: null },
      { object: quad, camera: quadCamera, target: "blur-target", override: null, material: blur },
      { object: quad, camera: quadCamera, target: null, override: null, material: blend },
      { object: quad, camera: quadCamera, target: null, override: null, material: blend },
    ];
    quad.material = new MeshBasicMaterial();
    const warmup = createShaderWarmup({
      renderer,
      scene,
      camera,
      quietMs: 0,
      backgroundMs: 0,
      sleep: async () => {},
      loaderQuiet: () => true,
      takeHeldDraws: () => {
        const taken = draws;
        draws = [];
        return taken;
      },
    });
    await warmup.done;

    const quadLinks = compiled.filter((entry) => Object.getPrototypeOf(entry.root) === quad);
    expect(quadLinks.map((entry) => [entry.materials[0], entry.target])).toEqual([
      [blur, "blur-target"],
      [blend, null],
    ]);
    const overrideLinks = compiled.filter((entry) => entry.materials.includes(normals));
    expect(overrideLinks).toHaveLength(1);
    expect(overrideLinks[0]!.target).toBe("normal-target");
    expect(overrideLinks[0]!.lightsFrom).toBe(scene);
    // The stand-in reads the real mesh's geometry but never moves the real mesh or its material.
    expect(mesh.parent).toBe(scene);
    expect(mesh.material).toBeInstanceOf(MeshBasicMaterial);
  });

  test("a registered drawer runs with every draw held, so a chain the covered frame loop never ran is linked", async () => {
    const scene = new Scene();
    scene.add(meshAt(0, 0, -5));
    const camera = new PerspectiveCamera();
    const { renderer, compiled } = linkingRenderer();
    const quadCamera = new OrthographicCamera();
    const tone = new MeshBasicMaterial();
    const quad = new Mesh(new BoxGeometry(), tone);
    const reached: unknown[] = [];
    const drawing = Object.assign(renderer, {
      render(object: unknown) {
        reached.push(object);
      },
    });
    let held: HeldDraw[] = [];
    // The gate's hold: only the frame loop's draws, and the frame loop is not running.
    const release = holdDraws(drawing as never, { holding: () => false, onHeld: (draw) => held.push(draw) });
    const unregister = warmupDraws(scene, () => drawing.render(quad));
    const warmup = createShaderWarmup({
      renderer,
      scene,
      camera,
      quietMs: 0,
      backgroundMs: 0,
      sleep: async () => {},
      loaderQuiet: () => true,
      takeHeldDraws: () => {
        const taken = held;
        held = [];
        return taken;
      },
    });
    await warmup.done;
    unregister();
    release();

    expect(compiled.some((entry) => Object.getPrototypeOf(entry.root) === quad && entry.materials[0] === tone)).toBe(true);
    // Held, never drawn for real while the drawer ran.
    expect(reached.filter((object) => object === quad).length).toBeLessThanOrEqual(1);
    drawing.render(quad);
    expect(reached.at(-1)).toBe(quad);
  });

  test("shadow casters link the depth program the shadow pass draws them with, into a target", async () => {
    const scene = new Scene();
    const caster = meshAt(0, 0, -5);
    caster.castShadow = true;
    const plain = meshAt(1, 0, -5);
    scene.add(caster, plain);
    const sun = new DirectionalLight();
    sun.castShadow = true;
    scene.add(sun);
    const { renderer, compiled } = linkingRenderer();
    const warmup = createShaderWarmup({ renderer, scene, camera: new PerspectiveCamera(), quietMs: 0, backgroundMs: 0, sleep: async () => {}, loaderQuiet: () => true });
    await warmup.done;

    const depthLinks = compiled.filter((entry) => entry.materials.some((material) => material instanceof MeshDepthMaterial));
    expect(depthLinks).toHaveLength(1);
    expect(depthLinks[0]!.materials).toHaveLength(1);
    expect(depthLinks[0]!.target).not.toBeNull();
    // The shadow pass draws with the frame's lights but none of the scene's fog or environment.
    expect(depthLinks[0]!.root.children).toContain(sun);
    expect(depthLinks[0]!.lightsFrom).not.toBe(scene);
  });

  test("waits for work that changes every program, such as the environment bake, before the first link", async () => {
    const scene = new Scene();
    scene.add(meshAt(0, 0, -5));
    const { renderer, compiled } = linkingRenderer();
    let finishBake: () => void = () => {};
    warmupWaitsFor(scene, new Promise<void>((resolve) => (finishBake = resolve)));
    const warmup = createShaderWarmup({ renderer, scene, camera: new PerspectiveCamera(), quietMs: 0, backgroundMs: 0, loaderQuiet: () => true });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(compiled).toHaveLength(0);
    finishBake();
    await warmup.done;
    expect(compiled.length).toBeGreaterThan(0);
  });
});

describe("texture uploads under the cover", () => {
  function loadedTexture(): DataTexture {
    const texture = new DataTexture(new Uint8Array(4), 1, 1);
    texture.needsUpdate = true;
    return texture;
  }

  test("sends what the first view samples, and only a caster's cut-out map for the shadow pass", async () => {
    const scene = new Scene();
    scene.add(new DirectionalLight());
    const camera = new PerspectiveCamera(55, 16 / 9, 0.1, 200);
    const seen = loadedTexture();
    const inView = meshAt(0, 0, -5, new MeshBasicMaterial({ map: seen }));
    const lit = loadedTexture();
    const solidCaster = meshAt(0, 0, 60, new MeshBasicMaterial({ map: lit }));
    const leaves = loadedTexture();
    const cutOutCaster = meshAt(2, 0, 60, new MeshBasicMaterial({ map: leaves, alphaTest: 0.5 }));
    for (const caster of [solidCaster, cutOutCaster]) caster.castShadow = true;
    scene.add(inView, solidCaster, cutOutCaster);
    const uploads: unknown[] = [];
    const linked = new Set<Material>();
    let revealed = false;
    const renderer = {
      info: { programs: [] as FakeProgram[] },
      shadowMap: { enabled: true },
      getRenderTarget: () => null,
      setRenderTarget: () => {},
      compile(root: Object3D) {
        // One program per material, the way a cached link comes back.
        root.traverse((object) => {
          const material = (object as Mesh).material as Material | undefined;
          if (material === undefined || linked.has(material)) return;
          linked.add(material);
          renderer.info.programs.push({ isReady: () => true });
        });
      },
      initTexture(texture: never) {
        if (!revealed) uploads.push(texture);
      },
    };
    const warmup = createShaderWarmup({ renderer, scene, camera, quietMs: 0, backgroundMs: 0, sleep: async () => {}, loaderQuiet: () => true });
    await warmup.done;
    revealed = true;

    expect(uploads).toContain(seen);
    expect(uploads).toContain(leaves);
    expect(uploads).not.toContain(lit);
  });
});

describe("createShaderWarmup batching", () => {
  test("links a big first frame a few programs per flush with a fence between flushes", async () => {
    const scene = new Scene();
    for (let i = 0; i < 7; i += 1) scene.add(meshAt(0, 0, -5 - i));
    const camera = new PerspectiveCamera();
    const flushes: number[] = [];
    let fences = 0;
    const renderer = {
      info: { programs: [] as FakeProgram[] },
      compile(root: Object3D) {
        let drawables = 0;
        root.traverse((object) => {
          if ((object as Mesh).isMesh) drawables += 1;
        });
        flushes.push(drawables);
        for (let i = 0; i < drawables; i += 1) renderer.info.programs.push({ isReady: () => true });
      },
      getContext: () => ({
        SYNC_GPU_COMMANDS_COMPLETE: 1,
        ALREADY_SIGNALED: 2,
        CONDITION_SATISFIED: 3,
        WAIT_FAILED: 4,
        fenceSync: () => (fences += 1, {}),
        flush() {},
        clientWaitSync: () => 2,
        deleteSync() {},
      }),
    };
    const warmup = createShaderWarmup({ renderer, scene, camera, quietMs: 0, backgroundMs: 0, programsPerBatch: 3, sleep: async () => {}, loaderQuiet: () => true });
    const final = await warmup.done;

    expect(final.phase).toBe("ready");
    expect(flushes.slice(0, 3)).toEqual([3, 3, 1]);
    expect(fences).toBeGreaterThanOrEqual(3);
  });
});

describe("drawing each program once while covered", () => {
  test("drawSubset draws only the kept drawables, even offscreen, and leaves shadows and culling as they were", () => {
    const scene = new Scene();
    const kept = meshAt(0, 0, 50);
    const other = meshAt(0, 0, -5);
    scene.add(kept, other);
    const shadowMap = { enabled: true, autoUpdate: true, needsUpdate: false };
    const seen: { drawables: Object3D[]; culled: boolean[]; shadowsLive: boolean }[] = [];
    const renderer = {
      shadowMap,
      compile() {},
      render(root: Object3D) {
        const drawables: Object3D[] = [];
        root.traverse((object) => {
          if ((object as Mesh).isMesh) drawables.push(object);
        });
        seen.push({ drawables, culled: drawables.map((object) => object.frustumCulled), shadowsLive: shadowMap.autoUpdate || shadowMap.needsUpdate });
      },
    };
    drawSubset(renderer, scene, new PerspectiveCamera(), (object) => object === kept);
    expect(seen).toEqual([{ drawables: [kept], culled: [false], shadowsLive: false }]);
    expect(scene.children).toEqual([kept, other]);
    expect(kept.frustumCulled).toBe(true);
    expect(shadowMap).toEqual({ enabled: true, autoUpdate: true, needsUpdate: false });
  });

  test("drawSubset makes a shadow map no frame made yet, then asks the next frame to redraw it", () => {
    const scene = new Scene();
    const kept = meshAt(0, 0, -5);
    const sun = new DirectionalLight();
    sun.castShadow = true;
    scene.add(kept, sun);
    const shadowMap = { enabled: true, autoUpdate: true, needsUpdate: false };
    const shadowsLive: boolean[] = [];
    const renderer = {
      shadowMap,
      compile() {},
      render() {
        const live = shadowMap.autoUpdate || shadowMap.needsUpdate;
        shadowsLive.push(live);
        // three's depth pass: makes the map and clears the light's request.
        if (live) {
          sun.shadow.map ??= new WebGLRenderTarget(1, 1);
          sun.shadow.needsUpdate = false;
        }
      },
    };
    drawSubset(renderer, scene, new PerspectiveCamera(), (object) => object === kept);
    expect(sun.shadow.map).not.toBeNull();
    expect(sun.shadow.needsUpdate).toBe(true);
    sun.shadow.needsUpdate = false;
    drawSubset(renderer, scene, new PerspectiveCamera(), (object) => object === kept);
    expect(shadowsLive).toEqual([true, false]);
    expect(shadowMap).toEqual({ enabled: true, autoUpdate: true, needsUpdate: false });
  });

  test("the warmup draws each linked program once per vertex layout before it reveals, a batch of programs per draw", async () => {
    const scene = new Scene();
    const shared = new MeshBasicMaterial();
    const a = meshAt(0, 0, -5, shared);
    const b = meshAt(1, 0, -5, shared);
    const c = meshAt(2, 0, -5);
    scene.add(a, b, c);
    const draws: Object3D[][] = [];
    let revealedAfter = -1;
    const renderer = {
      info: { programs: [] as FakeProgram[] },
      compile(root: Object3D) {
        root.traverse((object) => {
          if ((object as Mesh).isMesh && renderer.info.programs.length < 2) renderer.info.programs.push({ isReady: () => true });
        });
      },
      render(root: Object3D) {
        const drawables: Object3D[] = [];
        root.traverse((object) => {
          if ((object as Mesh).isMesh) drawables.push(object);
        });
        draws.push(drawables);
      },
    };
    const warmup = createShaderWarmup({
      renderer,
      scene,
      camera: new PerspectiveCamera(),
      quietMs: 0,
      backgroundMs: 0,
      sleep: async () => {},
      loaderQuiet: () => true,
      onState: (state) => {
        if (state.phase === "ready" && revealedAfter === -1) revealedAfter = draws.length;
      },
    });
    await warmup.done;
    // Two programs (the shared material, and c's) in one batch, same box layout: one draw of a and
    // c, since b adds no new program or layout.
    expect(draws).toEqual([[a, c]]);
    expect(revealedAfter).toBe(1);
  });

  test("a linked program has its uniforms read once it is ready, and nothing is drawn while one still builds", async () => {
    const scene = new Scene();
    const a = meshAt(0, 0, -5);
    const c = meshAt(2, 0, -5);
    scene.add(a, c);
    const fetched: number[] = [];
    let draws = 0;
    let clock = 0;
    const renderer = {
      info: { programs: [] as (FakeProgram & { getUniforms(): void })[] },
      compile(root: Object3D) {
        root.traverse((object) => {
          if (!(object as Mesh).isMesh || renderer.info.programs.length >= 2) return;
          const id = renderer.info.programs.length;
          // The second program never finishes, like a huge shader on a cold driver cache.
          renderer.info.programs.push({ isReady: () => id === 0, getUniforms: () => fetched.push(id) });
        });
      },
      render() {
        draws += 1;
      },
    };
    const warmup = createShaderWarmup({
      renderer,
      scene,
      camera: new PerspectiveCamera(),
      quietMs: 0,
      backgroundMs: 0,
      planBudgetMs: 100,
      sleep: async () => {},
      now: () => (clock += 25),
      loaderQuiet: () => true,
    });
    await warmup.done;
    expect(fetched).toEqual([0]);
    expect(draws).toBe(0);
  });
});

describe("work that draws the scene for itself", () => {
  test("drawsHeld answers whether a draw now would be swallowed, and stops after release", () => {
    const renderer = { render() {} };
    let holding = true;
    const release = holdDraws(renderer, { holding: () => holding });
    expect(drawsHeld(renderer)).toBe(true);
    holding = false;
    expect(drawsHeld(renderer)).toBe(false);
    holding = true;
    release();
    expect(drawsHeld(renderer)).toBe(false);
  });

  test("a scene drawn into a target as well as the canvas links both sets of programs", async () => {
    const scene = new Scene();
    scene.add(meshAt(0, 0, -5));
    const targets: unknown[] = [];
    let bound: unknown = null;
    const renderer = {
      info: { programs: [] as FakeProgram[] },
      getRenderTarget: () => bound,
      setRenderTarget: (target: unknown) => {
        bound = target;
      },
      compile() {
        targets.push(bound);
        if (renderer.info.programs.length < 2) renderer.info.programs.push({ isReady: () => true });
      },
    };
    const undo = warmupDrawsToTarget(scene);
    const warmup = createShaderWarmup({ renderer, scene, camera: new PerspectiveCamera(), quietMs: 0, backgroundMs: 0, sleep: async () => {}, loaderQuiet: () => true });
    await warmup.done;
    undo();
    expect(targets[0]).toBeNull();
    expect(targets[1]).not.toBeNull();
  });
});

/** @jsxImportSource @jgengine/core/ui/jsx */
import { memo, useLayoutEffect, useMemo } from "@jgengine/core/ui/jsx";
import { Group, Mesh, MeshBasicMaterial, SphereGeometry, Vector3 } from "three";
import { useSceneSwap } from "@jgengine/core/render/sceneSwap.draw";
import { SceneObjectPortal, useSceneObjectAttach, EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";
import { useFrameTask } from "@jgengine/core/frame/useFrameTask.draw";
import { disposeObjectTree } from "@jgengine/core/frame/useEngineDraw.draw";
import type { EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import type { GameContextContent, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { SceneCaptureBinding } from "@jgengine/core/scene/sceneCapture.draw";
import { defineGame } from "@jgengine/shell/defineGame";
import { useGameContext } from "@jgengine/ui/provider";
import { useStore } from "@jgengine/ui/store";
import { hdriEnvironment } from "@jgengine/assets/catalogs/hdriLibrary";
import { lutGrade } from "@jgengine/assets/catalogs/lutGrades";
import { BURROW, editorLayers, physics, world } from "./world";
import { houseAssets } from "./game/assets";
import { canSprint, captureProbe, guideOf, initialize, keybinds, moveRule, seatPlayer, setAim, templateOf, tickControls, viewStore, type View } from "./game/controls";
import { registerCaptureCommands } from "./game/capture";
import { Clockwork, LootLayer, RoomBuild, RoomLights, ThreatLayer, WayMarks } from "./game/houseArt";
import { itemMesh } from "./game/itemArt";
import { defOf, ITEMS, isItemKind, kindOf, SETS, type ItemKind, type SetId } from "./game/loot";
import { GameUI } from "./game/ui/GameUI";
import { audio } from "./game/audio";

/** Which room the scene is drawn for: the burrow at home, else the run's room (its path, so two rooms of one template still swap). */
const placeOf = (view: View): string => view.run === null || (view.mode !== "run" && view.mode !== "saving" && view.mode !== "caught") ? "burrow" : `${templateOf(view).id}@${view.run.room}`;

/** A room's fixed build, memoized on the template and the burrow's upgrades so it is built once per visit. */
const Build = memo(function Build({ templateId, levels }: { templateId: string; levels: string }) {
  const parsed = useMemo(() => JSON.parse(levels) as Record<string, number>, [levels]);
  return <><RoomBuild templateId={templateId} levels={parsed} /><RoomLights templateId={templateId} /></>;
});

/** What the Little holds: the needle in the right hand, a candle in the left, anything two-handed hugged in front. */
function Hands() {
  const ctx = useGameContext();
  const held = useStore(viewStore, v => {
    const run = v.run;
    if (run === null || v.mode !== "run") return "";
    const kinds = run.pack.map(item => kindOf(item));
    const bulky = run.pack.find(item => defOf(item).bulky === true && run.little !== "tuck");
    return [kinds.includes("needle") ? "needle" : "", kinds.includes("candle") ? "candle" : "", bulky === undefined ? "" : kindOf(bulky)].join("|");
  });
  const hand = useMemo(() => new Group(), []);
  const dir = useMemo(() => new Vector3(), []);
  useSceneObjectAttach(hand);
  useLayoutEffect(() => { hand.visible = held !== ""; }, [hand, held]);
  useFrameTask(({ camera, clock }) => {
    camera.getWorldDirection(dir);
    setAim(ctx, [dir.x, dir.y, dir.z]);
    hand.position.copy(camera.position); hand.quaternion.copy(camera.quaternion);
    const bob = Math.sin(clock.elapsedTime * 6) * 0.01;
    hand.translateY(bob);
  });
  const [needle, candle, bulky] = held.split("|");
  return <SceneObjectPortal object={hand}>
    {needle === "needle" ? <Held kind="needle" at={[0.28, -0.32, -0.7]} turn={[0.1, Math.PI / 2 + 0.25, 0.25]} scale={0.32} /> : null}
    {candle === "candle" ? <Held kind="candle" at={[-0.32, -0.55, -0.75]} turn={[0, 0, 0.08]} scale={0.32} /> : null}
    {bulky !== undefined && bulky !== "" && isItemKind(bulky) ? <Held kind={bulky} at={[0, -0.85, -0.95]} turn={[0.35, 0.4, 0]} scale={0.42} /> : null}
  </SceneObjectPortal>;
}
function Held({ kind, at, turn, scale }: { kind: ItemKind; at: [number, number, number]; turn: [number, number, number]; scale: number }) {
  return <EngineDrawMount create={() => {
    const mesh = itemMesh(kind);
    mesh.position.set(...at); mesh.rotation.set(...turn); mesh.scale.setScalar(scale);
    mesh.traverse(node => { node.castShadow = false; });
    return {
      mount(state: EngineFrameState) { state.scene.add(mesh); },
      dispose(state: EngineFrameState) { state.scene.remove(mesh); disposeObjectTree(mesh); },
    };
  }} deps={[kind]} />;
}

/** Every set the burrow has banked, as its centrepiece on the trophy shelf. */
function Trophies() {
  const sets = useStore(viewStore, v => v.home.upgrades.trophies > 0 ? v.home.sets.join(",") : "");
  const shelf = BURROW.props.find(p => p.label === "trophy-shelf");
  if (sets === "" || shelf === undefined) return null;
  return <>{sets.split(",").map((id, i) => {
    const piece = SETS[id as SetId]?.pieces[0];
    return piece === undefined ? null : <EngineDrawMount key={id} create={() => {
      const mesh = itemMesh(piece);
      mesh.position.set(shelf.center.x - 2.2 + i * 1.1, shelf.center.y + 0.25, shelf.center.z);
      mesh.scale.setScalar(0.45);
      return { mount(state: EngineFrameState) { state.scene.add(mesh); }, dispose(state: EngineFrameState) { state.scene.remove(mesh); disposeObjectTree(mesh); } };
    }} deps={[id, i]} />;
  })}</>;
}
/**
 * For a burrow's first three nights, a firefly floats over whatever the game's guidance points at:
 * the goal card's station at home, the next find, door or way out in the house.
 */
function Guide() {
  const ctx = useGameContext();
  const on = useStore(viewStore, v => v.home.extractions < 3 && (v.mode === "home" || v.mode === "run"));
  const fly = useMemo(() => {
    const mesh = new Mesh(new SphereGeometry(0.22, 12, 8), new MeshBasicMaterial({ color: "#fff2a0" }));
    const halo = new Mesh(new SphereGeometry(0.6, 12, 8), new MeshBasicMaterial({ color: "#ffd86b", transparent: true, opacity: 0.25, depthWrite: false }));
    mesh.add(halo);
    return mesh;
  }, []);
  useSceneObjectAttach(fly);
  useFrameTask(({ clock }) => {
    const v = viewStore.read(ctx);
    const at = ctx.scene.entity.get(ctx.player.userId)?.position ?? null;
    const g = on ? guideOf(ctx, v, at) : null;
    fly.visible = g !== null && g.guideDist > 1.5;
    if (g === null) return;
    const t = clock.elapsedTime;
    fly.position.set(g.guideX + Math.sin(t * 1.7) * 0.3, 2.2 + Math.sin(t * 3.1) * 0.25, g.guideZ + Math.cos(t * 1.3) * 0.3);
  });
  return null;
}
function RunLayers() {
  const run = useStore(viewStore, v => v.mode === "run" || v.mode === "saving" ? v.run : null);
  return run === null ? null : <><LootLayer run={run} /><WayMarks run={run} /><Clockwork run={run} /></>;
}
function WorldOverlay() {
  const view = useStore(viewStore, v => ({ place: placeOf(v), levels: JSON.stringify(v.home.upgrades) }));
  // Going through a door builds the next room under the travel card, never in a frozen frame.
  const place = useSceneSwap(view.place);
  const templateId = place.split("@")[0]!;
  return <>
    <SceneCaptureBinding />
    <Build templateId={templateId} levels={templateId === "burrow" ? view.levels : "{}"} />
    {templateId === "burrow" ? <Trophies /> : <><RunLayers /><ThreatLayer templateId={templateId} /></>}
    <Hands /><Guide />
  </>;
}

const content: GameContextContent = {
  entityById(id): GameContextEntityEntry | null {
    if (id === "little") return { stats: { health: { max: 150, min: 0 } }, movement: { poses: ["standing", "running"], walkSpeed: 4.2 } };
    return null;
  },
  itemById(id) { return isItemKind(id) ? { rarity: "common", baseType: id, label: ITEMS[id].name } as never : null; },
};
export const credit = { text: "Original Crumb Run house, Littles, hunters and item art", handle: "Crumb Run" };
export const game = defineGame({
  name: "Crumb Run",
  assets: houseAssets,
  world,
  physics,
  content,
  input: keybinds,
  scene: { editorLayers, WorldOverlay },
  audio,
  server: { mode: "campaign" },
  save: "none",
  persist: false,
  chrome: { settings: {}, presentation: "3d" },
  scenePlacement: false,
  controls: {
    touch: false,
    platforms: ["web"],
    movement: {
      beforeCommit(frame) { return moveRule(frame.ctx, frame.current, frame.next); },
      canSprint,
    },
    orientation: "landscape",
  },
  loop: { onInit: (ctx) => { initialize(ctx); registerCaptureCommands(ctx); }, onNewPlayer: seatPlayer, onTick: tickControls },
  GameUI,
  hudTheme: false,
  uiRenderer: "rune",
  camera: {
    perspective: "first",
    rigs: { firstPerson: { eyeHeight: 1.5, sensitivity: 0.0021, reticle: false, viewmodel: false } },
    lens: { frustum: { fov: 72, near: 0.05, far: 420 } },
  },
  rendering: {
    // An interior with its own light rig (no look preset, no mood): no sky dome, no sun. A low warm
    // fill, moonlight blue from above, and the room's practical lamps doing the rest.
    lighting: { ambient: { color: "#ffd9b0", intensity: 0.32 }, hemisphere: { skyColor: "#a9bdf0", groundColor: "#5a3a24", intensity: 0.35 } },
    backdrop: { background: "#1a120d", fog: { color: "#1f1510", near: 40, far: 210 } },
    environmentSource: hdriEnvironment("night-clear", { intensity: 0.18 }),
    postProcessing: {
      toneMapping: "aces",
      bloom: { strength: 0.32, radius: 0.45, threshold: 0.82 },
      ao: { radius: 2, intensity: 1.1, distanceFalloff: 6, blend: 1 },
      grade: { vignette: 0.34, lut: lutGrade("warm-filmic") },
      atmosphere: { indoor: true, fogDensity: 0.004, fogFalloff: 0.01, fogHeight: 0, fogMax: 0.3, shafts: 0, lamps: 0.6, beams: 0.2 },
    },
  },
  capture: {
    probe: captureProbe,
    play: ["deepward.enter"],
    states: {
      title: [],
      menu: ["deepward.enter", "menu.record"],
      "menu-records": ["deepward.enter", "menu.record", { name: "menu.focus", input: { verb: "records" } }],
      pause: ["deepward.enter", { name: "deepward.pause", input: { paused: true } }],
      stash: ["deepward.enter", "deepward.openStash"],
      workbench: ["deepward.enter", "deepward.openWorkbench"],
      nook: ["deepward.enter", "deepward.openNook"],
      burrow: ["deepward.enter"],
      "mid-run": ["deepward.enter", "deepward.stage"],
      report: ["deepward.enter", "deepward.dev.extract"],
      "room-counter": ["deepward.enter", { name: "deepward.dev.room", input: { template: "counter-top" } }],
      "room-rug": ["deepward.enter", { name: "deepward.dev.room", input: { template: "living-rug" } }],
      "room-toys": ["deepward.enter", { name: "deepward.dev.room", input: { template: "toy-shelf" } }],
      "room-attic": ["deepward.enter", { name: "deepward.dev.room", input: { template: "attic-boxes" } }],
    },
  },
});

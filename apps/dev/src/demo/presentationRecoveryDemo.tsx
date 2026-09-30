import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { useThree } from "@react-three/fiber";
import { Box3, type Camera, type Group } from "three";
import { decodeEditorDocument, requireEditorMarker } from "@jgengine/core/editor/document";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { playControlsActive } from "@jgengine/core/game/controlGate";
import { environment, terrain } from "@jgengine/core/world/features";
import { useGame, useGameContext, useGameStoreValue } from "@jgengine/react";
import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import type { PlayableGame } from "@jgengine/shell/registry";
import { hostedAuthorityDemoGame } from "./hostedAuthorityDemo";
import type { AuthorityView } from "./hostedAuthority";
import authoredScene from "./presentationRecovery.scene.json";

const decodedScene = decodeEditorDocument(authoredScene);
if (!decodedScene.ok) throw new Error(`Invalid recovery editor document: ${JSON.stringify(decodedScene.errors)}`);
const authoredDocument = decodedScene.document;
const authoredTerrain = authoredScene.terrain;
const authoredCamera = requireEditorMarker(authoredDocument, "relay-recovery-camera");
const previewWidth = authoredTerrain.bounds.maxX - authoredTerrain.bounds.minX;
const previewDepth = authoredTerrain.bounds.maxZ - authoredTerrain.bounds.minZ;

// This authored preview state belongs to the live context, so retrying its presentation retains it.
const previews = new WeakMap<GameContext, { id: number; textured: boolean; listeners: Set<() => void>; rendered?: { camera: Camera; ground: Group } }>();
let nextPreviewId = 0;
function previewFor(ctx: GameContext) {
  let preview = previews.get(ctx);
  if (preview === undefined) {
    preview = { id: ++nextPreviewId, textured: false, listeners: new Set() };
    previews.set(ctx, preview);
  }
  return preview;
}
function useTexturedGround(ctx: GameContext) {
  const preview = previewFor(ctx);
  return useSyncExternalStore((changed) => { preview.listeners.add(changed); return () => { preview.listeners.delete(changed); }; }, () => preview.textured, () => false);
}
const maps = {
  color: "/materials/ambientcg-grass001/color.jpg", normal: "/materials/ambientcg-grass001/normal.jpg",
  roughness: "/materials/ambientcg-grass001/roughness.jpg", ao: "/materials/ambientcg-grass001/ao.jpg",
  displacement: "/materials/ambientcg-grass001/displacement.jpg",
};
function RecoveryEnvironment() {
  const ctx = useGameContext();
  const textured = useTexturedGround(ctx);
  const camera = useThree((state) => state.camera);
  const ground = useRef<Group>(null);
  useLayoutEffect(() => {
    const group = ground.current;
    if (group === null) return;
    const preview = previewFor(ctx);
    const rendered = { camera, ground: group };
    preview.rendered = rendered;
    return () => { if (preview.rendered === rendered) delete preview.rendered; };
  }, [ctx, camera]);
  const feature = environment({ sculpt: authoredTerrain, terrain: terrain({ bounds: { w: previewWidth, d: previewDepth }, height: 0, frequency: 0.035, seed: "relay-recovery", ...(textured ? { detail: { material: { maps, repeat: previewWidth / 9 } } } : {}) }) });
  return <group ref={ground} name="recovery-authored-terrain"><EnvironmentScene feature={feature} /></group>;
}
function RecoveryUI() {
  const ctx = useGameContext();
  const { commands } = useGame();
  const textured = useTexturedGround(ctx);
  const view = useGameStoreValue<AuthorityView | null>(`relay.view:${ctx.player.userId}`, null);
  const preview = previewFor(ctx);
  return <aside style={{ pointerEvents: "auto", position: "absolute", top: 24, left: 24, maxWidth: 380, padding: 20, borderRadius: 12, background: "#102735e8", color: "#e9f6ee", fontFamily: "system-ui" }}>
    <p style={{ color: "#95d4bc", margin: 0 }}>JG ENGINE · SHARED AUTHORITY</p><h1 style={{ margin: "8px 0" }}>Relay material workshop</h1>
    <p>Preview textured ground while the shared courier host keeps running. If an asset fails, restore it and retry the display.</p>
    <button type="button" disabled={textured} onClick={() => { preview.textured = true; for (const changed of preview.listeners) changed(); }}>Load textured ground</button>
    <button type="button" style={{ marginLeft: 8 }} onClick={() => { void commands.run("class.choose", {}); }}>Choose courier</button>
    <p>Host tick <output data-testid="host-tick">{view?.ticks ?? 0}</output> · Copper <output data-testid="copper">{view?.coins ?? 0}</output></p>
    <p>Context <output data-testid="context-lifetime">{preview.id}</output> · <output data-testid="actor">{ctx.player.userId}</output></p>
    <p>WASD moves the courier. Successful texture groups remain cached on retry.</p>
    <small>Frontend: <output data-testid="frontend-revision">{import.meta.env.VITE_JG_COMPILED_REVISION ?? "development"}</output></small>
  </aside>;
}
export const presentationRecoveryDemoGame: PlayableGame = {
  ...hostedAuthorityDemoGame, presentation: "3d", GameUI: RecoveryUI, environment: () => <RecoveryEnvironment />,
  editorLayers: authoredDocument,
  camera: { rig: "topDown", topDown: { height: authoredCamera.position.y, pitch: Math.atan2(authoredCamera.position.y, Math.hypot(authoredCamera.position.x, authoredCamera.position.z)), yaw: Math.atan2(authoredCamera.position.x, -authoredCamera.position.z) } },
  capture: { probe(ctx) {
    const view = ctx.game.store.get(`relay.view:${ctx.player.userId}`) as AuthorityView | undefined;
    const rendered = previewFor(ctx).rendered;
    const bounds = rendered === undefined ? null : new Box3().setFromObject(rendered.ground);
    return { renderAttached: Number(rendered !== undefined), cameraX: rendered?.camera.position.x ?? 0, cameraY: rendered?.camera.position.y ?? 0, cameraZ: rendered?.camera.position.z ?? 0, groundMinX: bounds?.min.x ?? 0, groundMaxX: bounds?.max.x ?? 0, groundMinZ: bounds?.min.z ?? 0, groundMaxZ: bounds?.max.z ?? 0, x: view?.position[0] ?? 0, contextLifetime: previewFor(ctx).id, hostTick: view?.ticks ?? 0, controlsActive: Number(playControlsActive(ctx)), textured: Number(previewFor(ctx).textured), z: view?.position[2] ?? 0 };
  } },
};

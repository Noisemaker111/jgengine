import { useEffect, useMemo, type Ref } from "react";
import * as THREE from "three";
import type { Group } from "three";
import { IsolatedEntityModel } from "@jgengine/core/model/SceneModels.draw";
import { SceneObjectGroup, SceneObjectPortal, useSceneObjectAttach } from "@jgengine/core/frame/useEngineDraw.draw";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { stationAssets } from "./assets";
import type { Triple } from "./art";
import { MAGAZINE } from "./combat";
import type { Dive } from "./state";

export type ServiceWeaponKind = Dive["hand"];
// These are the original Hand muzzle anchors. Barrel, bore and flash all terminate here.
export const WEAPON_MUZZLE: Record<ServiceWeaponKind, Triple> = { sidearm: [0, 0, -0.22], "service-rifle": [0, 0, -0.5] };
/** What the pose reads: the hand, reload progress as a fraction, and the shot flash and hurt timers. */
export interface WeaponPoseInput {
  hand: ServiceWeaponKind;
  /** Reload progress, `0..1`. */
  reload: number;
  hurt: number;
  /** Seconds of muzzle flash left after an accepted shot; the flash is what permits recoil. */
  flash: number;
}
/** Pose is a projection of accepted simulation state; it has no local animation clock. */
export function serviceWeaponPose(dive: WeaponPoseInput) {
  // Only an accepted shot's flash permits firing recoil; the kick then decays with the flash.
  const kick = Math.max(0, Math.min(1, dive.flash / 0.12));
  const reload = Math.sin(Math.PI * Math.max(0, Math.min(1, dive.reload)));
  const hurt = Math.max(0, Math.min(1, dive.hurt / 0.4));
  return { at: [0, -reload * 0.09 - hurt * 0.012, kick * 0.035] as Triple,
    turn: [kick * 0.07 + reload * 0.13, 0, -reload * 0.24] as Triple,
    kick, magazineOffset: reload * 0.07, flash: dive.flash > 0 };
}
/** Where the weapon body sits for a pose: kicked back by recoil, dropped while the magazine is out. */
export function serviceWeaponBody(pose: { kick: number; magazineOffset: number }): Triple {
  return [0, -pose.magazineOffset * 0.2, pose.kick * 0.012];
}
/** The magazine figure the HUD's "n / 6" line counts against. */
export const WEAPON_MAGAZINE = MAGAZINE;
/** The muzzle flash cones/sparks as a draw under the muzzle-offset group. */
function weaponFlashDraw(): EngineDraw {
  const group = new THREE.Group();
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.055, 0.09, 6),
        new THREE.MeshBasicMaterial({ color: "#ffe4a0" }),
      );
      cone.position.set(0, 0, -0.035);
      cone.rotation.x = -Math.PI / 2;
      const spark = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.032),
        new THREE.MeshBasicMaterial({ color: "#fff6dc" }),
      );
      spark.position.set(0, 0, -0.008);
      group.add(cone, spark);
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      group.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.geometry.dispose();
          (node.material as THREE.Material).dispose();
        }
      });
    },
  };
}

/** Original grip-origin models share the accepted pose and exact gameplay muzzle anchors. */
export function ServiceWeapon({kind,flash=false,kick=0,magazineOffset=0,shadows='both',body}:{
 kind:ServiceWeaponKind;flash?:boolean;kick?:number;magazineOffset?:number;shadows?:'none'|'both';
 /** The kicked and reloading body, for a caller that moves it each frame with {@link serviceWeaponBody}. */
 body?:Ref<Group>;
}) {
 const asset=stationAssets.resolve(kind==='sidearm'?'deepward/service-sidearm':'deepward/service-rifle');
 if(!asset)throw Error(`Missing original weapon catalog asset: ${kind}`);
 // A real Group the caller can move per-frame; attached under the engine loop, a primitive under r3f.
 const group = useMemo(() => new THREE.Group(), []);
 useEffect(() => {
  group.position.set(0, -magazineOffset * 0.2, kick * 0.012);
 }, [group, kick, magazineOffset]);
 useEffect(() => {
  if (body === undefined || body === null) return;
  if (typeof body === "function") body(group);
  else body.current = group;
  return () => {
   if (typeof body !== "function") body.current = null;
  };
 }, [body, group]);
 useSceneObjectAttach(group);
 return <SceneObjectPortal object={group}>
  <IsolatedEntityModel model={{...asset,anchor:'origin',shadows,animation:'none'}} />
  {flash ? (
   <SceneObjectGroup position={WEAPON_MUZZLE[kind]}>
    <EngineDrawMount create={weaponFlashDraw} deps={[]} />
   </SceneObjectGroup>
  ) : null}
 </SceneObjectPortal>;
}

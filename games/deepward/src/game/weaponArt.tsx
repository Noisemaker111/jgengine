import type { Ref } from "react";
import type { Group } from "three";
import { IsolatedEntityModel } from "@jgengine/core/model/SceneModels.draw";
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
/** Original grip-origin models share the accepted pose and exact gameplay muzzle anchors. */
export function ServiceWeapon({kind,flash=false,kick=0,magazineOffset=0,shadows='both',body}:{
 kind:ServiceWeaponKind;flash?:boolean;kick?:number;magazineOffset?:number;shadows?:'none'|'both';
 /** The kicked and reloading body, for a caller that moves it each frame with {@link serviceWeaponBody}. */
 body?:Ref<Group>;
}) {
 const asset=stationAssets.resolve(kind==='sidearm'?'deepward/service-sidearm':'deepward/service-rifle');
 if(!asset)throw Error(`Missing original weapon catalog asset: ${kind}`);
 return <group ref={body ?? null} position-z={kick*0.012} position-y={-magazineOffset*0.2}>
  <IsolatedEntityModel model={{...asset,anchor:'origin',shadows,animation:'none'}} />
  {flash && <group position={WEAPON_MUZZLE[kind]}>
   <mesh position-z={-0.035} rotation-x={-Math.PI/2}><coneGeometry args={[0.055,0.09,6]} /><meshBasicMaterial color='#ffe4a0' /></mesh>
   <mesh position-z={-0.008}><octahedronGeometry args={[0.032]} /><meshBasicMaterial color='#fff6dc' /></mesh>
  </group>}
 </group>;
}

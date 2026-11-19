/** @jsxImportSource @jgengine/core/ui/jsx */
import { IsolatedEntityModel } from '@jgengine/core/model/SceneModels.draw';
import type { ModelAnimationConfig } from '@jgengine/core/game/playableGame';
import type { Dive } from './state';
import { PRINT_ID, type Point } from '../world';
import { stationAssets } from './assets';

export function fitterAnimation(print: Pick<Dive['print'],'mode'>): ModelAnimationConfig {
 return print.mode==='winding'
  ? {clip:'windup',clock:'game',loop:false}
  : {states:{idle:'idle',walk:'walk',walkSpeed:0.05,fadeSec:0.16}};
}
/**
 * Rendered inside the existing SDK entity transform, using the original skinned tool grips. Its hit
 * flash is a station light ({@link fitterHit}), so the Fitter arriving or dying never changes the scene's lights.
 */
export function FitterModel({print}:{print:Pick<Dive['print'],'mode'>}) {
 const asset=stationAssets.resolve('deepward/fitter-salvage-operator');
 if(!asset)throw Error('Missing original Fitter catalog asset');
 return <IsolatedEntityModel instanceId={PRINT_ID} model={{...asset,anchor:'origin',shadows:'both',animation:fitterAnimation(print)}} />;
}
export function fitterHit(print:Dive['print'], trace:{to:Point}|null):boolean {
 return print.health>0 && trace!==null && print.health<80 && Math.hypot(trace.to[0]-print.at[0], trace.to[2]-print.at[2])<0.3;
}
export const FITTER_FLASH = {up:1.25, ahead:0.3, color:'#ff6654', intensity:3, distance:2.2} as const;

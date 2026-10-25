import { IsolatedEntityModel } from '@jgengine/shell/render/SceneModels';
import type { ModelAnimationConfig } from '@jgengine/core/game/playableGame';
import type { Dive } from './state';
import { PRINT_ID } from '../world';
import { stationAssets } from './assets';

/** The accepted attack countdown owns the windup pose; SDK position sampling owns gait. */
export function fitterAnimation(print: Dive['print']): ModelAnimationConfig {
 return print.mode==='winding'
  ? {clip:'windup',paused:true,time:0.7-Math.max(0,Math.min(0.7,print.attack)),loop:false}
  : {states:{idle:'idle',walk:'walk',walkSpeed:0.05,fadeSec:0.16}};
}
/** Rendered inside the existing SDK entity transform, using the original skinned tool grips. */
export function FitterModel({print,hit=false}:{print:Dive['print'];hit?:boolean}) {
 const asset=stationAssets.resolve('deepward/fitter-salvage-operator');
 if(!asset)throw Error('Missing original Fitter catalog asset');
 return <>
  <IsolatedEntityModel instanceId={PRINT_ID} model={{...asset,anchor:'origin',shadows:'both',animation:fitterAnimation(print)}} />
  {hit && <pointLight position={[0,1.25,0.3]} color='#ff6654' intensity={3} distance={2.2} />}
 </>;
}

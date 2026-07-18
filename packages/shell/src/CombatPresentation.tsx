import {
  CombatCameraShake,
  ProjectileTracers,
  WorldFloatText,
  WorldTelegraphs,
} from "./world/WorldHud";
import { WorldSpellVfx } from "./world/WorldVfx";
import { RetainedVfx } from "./world/RetainedVfx";
import type { ResolvedPresentationEffects } from "./presentationResolve";

/** Mounts the opt-in combat VFX stack inside the 3D canvas. */
export function CombatPresentation({ effects }: { effects: ResolvedPresentationEffects }) {
  return (
    <>
      {effects.telegraphs ? <WorldTelegraphs /> : null}
      {effects.vfx ? (
        <>
          <WorldSpellVfx />
          <RetainedVfx />
        </>
      ) : null}
      {effects.floatText ? <WorldFloatText /> : null}
      {effects.tracers ? <ProjectileTracers /> : null}
      {effects.shake ? <CombatCameraShake /> : null}
    </>
  );
}

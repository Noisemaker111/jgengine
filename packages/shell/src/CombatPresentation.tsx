import {
  CombatCameraShake,
  ProjectileTracers,
  WorldFloatText,
  WorldTelegraphs,
} from "./world/WorldHud";
import { WorldSpellVfx } from "./world/WorldVfx";
import { RetainedVfx } from "./world/RetainedVfx";
import { POSTFX_OVERLAY_USERDATA } from "./postfx/postfxOverlay";
import type { ResolvedPresentationEffects } from "./presentationResolve";

/** Mounts the opt-in combat VFX stack inside the 3D canvas. @internal */
export function CombatPresentation({ effects }: { effects: ResolvedPresentationEffects }) {
  return (
    // Combat VFX are transparent overlay quads — excluded from GTAO/DOF scene prepasses,
    // which would otherwise stamp them into the AO/depth buffers as opaque black squares.
    <group userData={POSTFX_OVERLAY_USERDATA}>
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
    </group>
  );
}

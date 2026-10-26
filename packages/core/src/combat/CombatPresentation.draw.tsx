import {
  ProjectileTracers,
  WorldFloatText,
  WorldTelegraphs,
} from "@jgengine/core/hud/WorldHud.draw";
import { HitReactionShake } from "@jgengine/core/camera/shake/HitReactionShake.draw";
import { SpellVfx } from "@jgengine/core/vfx/SpellVfx.draw";
import { HitMarkers, MuzzleFlashes } from "@jgengine/core/combat/ShotFeedback.draw";
import { RetainedVfx } from "@jgengine/core/vfx/RetainedVfx.draw";
import { ImpactFeedback } from "@jgengine/core/combat/ImpactFeedback.draw";
import { CorpseRagdolls } from "@jgengine/core/anim/CorpseRagdolls.draw";
import { POSTFX_OVERLAY_USERDATA } from "@jgengine/core/postfx/postfxOverlay.draw";
import type { ResolvedPresentationEffects } from "@jgengine/shell/presentationResolve";

/** Mounts the opt-in combat VFX stack inside the 3D canvas. @internal */
export function CombatPresentation({ effects }: { effects: ResolvedPresentationEffects }) {
  return (
    <>
    {/* Combat VFX are transparent overlay quads — excluded from GTAO/DOF scene prepasses,
        which would otherwise stamp them into the AO/depth buffers as opaque black squares. */}
    <group userData={POSTFX_OVERLAY_USERDATA}>
      {effects.telegraphs ? <WorldTelegraphs /> : null}
      {effects.vfx ? (
        <>
          <SpellVfx />
          <RetainedVfx />
        </>
      ) : null}
      {effects.floatText ? <WorldFloatText /> : null}
      {effects.tracers ? <ProjectileTracers /> : null}
      {effects.shake ? <HitReactionShake /> : null}
      {effects.hitMarkers ? <HitMarkers /> : null}
      {effects.muzzleFlash ? <MuzzleFlashes /> : null}
      {effects.impacts !== null ? <ImpactFeedback {...effects.impacts} /> : null}
    </group>
    {/* Fallen bodies are solid scene geometry, so they sit outside the overlay group. */}
    {effects.impacts !== null && effects.impacts.ragdolls !== false ? <CorpseRagdolls /> : null}
    </>
  );
}

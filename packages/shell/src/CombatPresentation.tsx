import {
  ProjectileTracers,
  WorldFloatText,
  WorldTelegraphs,
} from "./world/worldOverlays";
import { HitReactionShake } from "./camera/shake/HitReactionShake";
import { WorldSpellVfx } from "./world/WorldVfx";
import { HitMarkers, MuzzleFlashes } from "./world/ShotFeedback";
import { RetainedVfx } from "./world/RetainedVfx";
import { ImpactFeedback } from "./world/ImpactFeedback";
import { CorpseRagdolls } from "./render/CorpseRagdolls";
import { POSTFX_OVERLAY_USERDATA } from "./postfx/postfxOverlay";
import type { ResolvedPresentationEffects } from "./presentationResolve";

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
          <WorldSpellVfx />
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

export const SCHOOL_COLORS = {
    physical: 0xd6d0c4,
    fire: 0xff7a2a,
    frost: 0x8ed2ff,
    arcane: 0xd98aff,
    shadow: 0x9a5df0,
    holy: 0xffe9a0,
    nature: 0x86e86a,
};
export function vfxArchetype(ability) {
    switch (ability.kind) {
        case "heal":
        case "hot":
        case "buff":
            return "glow";
        case "aoe":
            return "nova";
        default:
            return ability.school === "physical" ? "spark" : "projectile";
    }
}
export function playSpellVfx(ctx, ability, anchors) {
    const kind = vfxArchetype(ability);
    const color = SCHOOL_COLORS[ability.school];
    if (kind === "nova") {
        if (anchors.at === undefined)
            return;
        ctx.scene.entity.vfx({ kind, color, from: anchors.at, ...(anchors.radius === undefined ? {} : { radius: anchors.radius }) });
        return;
    }
    if (kind === "glow") {
        ctx.scene.entity.vfx({ kind, color, from: anchors.targetId ?? anchors.casterId });
        return;
    }
    if (anchors.targetId === undefined)
        return;
    ctx.scene.entity.vfx({ kind, color, from: anchors.casterId, to: anchors.targetId });
}
export function playMeleeVfx(ctx, casterId, targetId) {
    ctx.scene.entity.vfx({ kind: "spark", color: SCHOOL_COLORS.physical, from: casterId, to: targetId });
}

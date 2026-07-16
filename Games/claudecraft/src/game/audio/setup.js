import { perContext } from "@jgengine/core/runtime/perContext";
import { inCombat } from "../session/hero";
import { classStore } from "../session/stores";
import { ZONES, zoneAt } from "../world/zones";
import { cue } from "./cues";
const ZONE_TRANSPOSE = { vale: 0, marsh: -2, peaks: 3 };
const lastThemeOf = perContext(() => ({ theme: null }));
function hubTheme(x, z) {
    for (const zone of ZONES) {
        const dx = x - zone.hub.x;
        const dz = z - zone.hub.z;
        if (dx * dx + dz * dz <= (zone.hub.radius + 8) ** 2)
            return "town";
    }
    return null;
}
/** Register one-shot SFX cues against the engine event bus. Call once from onInit. */
export function setupAudioCues(ctx) {
    ctx.game.events.on("stat.levelUp", () => cue(ctx, "level_up"));
    ctx.game.events.on("loot.granted", () => cue(ctx, "loot_item"));
    ctx.game.events.on("quest.accepted", () => cue(ctx, "quest_accept"));
    ctx.game.events.on("quest.completed", () => cue(ctx, "quest_done"));
    ctx.game.events.on("worldItem.picked_up", () => cue(ctx, "loot_item"));
    ctx.game.events.on("entity.died", () => cue(ctx, "death"));
}
/** Crossfade the soundtrack to the player's current zone/combat theme. Cheap per-tick — only emits on a theme change. */
export function tickMusic(ctx, userId) {
    if (classStore.peek(ctx, userId) === undefined)
        return;
    const self = ctx.scene.entity.get(userId);
    if (self === null)
        return;
    const [x, , z] = self.position;
    let theme;
    let transpose = 0;
    if (inCombat(ctx, userId)) {
        theme = "battle";
        transpose = ZONE_TRANSPOSE[zoneAt(z).id] ?? 0;
    }
    else {
        theme = hubTheme(x, z) ?? zoneAt(z).id;
    }
    const lastTheme = lastThemeOf(ctx);
    if (theme === lastTheme.theme)
        return;
    lastTheme.theme = theme;
    ctx.game.audio.music(theme, transpose);
}

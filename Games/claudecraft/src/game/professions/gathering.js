import { keybind, proximityPrompt } from "@jgengine/core/interaction/proximityPrompt";
import { command } from "@jgengine/core/interaction/proximityPrompt";
import { seededRng } from "@jgengine/core/random/rng";
import { perContext } from "@jgengine/core/runtime/perContext";
import { GATHER_NODES, PROFESSIONS } from "./catalog";
import { professionsStore } from "../session/stores";
import { CRYPT, zoneById } from "../world/zones";
const nodesOf = perContext(() => new Map());
const GATHER_RADIUS = 4;
export function professionsOf(ctx, userId) {
    return professionsStore.read(ctx, userId);
}
function nodePlacement(def, roll) {
    const zone = zoneById(def.zone);
    for (let attempt = 0; attempt < 30; attempt += 1) {
        const x = -160 + roll() * 320;
        const z = zone.zMin + 18 + roll() * (zone.zMax - zone.zMin - 36);
        const hubDist = Math.hypot(x - zone.hub.x, z - zone.hub.z);
        const cryptDist = Math.hypot(x - CRYPT.x, z - CRYPT.z);
        if (hubDist > zone.hub.radius + 10 && cryptDist > CRYPT.radius + 6)
            return [x, z];
    }
    return [zone.hub.x + 30, (zone.zMin + zone.zMax) / 2];
}
function placeNode(ctx, def, position) {
    const y = ctx.world.groundHeightAt(position[0], position[1]);
    const instanceId = ctx.scene.object.place(def.id, position[0], y, position[1]);
    nodesOf(ctx).set(instanceId, { defId: def.id, position: [position[0], y, position[1]] });
}
export function placeGatherNodes(ctx) {
    let placed = 0;
    for (const def of GATHER_NODES) {
        const roll = seededRng(`gather:${def.id}`);
        for (let index = 0; index < def.count; index += 1) {
            placeNode(ctx, def, nodePlacement(def, roll));
            placed += 1;
        }
    }
    return placed;
}
export function gatherPrompts(ctx) {
    const player = ctx.scene.entity.get(ctx.player.userId);
    if (player === null)
        return [];
    const prompts = [];
    for (const [instanceId, runtime] of nodesOf(ctx)) {
        const dx = runtime.position[0] - player.position[0];
        const dz = runtime.position[2] - player.position[2];
        if (dx * dx + dz * dz > 40 * 40)
            continue;
        const def = GATHER_NODES.find((entry) => entry.id === runtime.defId);
        if (def === undefined)
            continue;
        prompts.push({
            id: `gather:${instanceId}`,
            position: { x: runtime.position[0], z: runtime.position[2] },
            prompt: proximityPrompt({
                radius: GATHER_RADIUS,
                display: keybind("interact"),
                invoke: command("gather", { instanceId }),
            }),
        });
    }
    return prompts;
}
export function gather(ctx, userId, instanceId) {
    const runtime = nodesOf(ctx).get(instanceId);
    const def = runtime === undefined ? undefined : GATHER_NODES.find((entry) => entry.id === runtime.defId);
    if (runtime === undefined || def === undefined)
        return;
    const skills = professionsOf(ctx, userId);
    const skill = skills[def.profession];
    if (skill < def.skillReq) {
        ctx.scene.entity.floatText({
            instanceId: userId,
            text: `Requires ${def.profession} ${def.skillReq}`,
            kind: "info",
        });
        return;
    }
    const roll = seededRng(`harvest:${instanceId}:${Math.floor(ctx.time.now() * 10)}`);
    for (const material of def.materials) {
        const count = material.min + Math.floor(roll() * (material.max - material.min + 1));
        if (count > 0)
            ctx.player.inventory.put("bags", material.itemId, count);
    }
    const maxSkill = PROFESSIONS.find((entry) => entry.id === def.profession)?.maxSkill ?? 300;
    if (skill < def.skillUpTo && skill < maxSkill) {
        professionsStore.write(ctx, userId, { ...skills, [def.profession]: skill + 1 });
        ctx.scene.entity.floatText({
            instanceId: userId,
            text: `${def.profession} ${skill + 1}`,
            kind: "info",
        });
    }
    ctx.scene.object.remove(instanceId);
    nodesOf(ctx).delete(instanceId);
    const respawnAt = [runtime.position[0], runtime.position[2]];
    ctx.time.after(def.respawnSec, () => placeNode(ctx, def, respawnAt));
}
export function gatherNodeCount(ctx) {
    return nodesOf(ctx).size;
}

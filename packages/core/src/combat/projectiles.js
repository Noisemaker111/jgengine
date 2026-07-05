const DEFAULT_RANGE = 100;
const DEFAULT_PROJECTILE_SPEED = 15;
const GRAVITY = 9.8;
const BASE_HIT_RADIUS = 0.5;
function normalize(vector) {
    const length = Math.sqrt(vector[0] * vector[0] + vector[1] * vector[1] + vector[2] * vector[2]);
    if (length === 0)
        return null;
    return [vector[0] / length, vector[1] / length, vector[2] / length];
}
function aimDirection(aim) {
    if ("origin" in aim)
        return normalize(aim.direction);
    const cosPitch = Math.cos(aim.pitch);
    return [Math.sin(aim.yaw) * cosPitch, Math.sin(aim.pitch), Math.cos(aim.yaw) * cosPitch];
}
function aimSpreadDeg(aim) {
    return "origin" in aim ? 0 : aim.spread ?? 0;
}
export function createProjectileSystem(deps) {
    const shots = new Map();
    let shotCounter = 0;
    const now = deps.now ?? (() => Date.now());
    function itemStat(via, stat) {
        return via.item === undefined ? null : deps.getStat(via.item, stat);
    }
    function shotOrigin(from, aim) {
        return "origin" in aim ? aim.origin : deps.spatial.positionOf(from);
    }
    function withWeaponSpread(via, aim) {
        if ("origin" in aim || aim.spread !== undefined)
            return aim;
        const spread = itemStat(via, "spread");
        return spread === null ? aim : { ...aim, spread };
    }
    const raycast = deps.raycast ??
        ((from, aim, range) => {
            const origin = shotOrigin(from, aim);
            if (origin === undefined)
                return [];
            const direction = aimDirection(aim);
            if (direction === null)
                return [];
            const spreadRad = (aimSpreadDeg(aim) * Math.PI) / 180;
            const hits = [];
            for (const instanceId of deps.spatial.inRadius(origin, range)) {
                if (instanceId === from)
                    continue;
                const position = deps.spatial.positionOf(instanceId);
                if (position === undefined)
                    continue;
                const dx = position[0] - origin[0];
                const dy = position[1] - origin[1];
                const dz = position[2] - origin[2];
                const along = dx * direction[0] + dy * direction[1] + dz * direction[2];
                if (along <= 0 || along > range)
                    continue;
                const px = dx - direction[0] * along;
                const py = dy - direction[1] * along;
                const pz = dz - direction[2] * along;
                const perpendicular = Math.sqrt(px * px + py * py + pz * pz);
                if (perpendicular > BASE_HIT_RADIUS + Math.tan(spreadRad) * along)
                    continue;
                hits.push({ instanceId, distance: along, at: position });
            }
            return hits.sort((a, b) => a.distance - b.distance);
        });
    function resolveRange(via) {
        return itemStat(via, "range") ?? DEFAULT_RANGE;
    }
    function isBallistic(via) {
        return itemStat(via, "projectile.fuseTime") !== null || itemStat(via, "explosion.radius") !== null;
    }
    function ballisticSettlePoint(input) {
        const origin = shotOrigin(input.from, input.aim) ?? [0, 0, 0];
        const direction = aimDirection(input.aim) ?? [0, 0, 1];
        const speed = itemStat(input.via, "projectile.speed") ?? DEFAULT_PROJECTILE_SPEED;
        const gravityScale = itemStat(input.via, "projectile.gravity") ?? 1;
        const fuseTime = itemStat(input.via, "projectile.fuseTime");
        const gravity = GRAVITY * gravityScale;
        const verticalSpeed = direction[1] * speed;
        const flightCap = fuseTime ?? resolveRange(input.via) / speed;
        const impactTime = gravity > 0
            ? (verticalSpeed + Math.sqrt(verticalSpeed * verticalSpeed + 2 * gravity * Math.max(0, origin[1]))) / gravity
            : flightCap;
        const flightTime = Math.min(impactTime, flightCap);
        const settledY = Math.max(0, origin[1] + verticalSpeed * flightTime - 0.5 * gravity * flightTime * flightTime);
        return [
            origin[0] + direction[0] * speed * flightTime,
            settledY,
            origin[2] + direction[2] * speed * flightTime,
        ];
    }
    function predictHits(input) {
        const aim = withWeaponSpread(input.via, input.aim);
        const rawHits = raycast(input.from, aim, resolveRange(input.via));
        const visible = rawHits.filter((hit) => deps.spatial.hasLineOfSight(input.from, hit.instanceId));
        return { rawHits, visible };
    }
    function settledAt(input, hits) {
        const first = hits[0];
        if (first !== undefined)
            return [first.at[0], first.at[1], first.at[2]];
        const origin = shotOrigin(input.from, input.aim);
        const direction = origin === undefined ? null : aimDirection(input.aim);
        if (origin === undefined || direction === null)
            return [0, 0, 0];
        const range = resolveRange(input.via);
        return [origin[0] + direction[0] * range, origin[1] + direction[1] * range, origin[2] + direction[2] * range];
    }
    return {
        willHitProjectile(input) {
            const { rawHits, visible } = predictHits(input);
            const prediction = {
                hits: visible.map(({ instanceId, distance }) => ({ instanceId, distance })),
            };
            if (rawHits.length > 0 && visible.length === 0)
                prediction.blocked = true;
            return prediction;
        },
        fireProjectile(input) {
            shotCounter += 1;
            const shotId = `shot_${shotCounter}`;
            shots.set(shotId, { input, firedAt: now(), settled: false });
            return shotId;
        },
        settleProjectile(shotId) {
            const shot = shots.get(shotId);
            if (shot === undefined)
                return { status: "rejected", shotId, reason: "unknown-shot" };
            if (shot.settled)
                return { status: "rejected", shotId, reason: "already-settled" };
            shot.settled = true;
            const { input } = shot;
            if (isBallistic(input.via)) {
                return { status: "settled", shotId, at: ballisticSettlePoint(input), hits: [] };
            }
            const { visible } = predictHits(input);
            const receivable = visible.filter((hit) => deps.effects.canReceive(hit.instanceId, input.effect) === null);
            const pellets = Math.max(1, Math.round(itemStat(input.via, "pellets") ?? 1));
            const hits = [];
            if (receivable.length > 0) {
                for (let pellet = 0; pellet < pellets; pellet++) {
                    const target = receivable[pellet % receivable.length];
                    hits.push(...deps.effects.applyEffect({
                        from: input.from,
                        to: target.instanceId,
                        effect: input.effect,
                        via: input.via,
                    }));
                }
            }
            return { status: "settled", shotId, at: settledAt(input, receivable), hits };
        },
    };
}

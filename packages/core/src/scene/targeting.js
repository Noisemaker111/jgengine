export function createTargeting(options) {
    const targets = new Map();
    function eligibleCandidates(fromId, filter, maxDistance) {
        const candidates = options.candidates().filter((id) => id !== fromId);
        const filtered = filter === "any" || options.classify === undefined
            ? candidates
            : candidates.filter((id) => options.classify(fromId, id) === filter);
        const inRange = maxDistance === undefined || options.distance === undefined
            ? filtered
            : filtered.filter((id) => {
                const distance = options.distance(fromId, id);
                return distance !== null && distance <= maxDistance;
            });
        if (options.orderBy === undefined)
            return inRange;
        return inRange.slice().sort(options.orderBy);
    }
    return {
        setTarget(fromId, toId) {
            if (toId === null)
                targets.delete(fromId);
            else
                targets.set(fromId, toId);
        },
        getTarget(fromId) {
            return targets.get(fromId) ?? null;
        },
        cycleTarget(fromId, cycleOptions = {}) {
            const candidates = eligibleCandidates(fromId, cycleOptions.filter ?? "any", cycleOptions.maxDistance);
            if (candidates.length === 0) {
                targets.delete(fromId);
                return null;
            }
            const direction = cycleOptions.direction ?? "next";
            const currentIndex = candidates.indexOf(targets.get(fromId) ?? "");
            let nextIndex;
            if (currentIndex === -1) {
                nextIndex = direction === "next" ? 0 : candidates.length - 1;
            }
            else {
                const step = direction === "next" ? 1 : -1;
                nextIndex = (currentIndex + step + candidates.length) % candidates.length;
            }
            const target = candidates[nextIndex];
            targets.set(fromId, target);
            return target;
        },
        clearAll(instanceId) {
            targets.delete(instanceId);
            for (const [fromId, toId] of targets) {
                if (toId === instanceId)
                    targets.delete(fromId);
            }
        },
    };
}

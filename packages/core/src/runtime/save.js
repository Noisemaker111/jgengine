export function parseSaveAutoMs(auto) {
    const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/.exec(auto.trim());
    if (!match) {
        throw new Error(`Invalid save.auto interval: ${auto}`);
    }
    const amount = Number(match[1]);
    const unit = match[2];
    switch (unit) {
        case "ms":
            return amount;
        case "s":
            return amount * 1_000;
        case "m":
            return amount * 60_000;
        case "h":
            return amount * 3_600_000;
        default:
            throw new Error(`Invalid save.auto unit: ${unit}`);
    }
}
export function saveScopeIncludesPlayer(scope) {
    return scope === "player" || scope === "player+chunks";
}
export function saveScopeIncludesChunks(scope) {
    return scope === "chunks" || scope === "player+chunks";
}
export function isSaveEnabled(config) {
    return config !== "none";
}

export function biomes(config) {
    return { kind: "biomes", ...config };
}
export function voxel(config) {
    return { kind: "voxel", ...config };
}
export function plots(config = {}) {
    return { kind: "plots", ...config };
}
export function tilemap(config) {
    return { kind: "tilemap", ...config };
}
export function flat() {
    return { kind: "flat" };
}

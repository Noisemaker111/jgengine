export const DUNGEONS = [
    {
        id: "hollow_crypt",
        name: "The Hollow Crypt",
        zone: "peaks",
        center: [110, 392],
        radius: 24,
        levelRange: [1, 7],
        entrance: [91.6, 376.6],
        inside: [105.4, 388.2],
    },
    {
        id: "sunken_bastion",
        name: "The Sunken Bastion",
        zone: "marsh",
        center: [-138, 62],
        radius: 22,
        levelRange: [12, 13],
        entrance: [-117.9, 53.0],
        inside: [-132.5, 59.5],
    },
    {
        id: "gravewyrm_sanctum",
        name: "Gravewyrm Sanctum",
        zone: "peaks",
        center: [-138, 250],
        radius: 26,
        levelRange: [19, 20],
        entrance: [-113.6, 258.9],
        inside: [-132.4, 252.0],
    },
    {
        id: "drowned_temple",
        name: "The Drowned Temple",
        zone: "marsh",
        center: [138, -20],
        radius: 22,
        levelRange: [16, 18],
        entrance: [116.2, -16.8],
        inside: [132.1, -19.1],
    },
    {
        id: "nythraxis_crypt",
        name: "Abandoned Crypt",
        zone: "vale",
        center: [-138, -370],
        radius: 18,
        levelRange: [20, 20],
        entrance: [-121.9, -361.9],
        inside: [-132.6, -367.3],
    },
    {
        id: "nythraxis_raid",
        name: "Nythraxis Raid Arena",
        zone: "peaks",
        center: [138, 430],
        radius: 28,
        levelRange: [20, 20],
        entrance: [117.6, 410.8],
        inside: [133.6, 425.9],
        raid: true,
    },
];
export function dungeonById(id) {
    for (const d of DUNGEONS) {
        if (d.id === id)
            return d;
    }
    return null;
}

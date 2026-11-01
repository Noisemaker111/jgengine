# Art direction

An autumn vale at the end of a campaign season: rust and gold forests, a blue Vanguard keep, red Marauder camps, smoke on the horizon. Painterly, saturated and readable from a high RTS camera, like a war table come to life.

## Reference images
- Warcraft III: Reforged for chunky, oversized unit silhouettes, team colour and saturated painterly ground.
- Age of Empires II: Definitive Edition for readable buildings and resource fields.
- Northgard for the autumn palette and fogged map edges.
- Film: the autumn battle light of *The Last Kingdom* (2015).

## World palette
- `#6f7a3a` autumn grass: the meadow.
- `#b5652a` rust leaf: forest canopy, fallen leaves.
- `#d9a441` harvest gold: fields, gold mine, highlights.
- `#2d5b8c` Vanguard blue: player cloth, roofs, banners.
- `#a3291c` Marauder red: enemy cloth and camps.
- `#8a8172` field stone: keeps, walls, roads edges.
- `#efe3c6` parchment haze: fog and UI paper.

## Material language
- Characters: Quaternius Lowpoly RPG Characters (`quaternius-lowpoly-rpg-characters`: Warrior, Ranger, Cleric, Monk, Rogue) for every unit and the hero Bram, team-tinted; weapons from `quaternius-lowpoly-medieval-weapons`. They replace the box-built miniatures.
- Environment: Quaternius Medieval Village MegaKit (`quaternius-medieval-village`, `quaternius-lowpoly-medieval-buildings`) for keeps, barracks, farms and towers; `quaternius-fantasy-props` for camp clutter; `quaternius-stylized-nature` for the autumn forest. One studio, one proportion, one flat-colour shading.
- Ground: ambientCG `Grass004` meadow tinted to autumn, `Ground037` on slopes, `Ground054` on the war-road, `Rock035` on cliffs.
- No primitive props: every primitive-built GLB from `scripts/author-models.mjs` (units, buildings, banners, barrels, goldmine) is replaced by a pack model.

## Lighting mood
- Golden late afternoon in autumn, sun low in the south-west (azimuth 225, elevation 30), key `#ffc98a`.
- Fill: cool blue-grey sky so team blue stays clean in shadow.
- Fog `#d8c9a8`, near 90, far 220: the map edge dissolves like an unexplored war-table margin.
- HDRI: Poly Haven `qwantani_dusk_2_puresky` at intensity 0.7.
- LUT grade "autumn painterly": shadows `#2a2f3c`, midtones `#d1a46a`, highlights `#ffe6b8`, saturation 1.15, contrast 1.08, tint 0.35.

## Silhouette rules
- Units are oversized for the camera, each class with one shape cue: shield (footman), long gun (rifleman), sack or tool (peasant), cape and big weapon (hero).
- Buildings are wider than tall except towers; each building type has its own roof shape.
- Team colour covers at least a third of every unit and building from above.
- Forests form solid masses with clear edges; no lone scattered trees on paths.

## UI typography
- Display: IM Fell English SC (Google Fonts, OFL). Body: Alegreya (Google Fonts, OFL). Both already ship in `src/art/fonts/`.
- HUD kit: `parchment`, accent `#8e1f17` wax red. Set it as `uiKit` so the shell kit matches the war-table CSS.

## Chosen look
- `look: "cinematic"`, `mood: { preset: "golden", sun: { azimuth: 225, elevation: 30, color: "#ffc98a" }, horizonColor: "#d8c9a8", fog: { near: 90, far: 220 } }`.
- Environment source `{ kind: "hdri", url: <qwantani_dusk_2_puresky>, intensity: 0.7 }`.
- Post: ACES, SMAA, AO back on at 1.2, the LUT above in place of the hand lift and gain, vignette 0.2.

## Pass list
1. Replace every box-built unit with Quaternius RPG Characters, team-tinted, with pack weapons.
2. Replace keeps, barracks, farms and towers with Quaternius Medieval Village buildings.
3. Turn the forest ring autumn: stylized-nature trees in rust and gold, leaf litter at the edges.
4. Dress the ground: autumn-tinted Grass004, Ground054 war-road, fields as crop patches.
5. Set the golden mood, the HDRI and the autumn painterly LUT.
6. Set the parchment kit with the wax red accent as `uiKit`.
7. Delete the unused deepward GLBs from `public/models/imported/`.
8. Ambient life: chimney smoke, crows over the woods, banners in the wind, torches at camps.

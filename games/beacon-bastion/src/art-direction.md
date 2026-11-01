# Art direction

A tabletop-bright highland pass: a stone keep, a burning beacon, chunky toy-scale raiders walking a worn ochre road through pine and heather. Everything reads at the tower-defense zoom: you see role, rank and health from 40 m up.

## Reference images
- Kingdom Rush: Vengeance for tower readability and chunky, bright units at a high camera.
- Bad North for the clean, low-saturation island ground and the way small units pop against it.
- Dorfromantik for dense, layered ground cover with no bare patches.
- Film: the Scottish highland light of *Outlaw King* (2018): low cloud, wet green, warm fire.

## World palette
- `#5b7a3a` moss: the meadow and pine canopy.
- `#8b7f6c` granite: keep, plots and boulders.
- `#c49a5a` road ochre: the raider road and build pads.
- `#3e4a56` slate: roofs, shadow side of stone, deep pine.
- `#ff8a2a` beacon fire: the beacon, braziers, tower hits. Nothing else in the world is this orange.
- `#8a2414` raider red: raider cloth and banners.
- `#c9d6d8` highland haze: horizon and fog.

## Material language
- Characters: KayKit Character Pack Adventurers (`kaykit-adventurers`: Knight, Barbarian, Rogue, Mage) as the human raiders, KayKit Skeletons (`kaykit-skeletons`) as the undead. One chibi family, one gradient-texture shading.
- Rocketbox humans (`human/jogger`, `human/police-officer-female` and the rest) leave this game: modern clothes and realistic proportions break the scale.
- Environment: KayKit Medieval Hexagon (`kaykit-medieval-hexagon`): `building_tower_A`/`B` for archer and arcane towers, `building_tower_catapult` for the cannon, `building_castle` for the keep, `fence_stone_straight` and `flag` for walls and banners, `crate_*`, `barrel`, `bucket_arrows` as clutter. Same studio, same proportions as the characters.
- Trees and rocks: add KayKit Forest Nature Pack (CC0) to the catalog and replace the Quaternius pines; Quaternius stylized trees are a different proportion and shading from KayKit.
- Ground: ambientCG `Grass004` meadow blended with `Ground037` on slopes; the road is `Ground054` packed dirt; plots are `PavingStones070` set into the ground.
- No primitive props: the cylinder plots, box scaffold and box spawn gate become `building_scaffolding`, `building_stage_A`–`C` and a `fence_stone_straight_gate` arch.

## Lighting mood
- Late afternoon, sun low in the west (azimuth 240, elevation 34), warm key `#ffd9a8`.
- Cool sky fill from the HDRI; shadows lean slate blue.
- Fog `#c9d6d8`, near 120, far 260: the far ridges fade, the road stays crisp.
- HDRI: Poly Haven `kloofendal_48d_partly_cloudy_puresky` at intensity 0.8, rotated so the sun patch sits behind the keep.
- LUT grade "warm filmic": shadows `#2b3442`, midtones `#cdb48a`, highlights `#ffe2b0`, saturation 1.08, contrast 1.1, tint 0.35.

## Silhouette rules
- Towers are tall and narrow, each with a distinct crown (arrow slit roof, catapult arm, frost crystal, arcane orb); readable as black shapes.
- Raiders are short and wide; the heavy ones carry a big shield or two-handed weapon so rank shows in outline.
- The keep is the tallest thing on the map; the beacon flame sits on top and is always visible.
- Trees stay below tower height near the road; tall pines only on the map edge.

## UI typography
- Display: Cinzel (Google Fonts, OFL). Body: Alegreya Sans (Google Fonts, OFL). Both already ship in `src/art/fonts/`.
- HUD kit: `parchment`, accent `#d9541e` beacon ember.
- Numbers (gold, lives, wave) set in Alegreya Sans tabular figures; Consolas and Segoe UI leave `src/preview.tsx`.

## Chosen look
- `look: "cinematic"`, `mood: { preset: "golden", sun: { azimuth: 240, elevation: 34, color: "#ffd9a8" }, horizonColor: "#c9d6d8", fog: { near: 120, far: 260 } }`.
- Environment source `{ kind: "hdri", url: <kloofendal_48d_partly_cloudy_puresky>, intensity: 0.8 }`; restore image-based light now that it has a real sky to sample.
- Post: keep ACES and the 0.22 vignette; drop the hand gain in favour of the LUT above.

## Pass list
1. Swap every Rocketbox raider for a KayKit Adventurers model; keep the KayKit Skeletons.
2. Rebuild towers and keep from KayKit Medieval Hexagon buildings; retire the dungeon wall pieces.
3. Add KayKit Forest Nature Pack and replace the Quaternius pines and rocks with it.
4. Dress the ground: Grass004 and Ground037 on the terrain, Ground054 on the road, scatter grass and heather so no flat green shows.
5. Replace the primitive plots, scaffold and spawn gate with hexagon-pack pieces.
6. Set the golden mood, the HDRI and the warm filmic LUT.
7. Switch the HUD to the parchment kit with the ember accent; strip system fonts from the preview.
8. Ambient life: smoke from the beacon and braziers, birds over the ridge, banners that move.

# Art direction

A sprawling, overgrown suburb on a bright summer afternoon, drawn like a Saturday-morning cartoon:
ink outlines, cel shadows, mown stripes gone wild, colourful junk everywhere. The appliances are the
only hard, shiny, angry things in it. Loud and friendly, readable at a sprint.

## Reference images
- *Toy Story* for household objects with big personalities and readable faces.
- Saturday-morning cartoons for flat bright colour and ink lines.
- Suburban America after a long neglect: lawns knee-high, cars left in driveways, yard-sale signs.
- Destiny 2 for clean combat readability; Diablo III for the joy of a drop.

## World palette
- `#9fd35a` sunlit lawn: the rises and open yards.
- `#3f7a2c` shaded lawn: hollows and the shadow side.
- `#2f8be0` summer sky: zenith; `#d9eefc` at the horizon.
- `#5b5d63` asphalt: streets, with painted centre lines.
- `#ff3b30` LED red: every hostile appliance's eyes. Nothing friendly uses it.
- `#ffd23f` sunny yellow: UI accent, school bus, the bus stops.
- `#ff6fb5` flamingo pink and `#2f6fd6` recycling blue: landmark colour.
- `#121a31` navy enamel: UI panels.

## Material language
- Appliances: built from primitives in `src/game/world/applianceModel.ts` — enamel white, chrome and
  toy-bright plastic, each with two glowing red LED eyes and a scowling brow. One silhouette per type:
  disc (Roomba), tripod (sprinkler), tall box (fridge), quadcopter (drone), deck and handle (mower),
  ribbed panels (garage door), cylinder with a light ring (speaker), and bosses that are those shapes
  made huge (riding mower, trash compactor, leaf blower with a crown, a router with six antennas).
- Weapons: built from their parts in `src/game/world/junkModel.ts` — the body in its real colours
  (red staple gun, contractor-yellow nail gun, orange leaf blower, green hose, white microwave, chrome
  toaster, red vacuum, red extinguisher), the mod strapped on (silver tape bands, an orange extension
  cord coil, AA batteries, a glitter jar with sparkles, a cinder block, rubber bands, a bundle of
  firecrackers, a blue laundry basket), googly eyes whose brows give the personality, rust scuffs on
  Busted junk and a lit trim line on Like New and better.
- Props: Quaternius packs re-dressed (stylized-nature bushes and trees, toon-shooter cars, sofas,
  boxes, cones and bins); giant lawn flamingos, yard-sale signs and telephone poles are primitive-built
  in `src/game/world/yardProps.tsx`. NPCs are Quaternius Toon Shooter characters; DING is the animated
  low-poly robot.
- Ground: overgrown-lawn grass over a green terrain gradient with patchy yard speckle, asphalt
  streets with markings, ambientCG `Ground031` grain at low tint.

## Lighting mood
- A clear summer afternoon (sun elevation 58, key `#fff1d0`), short shadows.
- Fill: a soft sky-blue hemisphere over a lawn-green ground bounce.
- Fog `#c8e2f2`, near 90, far 2400: far rooftops and hills fade toward the sky.
- HDRI: `clear-noon` at 0.85. LUT: `vivid-pop` (punchy saturated cartoon colour).

## Silhouette rules
- Every appliance has a distinct outline at 40 m and the same red-eye tell.
- Weapons read by body shape first, mod second, eyes third.
- Bosses are two to three times their gang's size.

## UI typography
- Display: Russo One. Body: Chakra Petch (both OFL).
- HUD: native Rune primitives with the kitchen-radio theme (`src/game/ui/kit.tsx`): navy enamel
  panels, sunny-yellow trim, mint screens. Weapon chatter is a cream speech bubble trimmed in the
  personality's colour.

## Chosen look
- `look: "comic"`, `mood: { preset: "day", sun: { elevation: 58, color: "#fff1d0" }, skyColor: "#2f8be0", horizonColor: "#d9eefc" }`.
- Post: comic outline and cel bands, bloom on emissives only (LED eyes, glitter, heirloom trim), vignette 0.2, the LUT above.

## Pass list
1. Done: procedural appliances, junk viewmodels, re-dressed props, summer sky and lawns.
2. Author houses, fences, driveways and cul-de-sacs through the editor.
3. Ambient life: sprinklers ticking, a stray drone on the horizon, leaves on the wind.

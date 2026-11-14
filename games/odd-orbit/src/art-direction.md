# Art direction

NO VACANCY is a cramped boarding house bolted to the side of a space station: chunky retro-futurist
modules in enamel cream, each lit from inside in its own pastel, hanging against black space. A neon
sign over the airlock says whether there is room. Cosy, funny and warm; the house is a dollhouse seen
from above, its rooms cut away toward the camera so every tenant is readable at a glance.

## Reference images
- *The Sims 2* for the cut-away house and moods read off a body at a glance.
- *Animal Crossing* interiors for chunky, rounded fittings and soft interior light.
- 1960s–70s space-age design (Eero Saarinen, Joe Colombo, *2001*'s Space Station V lounge) for the
  modules: rounded slabs, portholes, ribbed crowns, gunmetal trim.
- Film: *Lilo & Stitch* (2002) and *WALL-E* (2008) for lovable alien and robot silhouettes.

## World palette
- `#05040c` deep space: sky and the gaps between modules.
- `#1d1a2b`–`#2c2840` station hull plating: the deck outside.
- `#f4ead8` enamel cream: module shells, UI paper.
- `#4a4566` gunmetal: slabs, trim, door frames.
- Room air on the floor: `#9fe0c4` mint oxygen, `#c9ec5f` lime methane, `#b9a6ff` lilac vacuum.
- Room light in porthole and ceiling strip: `#3b4cff` dark, `#ffc98a` dim, `#fff6d8` bright.
- Room warmth on the floor rim: `#7fd2ff` cold, `#ff9a52` hot.
- Neon: `#ff5fa8` NO, `#6ff3ff` VACANCY.
- Comfort lamps over each door: green delighted, lime comfortable, amber grumbling, red miserable.

## Material language
- Tenants are original procedural three.js figures (`render/TenantMesh.tsx`), one silhouette per
  species: Glorp a translucent jelly with three eye stalks and rising bubbles; Sister Fog a drifting
  cluster of mist puffs with two dark eyes; Krrt three glossy segments on six legs with antennae;
  the Twins one pear-shaped body with two arguing heads in different hats; Old Basalt a flat-shaded
  cairn with a forge glowing in its cracks; Pip-9 a boxy teal robot with one big cyan lens, a blinking
  antenna and wheels; Velvet a banded gas giant floating on tendrils, in a gold monocle and crown.
- Room modules, the corridor, the scaffold on berths still for sale and the neon sign are drawn from
  the room model (`render/RoomModules.tsx`): slab, inset air-tinted floor, back wall with porthole,
  low side walls, ribbed crown, door frame, gasket bars when sealed, shutter bar when shuttered,
  floating motes in low gravity and grip plates in heavy gravity, a haze where the wrong air leaks in.
- The commons keeps its KayKit furniture (`kaykit-furniture`) and KayKit Space Base shell
  (`kaykit-space-base`); the station masts outside are KayKit Space Base turbines. Outdoor flora left
  with the moon; nothing grows on a hull.
- Ground: ambientCG gravel scan tinted to dark hull plating outside; the commons' authored floors.

## Lighting mood
- Deep space: near-black sky (`night` preset, zenith `#05040c`, horizon `#2a2150`), hazy fog far out.
- One hard white key from the star (`#fff1d6`), a faint violet fill from the station's running lights.
- Each room carries its own point light tinted by its light setting and its air: the rooms, not the
  sun, give the frame its colour.
- HDRI: Poly Haven night sky (`night-clear`) at 0.35 for reflections only.
- Post: ACES, bloom 0.55 (threshold 0.82) so the neon, portholes and comfort lamps glow, AO 1.6,
  the `pastel` LUT, vignette 0.34.

## Silhouette rules
- Every species reads from its outline alone at the default camera height; no two share a shape.
- Modules are slabs with rounded detail and portholes; the cut-away side always faces the camera.
- The neon sign is the brightest thing on screen when the house is full.

## UI typography
- Display: Comfortaa (OFL). Body: Quicksand (OFL). Both ship in `src/art/fonts`.
- The HUD is a front desk: enamel key-tags for tenants (with a comfort pill), ledger magnets, the
  Dockmaster's lease note, the airlock buzzer slip, and a Rooms plan drawn as a blueprint of berths.

## Pass list
1. Procedural tenant figures, one per species; retire the generated monster bodies. (done)
2. Room modules, corridor, scaffold berths and neon sign from the room model. (done)
3. Space mood: night sky, hard key, pastel room lights, bloom, LUT. (done)
4. Strip the moon flora from the authored scene; keep masts. (done)
5. Station hull detail outside the house (pipes, gantries, docked shuttles) through the editor.
6. Tenant idle animations per species tied to comfort (Glorp sags, Velvet deflates, Pip-9 droops).

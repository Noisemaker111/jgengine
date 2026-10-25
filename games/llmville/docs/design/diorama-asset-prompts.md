# LLMville — Diorama Asset Prompt Library

Generation prompts for every 3D model and surface texture in the world. The goal is a
**cozy stylized miniature diorama at golden hour** (see `DESIGN.md`) — every asset must read
like it belongs in the same toy-model lab, not 40 mismatched downloads.

How to use this file:
- **Always prepend the [Style Bible](#0-style-bible) block** to every model prompt. The per-asset
  text below only describes what's *unique* about that asset.
- File paths under each asset are where the engine already expects the `.glb` / texture
  (`worldModelCatalog.ts`, `materials.json`, `*.map.json`). Drop the output there and it lights up.
- Tooling (agent): **fal.ai MCP** + `.cursor/skills/diorama-assets-fal/SKILL.md` — flux concept
  image → Trellis 2 GLB → `apps/web/public/models/…`. Setup: `bun run assets:setup-fal`.
  Manual/alternate: Meshy / Tripo / Rodin / Hunyuan3D with **PBR / fully textured** mode,
  export **GLB, Y-up, meters**. Tileable surfaces (§2) come from a **texture/PBR generator**,
  not the mesh tool — see that section.

---

## 0. Style Bible

> **Reusable STYLE SUFFIX — paste at the end of every model prompt:**
>
> `Stylized cozy miniature-diorama art style: chunky slightly-exaggerated proportions, soft
> rounded/chamfered edges (no razor-sharp CG corners), hand-painted PBR materials with gentle
> matte finish and soft micro-bevels that catch warm light. Warm "golden hour" friendly palette
> built around deep teal-green, cream, soft teal accent, warm coral, and amber wood. Clean
> readable silhouette from a third-person gameplay distance, no tiny illegible greebles. Even
> neutral studio lighting baked flat — NO baked harsh shadows, NO baked sun highlights, NO
> ground shadow (the game engine relights it). Single tidy PBR material set, ~2K textures,
> game-ready low/mid quad topology, watertight, clean UVs, no overlapping shells. Isolated single
> asset, pure transparent/empty background, no scene, no stand, no base plate unless specified.
> Model centered on origin; floor-standing objects sit with their base at Y=0 (feet on the
> ground), wall-mounted objects have their back face on the origin plane. Real-world scale.`

**Global rules (apply to all assets):**

| Rule | Value |
| --- | --- |
| Grid module | **1 cell = 1 meter** — integer footprints only (`width: 3` means 3 m). See `docs/design/asset-spatial-contract.md` |
| Forward / North | **+Z** toward tier front door. Facing **0 = N**, 1 = E, 2 = S, 3 = W |
| Origin | Floor props: base-center at Y=0. Wall pieces: back-face on origin. Hand-held: grip at origin |
| Lighting | Flat/neutral — engine adds the golden-hour light. Reject outputs with baked shadows |
| Palette anchors | ink `#16201E`, cream `#F4ECDD`, teal `#5FC2A8`, coral `#E8836B`, amber `#E0A95C`, wood `#B07A4E` |
| Forbidden | Real brand logos/wordmarks, photoreal grime, neon purple/cyan, text labels, baked backgrounds |
| Tier feel | garage = scrappy/raw · apartment = warm cozy · house = upscale cozy · datacenter = clean industrial |

**Naming convention** (so each tier reads as a real upgrade, not a recolor):
- **Garage** props look hand-me-down: bare metal, OSB, mismatched, a little worn-but-loved.
- **Apartment** props are warm IKEA-cozy: light oak, soft fabric, plants.
- **House** props are upscale-cozy: walnut, wainscot, brass accents.
- **Datacenter** props are clean-industrial: powder-coat steel, perforated panels, teal/amber LEDs.

---

## 1. Architecture Kit (modular building pieces)

These are the new modular pieces that replace "one painted box = one wall." Author them at a shared **1 m cell module** (matches `TILE_SIZE = 1`). Keep wall thickness ≈ 0.2 m of visible face; the structural collider box stays in code.

Suggested folder: `/models/kit/`

### Wall panels (one per tier style)
Generate a **1 m wide × 3.2 m tall** wall panel section, back face flat on origin.

- `kit/wall-garage.glb` — Raw garage wall panel: unfinished painted cinderblock / exposed stud
  bay with OSB sheathing, a little scuffing, one conduit run. Cool grey-green concrete tone.
- `kit/wall-apartment.glb` — Cozy apartment wall panel: smooth painted drywall in warm cream,
  subtle orange-peel texture, a faint seam line. Clean and inviting.
- `kit/wall-house.glb` — Upscale wall panel: lower-third walnut wainscot paneling with a chair
  rail, painted upper wall in warm sage, crisp trim. Refined and warm.
- `kit/wall-datacenter.glb` — Server-room wall panel: powder-coated steel paneling with subtle
  perforation, a recessed cable channel, faint teal under-glow strip. Clean industrial.

### Trim & joinery (shared, recolorable in-engine)
- `kit/baseboard.glb` — Chamfered skirting board strip, 1.2 m long, ~0.12 m tall, simple stepped
  profile. Reads as painted wood. (Used along every floor/wall seam.)
- `kit/crown-molding.glb` — Crown molding strip, 1.2 m long, gentle cove profile, painted finish.
- `kit/chair-rail.glb` — Slim horizontal trim rail, 1.2 m, rounded profile.
- `kit/corner-post.glb` — Vertical corner pillar, 0.22 m square × 3.2 m, soft chamfered edges —
  sits at wall joins to hide box-intersection seams. Painted trim look.

### Openings
- `kit/door-frame.glb` — Cozy interior door frame + trim casing, ~1.0 m × 2.1 m opening, soft
  rounded jamb, no door slab (the door is a separate set piece). Painted wood.
- `kit/door-garage.glb` — Roll-up sectional garage door, ribbed horizontal panels, slightly worn
  white-grey, small row of window lites near the top. ~2.6 m × 2.4 m.
- `kit/window-frame.glb` — Warm residential window frame with sill and mullions, ~1.4 m × 1.3 m,
  light wood/cream, empty glass area (engine adds a glow plane).
- `kit/window-industrial.glb` — Steel-framed datacenter observation window, dark powder-coat
  mullions, ~2.0 m × 1.4 m.

### Floor inserts (decorative, sit on top of the base floor plane)
- `kit/rug-apartment.glb` — Cozy woven area rug, warm cream + teal geometric pattern, soft frayed
  edge, ~2.4 m × 1.6 m, ~1 cm thick.
- `kit/rug-house.glb` — Upscale patterned wool rug, warm amber + sage medallion pattern, ~3 m × 2 m.
- `kit/floor-grate-datacenter.glb` — Raised-access perforated floor panel, 1.2 m square, dark
  steel, subtle airflow holes, ~5 cm raised.

### Ceiling pieces (one treatment per tier — mount under `wallHeight`)
- `kit/ceiling-beam-garage.glb` — Exposed wooden joist/beam, 1.2 m segment, plus a bare
  hanging shop light fixture (cool white, emissive off — engine drives the glow).
- `kit/ceiling-trough-apartment.glb` — Recessed cove light trough strip, 1.2 m, painted, warm
  emissive channel for indirect light.
- `kit/ceiling-coffer-house.glb` — Coffered ceiling tile, 1.2 m square, recessed panel with trim
  border, warm painted finish.
- `kit/ceiling-tile-datacenter.glb` — Drop-ceiling acoustic tile + T-bar grid, 1.2 m square, plus
  a recessed LED troffer (emissive cool white channel).
- `kit/cable-tray.glb` — Overhead steel cable tray run, 1.2 m, with neatly bundled cables — for
  datacenter & garage ceilings.

### Small detail scatter (the "this is a real room" secret sauce)
Tiny props placed by rule along walls. Keep them ~0.1–0.3 m, super low-poly.
- `kit/detail-outlet.glb` — Wall power outlet + faceplate.
- `kit/detail-switch.glb` — Light switch plate.
- `kit/detail-vent.glb` — HVAC wall/ceiling vent grille.
- `kit/detail-thermostat.glb` — Small wall thermostat with a tiny readout (no text).
- `kit/detail-conduit.glb` — Vertical conduit/pipe run, 1.0 m segment with a clamp.
- `kit/detail-firealarm.glb` — Small red fire-alarm pull / extinguisher on a bracket.
- `kit/detail-sconce.glb` — Warm wall sconce light fixture (emissive shade).

---

## 2. Surface Textures (tileable PBR — the wall/floor/ceiling skins)

**These are NOT mesh prompts.** Generate them in a PBR/texture tool (Meshy texture mode, Poly,
Polycam, Substance Sampler, or SD + a normal/AO baker). Each needs the full map set.

> **Reusable TEXTURE SUFFIX:** `Seamless tileable PBR material, top-down flat orthographic
> capture, even neutral lighting with no directional shadows. Deliver albedo/diffuse + normal +
> roughness + ambient-occlusion maps, 2K, designed to tile at roughly 2 m. Stylized cozy-diorama
> look: gently hand-painted, soft natural variation, subtle large-scale macro tone shift to break
> obvious repetition, NOT photoreal-grimy. Warm golden-hour-friendly tone.`

Wire the extra maps through the existing `MaterialRegistryEntry` (`diffuse` + `normal` +
`roughness` + add `ao`). Files go in `/textures/`, registered in `materials.json`.

| Material key | File stem | Prompt core (prepend nothing, append TEXTURE SUFFIX) |
| --- | --- | --- |
| `garage-floor` | `/textures/garage-floor` | Worn sealed-concrete garage floor, faint oil staining, light hairline cracks, cool grey with warm undertone, a painted parking-line hint |
| `garage-wall` | `/textures/garage-wall` | Painted cinderblock / concrete wall, visible mortar grid, scuffs, grey-green, matte |
| `apartment-floor` | `/textures/apartment-flooring` | Warm light-oak plank flooring, clean satin finish, gentle plank-to-plank tone variation, cozy |
| `apartment-drywall` | `/textures/apartment-drywall` | Smooth painted drywall, warm cream, faint orange-peel roller texture, soft |
| `apartment-ceiling` | `/textures/apartment-ceiling` | Flat painted ceiling, off-white warm, very subtle stipple |
| `house-floor` | `/textures/house-floor` | Wide-plank walnut herringbone, upscale satin finish, warm rich brown, refined |
| `house-wall` | `/textures/house-wall` | Painted upper wall in warm sage above implied wainscot, smooth premium matte |
| `datacenter-floor` | `/textures/datacenter-floor` | Raised-access steel floor panels, subtle seams + bolt pattern + airflow perforations, cool grey, clean |
| `datacenter-wall` | `/textures/datacenter-wall` | Powder-coated perforated steel wall panel, faint teal accent line, clean industrial, dark cool grey |

> Note: today's `datacenter-*.png` and `house-*.png` are 1–2 KB flat-color placeholders — these
> are the priority regenerations.

---

## 3. Infrastructure (racks, GPUs, power)

Folder: `/models/infrastructure/` and `/models/hardware/`. These already have rough prompts in
`worldModelCatalog.ts`; below are the diorama-tuned versions.

### Racks
- `infrastructure/small-rack.glb` — Compact 4-slot AI starter rack, ~0.6 m × 0.6 m × 1.0 m tall,
  scrappy powder-coated steel frame, open front with 4 GPU bays, a couple of friendly teal status
  LEDs, tidy cable loom down one side. Garage-grade but cared-for.
- `infrastructure/dense-rack.glb` — Mid 8-slot compute rack, ~0.7 m × 0.7 m × 1.6 m, heavier steel
  chassis, two columns of bays, small fan grilles, amber + teal indicator dots. Cozy-pro.
- `infrastructure/cooling-rack.glb` — Tall 32-scale enterprise rack, ~0.8 m × 1.0 m × 2.1 m,
  perforated front door, visible intake fans, clean cable management arm, premium powder-coat,
  row of teal LEDs. Clean-industrial.
- `infrastructure/rack-rail.glb` — Empty rack-mount rail/shelf unit insert (for partial fills).

### GPUs (you only need ~6 archetypes — the code buckets 24 SKUs into shared models)
Base prompt: a single graphics card hero prop, accurate board proportions, visible cooler shroud,
fan(s), PCIe bracket and connector fingers, soft-beveled edges, readable from a slot in a rack.

- `models/low-end-gpu.glb` (shared by `gpu_1`–`gpu_8`) — Single-fan budget consumer card, short
  PCB, plain dark shroud, one small teal accent. Humble.
- `hardware/gpu-consumer-mid.glb` (gpu_9–13) — Dual-fan consumer card, mid length, two-tone dark
  shroud, subtle accent strip.
- `hardware/gpu-consumer-high.glb` (gpu_14–16, e.g. 4090) — Chunky triple-fan flagship, thick
  premium shroud, glowing teal accent line, beefy backplate. Hero card.
- `hardware/gpu-workstation.glb` (gpu_17–19, A-series) — Blower-style single-fan pro card, sleek
  uniform shroud, amber accent. Clean professional.
- `hardware/gpu-datacenter.glb` (gpu_20–23, A100/H100) — Passive SXM/board-style accelerator, no
  fans, dense heatsink fins, gold-ish contacts, teal status dot. Serious silicon.
- `hardware/gpu-flagship.glb` (gpu_24, B200) — Oversized dual-die accelerator module, heavy vapor
  chamber, premium dark + teal, faint glow. The crown jewel.

### Power & cooling extras
- `infrastructure/pdu.glb` — Vertical power distribution strip with friendly outlets + a teal
  power LED.
- `infrastructure/ups.glb` — Small uninterruptible-power-supply box, status lights.
- `infrastructure/cooling-unit.glb` — Floor-standing CRAC/AC cooling unit for datacenter, louvered
  front, fan top.
- `infrastructure/cable-bundle.glb` — Tidy floor cable bundle/snake, recolorable.

---

## 4. Furniture & Decor

Folders: `/models/furniture/`, `/models/decor/`.

### Decor
- `decor/neon-sign.glb` — Wall startup neon sign, friendly looping tube shape spelling an abstract
  spark/leaf (no real words), warm coral + teal tubes, metal backplate, emissive baked subtle.
- `decor/potted-plant.glb` — Cozy office plant, ceramic planter, lush rounded leafy silhouette,
  warm + green. (Make 2 size variants: tabletop + floor.)
- `decor/holo-poster.glb` — Slim freestanding holographic poster stand, translucent teal panel,
  abstract benchmark-chart vibe, no text.
- `decor/wall-art.glb` — Framed cozy abstract art piece for walls, warm palette.
- `decor/string-lights.glb` — Warm string/fairy lights swag, small emissive bulbs.
- `decor/whiteboard-wall.glb` — Wall whiteboard, aluminum frame, marker tray, faint abstract
  sketch marks (no legible text).

### Furniture — shared / office
- `furniture/desk.glb` — Cozy work desk, light wood top, slim legs, cable grommet. (Hero — most-used.)
- `furniture/office-chair.glb` — Friendly rounded task chair, fabric seat, 5-star base, teal accent.
- `furniture/monitor-setup.glb` — Dual monitors + keyboard on a desk mat, screens dark (engine adds
  glow). Slightly chunky.
- `furniture/beanbag-corner.glb` — Oversized plush beanbag, soft folds, warm fabric.
- `furniture/coffee-cart.glb` — Rolling espresso cart, metal frame, machine + mugs + shelf, cozy.
- `furniture/bookshelf.glb` — Shelf unit with books, boxes, a plant, a mug — warm clutter.
- `furniture/server-bench.glb` — Workbench with a half-built rig, tools, a soldering iron.

---

## 5. Per-Tier Set Pieces

Folder: `/models/maps/`. These anchor each tier's identity.

### Garage
- `maps/garage-car.glb` — Worn compact hatchback, everyday believable, slightly stylized chunky
  proportions, faded paint, parked. (Already pathed to `/models/car.glb` in code — keep or repath.)
- `maps/garage-workbench.glb` — Pegboard workbench, wood top, hung tools, parts bins, scrappy.
- `maps/garage-shelving.glb` — Metal utility shelving with bins, boxes, a car battery, paint cans.
- `maps/garage-toolchest.glb` — Red rolling tool chest, drawers, a little worn.

### Apartment
- `maps/apartment-kitchen-unit.glb` — Compact kitchenette: lower cabinets, countertop, small
  appliances, warm cozy.
- `maps/apartment-bed.glb` — Low modern bed, upholstered frame, pillows + blanket with soft folds.
- `maps/apartment-couch.glb` — Compact loveseat, soft cushions, warm fabric.
- `maps/apartment-fridge.glb` — Modern fridge, clean seams + handle.
- `maps/apartment-side-table.glb` — Small round wood side table, slim base.
- `maps/apartment-chair.glb` — Simple modern dining chair, wood/powder-coat.
- `maps/apartment-floor-lamp.glb` — Slim floor lamp, warm shade (emissive subtle).

### House
- `maps/house-worktable.glb` — Rectangular walnut worktable, sturdy legs, upscale.
- `maps/house-couch.glb` — Two-seat upscale couch, soft cushions, wooden feet.
- `maps/house-tall-storage.glb` — Tall storage cabinet, clean modern finish, subtle handles.
- `maps/house-kitchen-island.glb` — Kitchen island with stools, warm walnut + stone top.

### Datacenter
- `maps/datacenter-server-row.glb` — Large server aisle block, several cabinets merged, dense front
  panels, tidy cabling, teal/amber LED rows, clean industrial.
- `maps/datacenter-loading-platform.glb` — Low industrial loading dock platform, reinforced metal
  deck edges, light wear.
- `maps/datacenter-aircon.glb` — Large wall/floor cooling unit, louvers, fans.

---

## 6. Characters & Body (fix the "no body")

Folder: `/models/characters/`. Stylized **chibi diorama character** — rounded, 3–4 heads tall,
simple friendly face, fits the toy-room. Author T-pose, rigged if your tool supports it.

- `characters/founder-human.glb` — Cozy chibi human founder/player avatar, rounded body, simple
  warm face, casual hoodie + jeans, cream/amber clothing with a teal accent, friendly. Neutral
  T/A-pose, base at feet.
- `characters/agent-bot.glb` — Chibi AI-agent character, same proportions as the founder but
  clearly a friendly little robot/android: smooth shell body, soft glowing teal "eyes/visor"
  (emissive), rounded antenna, cream + teal. Reads as the founder's helper, not a threat.
- `characters/avatar-base.glb` *(optional)* — A single neutral chibi base body you recolor in
  engine (cream body, swappable accent) to cover both human + agent cheaply.

### First-person viewmodel (the player's own hands)
- `characters/fp-hands.glb` — First-person stylized forearms + hands, cozy hoodie cuffs, neutral
  relaxed pose, modeled to sit at the bottom of the camera view. Slightly chunky cartoon hands.
- `characters/fp-tablet.glb` — A held tablet/clipboard for the hands to carry (matches the in-game
  tablet UI), dark frame, teal screen glow (emissive). Grip point at origin.

---

## 7. Generation Workflow & QA Checklist

**Order to generate (matches the build phasing):**
1. **Surface textures (§2)** — biggest visual jump, unblocks every wall/floor/ceiling.
2. **Architecture kit (§1)** — baseboards, crown, corner posts, openings, ceiling pieces.
3. **Infrastructure (§3)** — racks + the 6 GPU archetypes (these were rendering as *nothing*).
4. **Furniture/decor + set pieces (§4–5)** — fill the rooms.
5. **Characters & body (§6)** — hands + chibi avatars.

**Accept/reject each generated asset on:**
- [ ] Reads clearly at gameplay distance; silhouette is clean (squint test).
- [ ] **No baked shadows or baked sun highlights** (kills engine lighting — most common reject).
- [ ] Soft beveled edges, not razor-sharp; chunky-but-tidy, on-palette.
- [ ] Correct scale vs. a 1.7 m reference; origin/base at Y=0.
- [ ] Single material set, ≤ ~20–40k tris for props, watertight, no inside-out faces.
- [ ] No real logos / no legible text / not photoreal-grimy.
- [ ] Exports clean GLB, drops into the pathed slot, lights up in-scene.

**Engine fallback to add (so a missing/ugly model never blanks the world):** if a `.glb` fails to
load, render the existing procedural primitive prop instead of `null` (today `SceneModel` returns
`null`, which is why missing models are invisible).

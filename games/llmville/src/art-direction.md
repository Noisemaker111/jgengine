# Art direction

## Reference images

The look today:

- `docs/design/DESIGN.md` holds the rules.
- `src/index.css` holds the `:root` tokens.
- The landing page and `/dev/hud`, `/dev/racks` and `/dev/city-3d` show them rendered.

Outside references, by direction:

- **A:** Monument Valley and Townscaper for soft miniature light; Stardew Valley for a cosy plot.
- **B:** Mini Metro's night mode and server-room photography with LED strips.
- **C:** Mini Motorways and architectural blueprint sheets.

## World palette

Today the palette is warm on ink:

| Token | Colour |
| --- | --- |
| cream | `#f4ecdd` |
| coral (the one primary action) | `#e8836b` |
| teal (alive things: focus, status, links) | `#5fc2a8` |
| amber (accent only) | `#e0a95c` |
| wood | `#b07a4e` |
| ink | `#16201e` |
| destructive | `#d9544a` |

`DESIGN.md` bans neon green, cyan and purple. The 3D diorama uses `src/world/diorama/palette.ts`, which is close to the UI palette but not the same tokens.

## Material language

The 3D world uses procedural low-poly props: racks, GPUs and city blocks. They are flat-shaded with a few material colours each. The UI uses glass surfaces (L1) over a page grid (L0), plus recessed inset groups (L2). Themed card shells cover the different kinds of information: quest ticket, invoice, terminal, blueprint, sticky note, keycap, server LCD, spec sheet and polaroid.

## Lighting mood

The lab scenes have even daylight with soft shadows and no day/night cycle. The menus sit on a dark ink background with teal and coral glows.

## Silhouette rules

- Racks read as tall dark boxes with lit slot faces.
- GPUs read as a coloured card in a slot.
- The player is a small round figure.
- Props keep a chunky miniature scale: nothing thin enough to vanish at phone size.

## UI typography

- Baloo 2 for headings and buttons, in sentence case, never uppercase.
- Nunito for body text.
- No monospace in product copy.
- Role radii: surface 1.5rem, control 0.85rem, field 0.6rem, pills for status.

## Chosen look

Not chosen yet: the owner picks one of these. Each direction keeps the game's rules and copy. Only the tokens, materials, lighting and card shells change.

### A. Miniature lab diorama (recommended)

Keep today's palette and push the world into a tilt-shift miniature:

- warm key light with long soft shadows
- ambient occlusion
- slight depth of field on the far city
- a glossy toy finish on racks
- GPUs that glow teal when serving and coral when training

The UI keeps glass cards and the themed shells, rebuilt on UI-kit tokens. Every app on the tablet gets one illustrated header.

Why it is recommended:

- It is the shortest path from what exists.
- It reads well on a phone.
- It matches the brand and `DESIGN.md`.
- It shows off the engine's post-processing (AO, bloom, DOF) without new assets.

### B. Night-shift neon lab

The lab at 2 a.m.:

- deep ink world with racks lit by LED strips
- bloom on the slot lights
- a city skyline of lit windows
- coral and amber warnings

The UI becomes dark terminal glass.

It is the most striking in screenshots. The cost:

- It breaks `DESIGN.md`'s cosy rule and its ban on neon.
- It needs a full palette rework.
- It is harder to read on a phone in daylight.

### C. Paper blueprint

The world as a living blueprint:

- cream paper ground with a fine grid
- ink line work on the props
- flat watercolour fills
- placements previewed as dashed outlines

The UI becomes paper cards with ink stamps, extending today's blueprint and sticky-note shells.

It is the most distinctive and the cheapest to render. The cost: it reads as less "alive" for a tycoon about busy machines, and it needs an outline/toon material pass in the engine.

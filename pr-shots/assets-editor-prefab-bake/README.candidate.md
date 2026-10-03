# Lantern Reach

Lantern-lit frontier adventure through Eastbrook Vale, Mirefen Marsh and
Thornpeak Heights. Choose a calling, speak with town residents, and follow the
road toward the Hollow Crypt.

Run `bun install --frozen-lockfile` from the repository root, then provision this
game's existing art before `bun run dev:lantern-reach`:

```sh
cd lantern-reach
bun scripts/provision-models.ts
```

The script verifies 91 model/map files (88,412,952 bytes) against the checked-in
[`model-provenance.json`](scripts/model-provenance.json) SHA-256 hashes. It writes
only ignored `public/models/lantern-reach` files and reuses verified files.
The 25 existing character models are the game's historical **CC0-1.0 KayKit and
Quaternius** art from a pinned JGengine revision, credited in that revision's
[CREDITS.md](https://github.com/Noisemaker111/jgengine/blob/612c174c7fa7b082450139c74ef87f4f5bb336ab/CREDITS.md#world-of-claudecraft).

Eastbrook's provision house, apothecary, watch hall, lantern chapel, workshop and
wayside inn are custom assemblies of individual **Quaternius CC0-1.0**
[Medieval Village](https://quaternius.com/packs/medievalvillagemegakit.html) parts.
The tree belt uses [Stylized Nature](https://quaternius.com/packs/stylizednaturemegakit.html).
Their original model and material-map bytes are pinned in the same provenance
manifest. This is source artwork, not another game's implementation.

`src/editor.scene.json` owns the buildings, roads, clearing sizes, terrain sculpt
and lighting. Eleven compact building GLBs in `src/art` keep their editable parts
in the document's prefab library. The market paving retains its own 52-tile
source prefab and exports as one material group. Eight fence sections, four
planting bushes and six mounted KayKit torches dress specific settlement edges
and entrances; their placements are scene markers, not runtime scatter arrays.
The torch source is Kay Lousberg’s CC0-1.0
[KayKit Dungeon](https://kaylousberg.itch.io/kaykit-dungeon-remastered).
The shared `@jgengine/assets/staticPrefabBake` export consumes each prefab’s
editor-authored `staticBake` settings and source transforms. The assemblies
retain 10–12 material groups each; shared external maps retain one URL per source image. The asset-integrity test checks baked hashes, prefab
source hashes, map references and the material-group budget. The shared authoring/export workflow addresses the bounded Lantern Reach fallback
tracked in [jgengine#1937](https://github.com/Noisemaker111/jgengine/issues/1937).

For an offline copy of the downloaded files, use
`bun scripts/provision-models.ts --from <directory>` with the same `players`,
`enemies`, `creatures` and `scenery` folders. Authored building files are copied
from this checkout. Hash checks are identical. A missing model produces an
obstructive magenta loader placeholder, so provisioning is part of startup.

Controls: WASD movement, E nearby interaction, 1–9 abilities, T auto-attack,
Tab targets, L quest journal, B bags. Click **Skip Intro** or press Escape to
leave the opening camera sequence. Settings are available from the gear button.

To re-export edited buildings, open the scene in the editor and edit the original
parts in one of its eleven `building:*` prefabs. Save the scene document, then run:

```sh
bun scripts/export-settlements.ts
bun scripts/provision-models.ts
bun scripts/export-settlements.ts --check
```

The small game adapter selects the existing source art and delegates to the shared
deterministic baker, which verifies every original CC0 source model and shared
material map, preserves prefab-local transforms, and fuses only those source meshes. It
updates the compact GLBs and their provenance hashes/dimensions; it never creates
runtime world geometry. The compact marker's `meta.sourcePrefabId` connects each
visible instance to its editable source. The `--check` mode rebuilds in memory
and fails if either the checked-in GLB or manifest is stale. The SDK owns baking dependencies and GLB encoding; there is no game-owned
geometry exporter or temporary dependency installer. Full source and texture
hashes, export settings and measured budgets remain in the generated provenance report. Commit the editor document,
updated `src/art` artifacts and provenance manifest together after an edit.

The buildings currently have closed decorative doors and solid exteriors. The scene deliberately authors conservative exterior collision boxes for each
fused building. Shared export supports separate collision boxes and clearance
checks, but this game continues to depict closed decorative doors.
`settlementWalking.test.ts` uses the published capsule/walker collision resolver
to check all eleven exterior approaches and walking from spawn to all seven town
residents. It does not claim passage through closed doors. No navigable interior is claimed. Baked models resolve through the shared
asset catalog; game-owned inline rendering and collider mapping has been removed.

Rain, snow and the original vale grass remain legacy biome effects. Graveyards,
the crypt and the five outlying dungeon compounds retain their original terrain
flatten radii and falloffs. The published editor document cannot yet express
weather/vegetation bands or individual clearing blend rings, so those features
remain explicit in `world.ts`; the settlement architecture is editor authored.

Post-publication adoption gates: the workspace SDK catalog and lockfile must use a
verified published package containing the shared exporter and catalog fallback.
The full scene’s `dawn` preset must round-trip through the strict editor contract
([JGengine-games#46](https://github.com/Noisemaker111/JGengine-games/issues/46)).
The candidate preserves the separately named `MI_WoodTrim_Wear` source material,
raising aggregate prefab submissions from 111 to 122; the existing 120 cap remains
unchanged and needs an explicit art-preserving budget decision. Actual rendered
validation is still required: capture stopped after two failures, so source-byte
and world-space geometry checks do not claim prefab visual fidelity.

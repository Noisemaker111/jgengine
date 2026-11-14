# Crumb Run credits

Crumb Run's setting, the Littles, the giant-house rooms, the burrow, every find and its flavour
text, the hunters (the Cat, the Roomba, the Kid, the dog, the spider, the mousetraps), the
procedural meshes, the canvas-painted surface patterns, the synthesized sound cues and the interface
are original content in this repository. No downloaded model pack or texture scan is used, and no
Kenney asset.

Third-party looks from the JGengine look library: the Poly Haven HDRI `night-clear` (CC0,
reflections only), the `warm-filmic` colour grade, and the Fredoka and Nunito fonts (OFL 1.1,
Fontsource). The in-game credits list them from `src/art/look.ts`.

The room templates, burrow, props and markers in `src/editor.scene.json` are authored through the
published JGengine editor host session by `scripts/author-house.ts`; runtime reads only the export.

The application consumes the JGengine core, UI, shell, editor and assets packages and Three.js under
their distributed licenses. Build tooling includes Vite, Tailwind CSS and TypeScript.

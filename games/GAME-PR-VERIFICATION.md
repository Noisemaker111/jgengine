# Historical published-package game integration

This records verification before the original-game identity migration; game names
below reflect their current identities. PRs #2 (Field Station hazard health) and
#3 (Scrap Signal chest/vignette) were integrated on main. PR #1 stays separate: its facade material objects require the
engine change in [jgengine #1749](https://github.com/Noisemaker111/jgengine/pull/1749).
That change is merged upstream but is absent from installed published core 0.18.1,
whose building palette values are strings. No facade API casts or source aliases
are used here, and #1's head is not part of this integration's ancestry.

## Historical setup

The commands and package versions in this section describe the historical integration,
not the current checkout. For current setup, use [README.md](README.md#develop).

At that revision, run `bun install --frozen-lockfile` from the repository root. The lock installs
published core/react/shell/assets 0.18.1 and pins editor 0.18.0: editor 0.18.1
requires unpublished navbake. The declared TypeScript native-preview development
dependency supplies the games' existing `tsgo` scripts.

From each game directory, provision its catalog packs using
`bun node_modules/@jgengine/assets/dist/cli/pull.js pull <source> --dir public`.
Do not reindex the installed package or commit downloaded models/materials.

| Game | Sources |
| --- | --- |
| Brightway Park | kaykit-city-builder, quaternius-stylized-nature, kaykit-adventurers, ambientcg-grass001 |
| Scrap Signal | quaternius-modular-scifi, quaternius-stylized-nature, kaykit-adventurers, kaykit-space-base, ambientcg-ground025, ambientcg-rock022, ambientcg-metal007, ambientcg-metalplates001 |

Run `bun run check-types`, `bun run test`, and `bun run vite build` from each
target game's directory. No build command deploys. Vite and Tailwind resolve
published packages, including their CSS classes; the missing monorepo dev-save
plugin is no longer imported. Scrap Signal asset checks inspect its own `public` root.

## Observed verification

Windows, Bun 1.3.14, Node 24.18, published packages only:

| Game | Tests | Typecheck | Vite build |
| --- | ---: | --- | --- |
| Brightway Park | 25 / 25 | pass | pass |
| Field Station | 15 / 15 | pass | pass |
| Scrap Signal | 88 / 88 | pass | pass |

The Field Station test drives the real authored trigger and game loop using the published
headless runner: health 100 → 82 inside, 82 → 90 outside, then death → full health
at authored spawn. Scrap Signal command tests verify both chest types pay once; hurt
signal tests verify health decreases trigger feedback, while initial reads/heals
do not. Builds retain normal large-chunk warnings.

Owned headless Chrome sessions opened each game's existing standalone GameHost
on separate ports. All rendered without JavaScript exceptions. Brightway Park's live
simulation populated guests and shops, and clicking the ticket control changed
$18 to $19. Scrap Signal character selection entered play; firing reduced the magazine
from 16 to 14 while reserve stayed 80.
Both reported no model fallback or texture-error diagnostics. These browser checks
also exposed and verified the fix for missing published Tailwind classes, which
had collapsed the canvas to about 150px high.

## Limits

Browser hazard entry/drain/regen and chest/vignette visuals were not reproduced
in these sessions. The legacy `--spawn` URL overlay is installed by the engine
dev runner, not standalone GameHost; passing that URL did not position these
sessions and is not accepted gameplay evidence. Headless rules tests do not prove
those visuals. Field Station's existing player proxy and terrain/render warnings remain.
No performance claim is made from the headless rendering samples.

Editor save/reload persistence, other games' existing type failures, and the
unpublished facade API remain outside this verified source result. No installed
game or shared service was changed; no package was published or production
deployment performed.

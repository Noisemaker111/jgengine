# Licensing FAQ

JGengine's first-party packages (`jgengine`, `@jgengine/*`) are licensed under the
[Apache License 2.0](LICENSE) with a [`NOTICE`](NOTICE) attribution file. This replaces
the project's prior AGPL-3.0-only copyleft.

## What Apache-2.0 lets you do

- **Commercial use.** Ship a paid game, a studio product, or a hosted service built on the engine.
- **Closed source.** You do **not** have to open-source your game or your engine modifications.
  The AGPL "run-it-as-a-service, share-the-source" obligation is gone.
- **Modify and redistribute.** Fork it, patch it, bundle it — under Apache-2.0's standard terms
  (patent grant included).

## The one condition — keep the NOTICE

Apache-2.0 §4(d) requires that derivative works retain the attribution notices in the
[`NOTICE`](NOTICE) file. In practice: keep a readable copy of `NOTICE` — which credits
**https://jgengine.com** — with what you distribute (a `NOTICE` file in your build, in your
docs, or in an about/credits screen wherever third-party notices normally appear). That is the
attribution mechanism the maintainer wants; there is no separate ad clause or copyleft.

You must also retain the `LICENSE` copy and existing copyright/attribution notices, and mark
files you changed — the standard Apache-2.0 redistribution conditions.

## What this does NOT relicense

- **Third-party and ported code.** Anything harvested, ported, or inspired from another project
  keeps its own upstream license. See [CREDITS.md](CREDITS.md).
- **Assets.** Bundled or pulled models, sprites, icons, audio, and materials keep their own asset
  licenses (e.g. CC0). Apache-2.0 covers JGengine's own source, not the art.

## Prior AGPL versions

Releases published before this change were AGPL-3.0-only and remain available under that license;
the relicense applies going forward. If in doubt about a specific version, check that version's
`LICENSE`.

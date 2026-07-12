# reference/

Read-only source references for ports. Nothing in `packages/`, `Games/`, or `apps/` imports from here — this tree exists so a porting session can read upstream behavior, data, and layouts 1:1 without re-cloning.

## world-of-claudecraft

Upstream for `Games/claudecraft` — [levy-street/world-of-claudecraft](https://github.com/levy-street/world-of-claudecraft), MIT (© Levy Street), pinned as a git submodule.

Populate it (not fetched by a default clone):

```
git submodule update --init --depth 1 reference/world-of-claudecraft
```

Port from it, don't import it: harvest numbers, tables, layouts, palettes, and formulas, then rebuild on this engine's primitives. Its functions, renderers, and DOM/canvas workarounds stay upstream — see the port rules in the root `CLAUDE.md`.

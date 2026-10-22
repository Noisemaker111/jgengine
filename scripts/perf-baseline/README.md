# Visual and perf baseline

The reference record for every later before/after: three shots and one perf
JSON per reference game, captured after A2.1/A7.1 cut the play-loop cost.

Build measured (both commits, in full):

- engine `jgengine` `54792323ac0bd8344517d33e85020a339cb521d0` (origin/beta)
- games `Noisemaker111/JGengine-games` `c81aabc494295170c53c4b7a0763573162590a7f`
  (the pin in [../games-ref.txt](../games-ref.txt))

Device: Windows 11, Chrome, ANGLE/D3D11 on an RTX 3070, 1600x900 CSS viewport,
desktop profile, `full` graphics quality, one `shoot` daemon.

## Where the shots live

`shots/` is gitignored, so the PNGs are on the `pr-shots` archive branch at
`pr-shots/agent/lane-a-a1-5-baseline/` (commit `560ddf91`). Each game has
`<game>-menu.png`, `<game>-gameplay.png`, `<game>-hud.png`. Read them from
`https://github.com/Noisemaker111/jgengine/tree/pr-shots/pr-shots/agent/lane-a-a1-5-baseline`
or the raw URLs below.

## Reproduce

Perf JSON (stdout is the record; write it over the file here):

```sh
bun run perf <game> > scripts/perf-baseline/<game>.json
```

Shots (drive clears the origin's storage first, so a persisted save cannot
change the frame; `shoot` does not and was not used):

```sh
bun run drive <game> --mode poster --shot <game>-menu.png
bun run drive <game> --mode play --shot <game>-gameplay.png
bun run drive <game> --mode play --key <hud-key>:400 --wait 700 --shot <game>-hud.png
```

`menu` is the game's own title/start screen (`--mode poster` boots without
running `capture.play`, so the menu stays up). `gameplay` is live play at the
game's declared `capture.play` start. `hud` opens the game's HUD/overlay
surface with the key in the table below. `--mode ui` is not the HUD here: it
renders the game's `GameUI` over a flat backdrop, which for Scrap Signal, Drift
Foundry and Brightway Park is their menu, not a HUD.

## Perf records

`bun run perf <game>`, 6 s measured window after a 5 s warmup, RTX 3070.

| game | fps | avg ms | p95 ms | draws | triangles | nodes | programs after warmup | framebuffers | allocations |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| harbor-heat | 15.1 | 66.3 | 83.3 | 9,463 | 4,040,796 | 13,828 | 0 | 0 | 0 |
| scrap-signal | 60.1 | 16.7 | 16.8 | 264 | 667,626 | 961 | 2 | 0 | 4 |
| drift-foundry | 38.1 | 26.2 | 66.7 | 4,282 | 1,637,971 | 4,014 | 0 | 0 | 59 |
| brightway-park | 60.1 | 16.6 | 16.8 | 2,701 | 112,428 | 1,433 | 0 | 0 | 0 |
| ember-command | 60.1 | 16.6 | 16.8 | 2,052 | 543,366 | 978 | 0 | 0 | 0 |
| beacon-bastion | 60.1 | 16.6 | 16.8 | 686 | 3,387,406 | 299 | 0 | 0 | 0 |
| odd-orbit | 60.1 | 16.7 | 16.8 | 574 | 681,982 | 297 | 0 | 0 | 0 |
| deepward | 60.0 | 16.7 | 16.8 | 78 | 50,992 | 146 | 0 | 0 | 0 |

fps 60.1 is the display cap, not headroom: every game except Harbor Heat and
Drift Foundry is at or above 60 in this window. Draws, triangles and nodes are
the counts that survive slow hardware and are the ones to compare later.

### Reading the numbers

- Harbor Heat is the only game under 60 fps: 66.3 ms avg with 2.0 ms sim and
  40.4 ms outside it, so the remainder is three.js render work (its
  `render/culling` probe reports 261/640 visible). A7.2/A7.3 and A3.1 own it.
- Scrap Signal links 2 programs after warmup, inside its documented ceiling of
  3 (late materials; A3.2 drives it to 0).
- Drift Foundry allocates 59 GL objects after warmup while linking no programs.
  Not gated today; worth a look in A3.3.
- **Scrap Signal's draws/triangles/nodes are not reproducible.** Three runs at
  the same commit: 264/667,626/961 (`bun run perf`), 312/844,202/2,045
  (`bun run perf:gate`), and 745/1,811,446/7,631 (the `baseline` string in
  [../perf-budget.json](../perf-budget.json)). The world streams in after play
  starts, so a fixed 6 s window catches a different amount each time. Its 820
  draw budget is fragile until A3.2 settles the stream.

## Shots

| game | menu | gameplay | hud (key) |
| --- | --- | --- | --- |
| harbor-heat | [menu](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/agent/lane-a-a1-5-baseline/harbor-heat-menu.png) | [gameplay](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/agent/lane-a-a1-5-baseline/harbor-heat-gameplay.png) | [pause panel](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/agent/lane-a-a1-5-baseline/harbor-heat-hud.png) (KeyP) |
| scrap-signal | [menu](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/agent/lane-a-a1-5-baseline/scrap-signal-menu.png) | [gameplay](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/agent/lane-a-a1-5-baseline/scrap-signal-gameplay.png) | [skills panel](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/agent/lane-a-a1-5-baseline/scrap-signal-hud.png) (KeyK) |
| drift-foundry | [menu](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/agent/lane-a-a1-5-baseline/drift-foundry-menu.png) | [gameplay](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/agent/lane-a-a1-5-baseline/drift-foundry-gameplay.png) | [pause panel](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/agent/lane-a-a1-5-baseline/drift-foundry-hud.png) (KeyP) |
| brightway-park | [menu](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/agent/lane-a-a1-5-baseline/brightway-park-menu.png) | [gameplay](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/agent/lane-a-a1-5-baseline/brightway-park-gameplay.png) | [pause panel](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/agent/lane-a-a1-5-baseline/brightway-park-hud.png) (KeyP) |
| ember-command | [menu](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/agent/lane-a-a1-5-baseline/ember-command-menu.png) | [gameplay](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/agent/lane-a-a1-5-baseline/ember-command-gameplay.png) | [pause panel](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/agent/lane-a-a1-5-baseline/ember-command-hud.png) (Escape) |
| beacon-bastion | [boot frame](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/agent/lane-a-a1-5-baseline/beacon-bastion-menu.png) | [gameplay](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/agent/lane-a-a1-5-baseline/beacon-bastion-gameplay.png) | [in-play HUD](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/agent/lane-a-a1-5-baseline/beacon-bastion-hud.png) (Escape) |
| odd-orbit | [menu](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/agent/lane-a-a1-5-baseline/odd-orbit-menu.png) | [gameplay](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/agent/lane-a-a1-5-baseline/odd-orbit-gameplay.png) | [in-play HUD](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/agent/lane-a-a1-5-baseline/odd-orbit-hud.png) (Space) |
| deepward | [boot frame](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/agent/lane-a-a1-5-baseline/deepward-menu.png) | [gameplay](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/agent/lane-a-a1-5-baseline/deepward-gameplay.png) | [pause panel](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/agent/lane-a-a1-5-baseline/deepward-hud.png) (Escape) |

Beacon Bastion and Deepward have no title screen yet (D9.1), so their `menu`
shot is the boot frame — Beacon's prep panel, Deepward's garage corridor. Their
`hud` keys open no panel either, so those shots are the in-play HUD.

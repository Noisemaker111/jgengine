# Do Not Disturb plan

Brief: "Ordinary working humans defend the last analog town against marching technology." Rebuild the
`beacon-bastion` tower defense (folder and package id unchanged) into Do Not Disturb: workers in work
outfits with voice lines are the towers, technology is the enemy, and technology fights back without
shooting — it distracts workers with notifications.

<!-- suite-score: written by `bun run gen` from proofs/suite-report.json -->
## Suite score

What players must be able to do, proven by headless simulation in `bun test` (`jgengine suite beacon-bastion`). This is the headline; the engine coverage table below only hints where the engine has a part.

| Area | Proven | Failing | Not simulatable | Missing | Cut |
| --- | --- | --- | --- | --- | --- |
| onboarding | 0/2 | 0 | 0 | 2 | 0 |
| failure | 0/1 | 0 | 0 | 1 | 0 |
| save | 0/1 | 0 | 0 | 1 | 0 |
| settings | 0/1 | 0 | 0 | 1 | 0 |
| menu | 0/1 | 0 | 0 | 1 | 0 |
| progression | 0/1 | 0 | 0 | 1 | 0 |
| content | 0/5 | 0 | 0 | 5 | 0 |
| td | 0/5 | 0 | 0 | 5 | 0 |
| **total** | **0/17** | 0 | 0 | 17 | 0 |

<details><summary>Every required entry</summary>

Genres: tower-defense. 0/17 proven · 17 missing.

| Entry | Status | What the player does | Detail |
| --- | --- | --- | --- |
| `onboarding.first-goal` | missing | A new game shows a first goal, and the first player action toward it advances it. |  |
| `onboarding.find-features` | missing | A player following the game's own guidance reaches the first use of every core feature. |  |
| `failure.lose-and-recover` | missing | The player can fail (die, lose the run, go broke) and the game puts them back into play at a stated cost. |  |
| `save.continue` | missing | Progress made by playing survives saving and continuing. |  |
| `settings.controls` | missing | The player opens settings and a change (a binding, volume, sensitivity) takes effect. |  |
| `menu.start-and-credits` | missing | The main menu starts a game and shows the credits. |  |
| `progression.runway` | missing | Something new unlocks steadily across the first five hours, up to the progression cap. | no content sheet (proofs/content.ts) |
| `content.item-source` | missing | Every item can be obtained by playing. | no content sheet (proofs/content.ts) |
| `content.item-use` | missing | Every item does something: crafts, equips, eats, places, feeds, sells or summons. | no content sheet (proofs/content.ts) |
| `content.recipes-reachable` | missing | Every recipe and source can actually be used: its inputs, station and unlock are all obtainable. | no content sheet (proofs/content.ts) |
| `content.placeables-place` | missing | Every item that says it can be placed can be placed. | no content sheet (proofs/content.ts) |
| `content.weapons-have-ammo` | missing | Every weapon that fires has obtainable ammo, or needs none. | no content sheet (proofs/content.ts) |
| `td.place-tower` | missing | Place a defense and it attacks enemies in range. |  |
| `td.waves-escalate` | missing | Waves grow harder as the game goes on. |  |
| `td.upgrade-tower` | missing | Upgrade a placed defense. |  |
| `td.leak-lose` | missing | Enemies that get through cost lives, and running out loses. |  |
| `td.economy` | missing | Defeating enemies earns currency to build more. |  |

</details>
<!-- /suite-score -->

## Direction
- Reuse the TD machinery: plots, two roads, waves, purse (cash), held-wave pay, mending (coffee break),
  difficulties (Part-Time / Full-Time / Overtime), save slots (Maple / Elm / Oak Street), co-op world.
- Lives are the town's Attention Span.
- Core twist: Distraction. Phones, watches, speakers and chatbots ping workers; a hit worker looks at their
  phone and stops working unless a Teacher snaps them out, a Librarian hushes the ping, or a Monk keeps
  them present.
- Out: renaming the folder or package id; endless mode; a second map.
- Done scenario: a player hires a mixed crew, learns to answer notifications (Teacher/Librarian/Monk),
  cameras (kill them first), heat (Firefighter) and power (Electrician), and beats the Data Center and
  The Cloud on Full-Time.
- Pillars: readable comedy; every enemy asks for a different answer; distraction is pressure, not a stun-lock.
- Anti-pillars: grim tone; shooting enemies; hidden numbers.
- Falsifier: if a crew with no distraction answer does as well as one with Teachers/Librarians/Monks,
  distraction is not doing its job.

## Design brief
- Core loop (30 s): hire on a plot, watch who gets distracted, answer the tech on the street.
- Session loop: twelve waves, the server rack at 6, the Data Center at 12; the end-of-day card banks cash
  and offers a perk.
- Long loop: stars per shift seat the Town Council; Overtime is the replay target.
- Second 0: $150 and fourteen workers on the hiring board; the first wave is earbuds and phones.
- Onboarding: the wave preview names traits (notifications, flyers, armor, cameras, heat, power) with glyphs.
- Pace: a new tech kind every wave through wave 6, then composed mixes of the late roster.

### First 10 minutes
- 0:00 Hire a Barista and a Farmer; "Open for business".
- 1:00 Wave 1: earbuds swarm, phones ping — the first distracted worker with a phone over their head.
- 2:00 Wave 2: drones fly; baristas can't reach them, farmers can.
- 4:00 Wave 3: smart speakers distract everyone around them; first "Installing Update…".
- 6:00 Wave 4: a Flock camera spots a worker; kill it first.
- 8:30 Wave 5–6: fridges, routers, and the server rack restoring backups until an Electrician stands near.

### Content budget
- 14 workers × (2 promotions + 2 careers × 2 steps), each with place/fire/distracted/promote lines.
- 18 tech kinds including the server rack miniboss, the Data Center and The Cloud.
- 6 authored waves, 5 composed from 5 squad patterns, 1 authored finale.

### Systems
- Distraction: worker status runtime (`session.workers`): distracted, spotted, overheated.
- Wet + shock, armor crush, freezes, scalds: tech status runtime.
- Data Center power: drained by nearby Electricians; then it takes full damage; on death it becomes The Cloud.

## Features
- Plots, workers, promotions, sale — `@jgengine/core/worldModel` (`defineGameSpec`, `upgradePaths`)
- Waves and pressure — `@jgengine/core/waves/encounter`, `pressure`, `waveCountdown`
- Damage chart — `@jgengine/core/combat/damage/damageTable`
- Statuses on tech and on workers — `@jgengine/core/combat/statusRuntime`
- Boss phases — `@jgengine/core/ai/phaseLadder`
- Voice lines — `ctx.scene.entity.floatText`
- Procedural tech bodies — `scene.renderEntity` + `EngineDrawMount`
- HUD — Rune JSX (`@jgengine/core/ui/rune`)

## Gaps
- Statuses on placed structures (worker Distraction) is a one-adopter mechanism kept local in
  `session.ts` (`WORKER_STATUSES`) on the engine status runtime; a second adopter should move it upstream.
- Speech bubbles: the engine has no world-anchored speech-bubble primitive (`jgengine has "speech bubble"`
  is a gap); voice lines use floating text.

## Milestones
- [x] 1. Reskin and rebuild: damage chart, 14 workers, 18 tech kinds, distraction, waves, scene, HUD.
- [x] 2. Balance pass (headless `balance.test.ts`) and tests for the new mechanics.
- [ ] 3. Playtest pass: voice-line frequency, distraction feel, Data Center readability.
- [ ] 4. A worker animation for "looking at the phone" instead of the floating phone alone.

## Handoff
- Done: full roster (14 workers, 18 tech), distraction on a worker status runtime (balance proves
  dropping the Teacher/Librarian loses), Wet + shock (ZAP x2.5 pop), Data Center mains power (HUD
  meter) and migration to The Cloud, Installing Update bar, parcels, router boosts, mining theft,
  chatbots echoing workers' own lines, 12-wave ramp, procedural tech meshes, painted City Builder
  street via editor markers, diner HUD, onboarding tips, comic speech bubbles (capped, stacked),
  throw/flinch animations, promotion pips, kill-pay pops, phone "ding"; 169 tests green.
- Shots reviewed: /tmp/claude-0/dnd-mid2.png, dnd-tech.png, dnd-finale1.png, dnd-result.png, dnd-title.png.
- verify:fast: everything passes except two environment-only steps (library-model provisioning for
  other games is blocked by the sandbox proxy; the boot probe waits on a render slot other agents hold).
- Next: a "looking at phone" pose instead of only the floating phone; tech kinds' faces turned toward
  the camera; a second map or an endless "Overtime shift" mode once the first map is polished.

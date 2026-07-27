# Vaultbreak — hand items

The item catalogue. [DESIGN.md](DESIGN.md) owns the systems; this owns the list.

Status: a first pass to argue with. Nothing here is approved. §22 of DESIGN.md
guesses about 50 items and this proposes 88, which is deliberate — it is easier to
cut from a wide list than to invent breadth later.

## How these were generated

Three rules produced everything below, and they are worth keeping when adding
more.

**1. Every item is a copy of something a worker carried.** A vault was a
workplace. It had security, maintenance, medical, hydroponics, a reactor deck,
cold storage, and a morale office. Those seven departments are the whole armoury.
A fireball is not a spell — it is an ignition tool off the reactor deck, printed
four hundred times. This is why enemies carry these items and why an item looks
like it belongs in a corridor.

**2. Every item is a different verb.** If two items differ only in numbers, one of
them should be a part or an affix instead. The test is whether a player would
change what they *do* in a fight, not how fast a health bar drops.

**3. Every item must read on a silhouette.** DESIGN.md §7 makes what an enemy
holds into how it fights and what it drops. An item a player cannot identify
across a dark room fails that contract regardless of how it plays.

Two consequences worth noticing. The game's "magic" is acoustic, electrical and
industrial rather than arcane, which is a stronger identity than generic elements
and costs nothing. And a meaningful share of items touch the oxygen clock (§14),
because that clock is the thing this game has that others do not.

---

## Arms — ammo

Ranged, sustained, and the family that runs out. Mostly the security armoury,
plus maintenance tools that happen to fire something.

| Item | What it does | Came from |
| --- | --- | --- |
| **Sidearm** | The issue pistol. Weak, fast, and its ammo is everywhere. | Security |
| **Service rifle** | The baseline. Accurate, unremarkable, always useful. | Security |
| **Stitcher** | High fire rate, falls apart past short range. | Security |
| **Scattergun** | Spread, close, staggering. | Security |
| **Slug gun** | One heavy round, knocks a target off its feet. | Security |
| **Suppression drum** | Enormous magazine, low damage per shot, holds a corridor. | Security |
| **Line rifle** | Charges, then penetrates everything in a straight line. Rewards corridors. | Reactor deck |
| **Grenade launcher** | Arcs and bounces, so it hits what you cannot see. | Security |
| **Rocket tube** | Very large damage. Hurts you at close range. | Security |
| **Rivet gun** | Pins a target to the surface behind it. Pinned targets take extra melee damage. | Maintenance |
| **Nail carbine** | The automatic version. Pins in bursts, less reliably. | Maintenance |
| **Bolt thrower** | Silent, ammo is recoverable from corpses, does not raise alert level. | Hydroponics |
| **Pneumatic harpoon** | Pulls you to a surface or a target to you. | Maintenance |
| **Coolant lance** | A pressurised stream with no travel time. Chills what it hits. | Cold storage |
| **Seed drill** | Fires spores that sprout where they land and slow anything walking through. | Hydroponics |
| **Acid sprayer** | Strips armour over time rather than dealing much damage. | Medical |
| **Flare pistol** | Almost no damage. Marks what it hits through walls. | Security |
| **Bone drill** | Extreme damage at contact range while you stay latched on. | Medical |

## Edge — rage

Close range, and the only family whose resource builds by fighting rather than
draining. Maintenance tools and security kit, mostly.

| Item | What it does | Came from |
| --- | --- | --- |
| **Baton** | Fast, staggers, barely hurts. The first thing most players hold. | Security |
| **Fire axe** | Heavy swing that cleaves through more than one body. | Emergency kit |
| **Pipe wrench** | Slow, enormous single hit, breaks armour. | Maintenance |
| **Gauntlets** | Punches. Builds rage faster than anything else and has a parry window. | Security |
| **Cutting torch** | A held beam that drains rage continuously and sets things alight. | Maintenance |
| **Bone saw** | Applies a bleed that stacks. Rewards staying on one target. | Medical |
| **Guard set** | Shield and short blade as one item. You can block while attacking. | Security |
| **Chain whip** | Long reach, sweeps several targets, wraps and pulls one in. | Maintenance |
| **Pneumatic hammer** | Charged strike that launches a body across a room. | Maintenance |
| **Grafting shears** | Two-hit combo where the second hit heals you. | Hydroponics |
| **Cryo cleaver** | Slows on hit, and shatters anything already chilled. | Cold storage |
| **Rail spike** | Thrown, then recalled. Melee that works at range. | Maintenance |
| **Arc glaive** | Electrified reach weapon that chains a small shock to whatever is near. | Reactor deck |
| **Counterweight maul** | Hits harder the more rage you are holding, and hurts you when you miss. | Maintenance |
| **Suture blade** | Stabs and injects. Applies a debuff rather than doing much damage. | Medical |

## Focus — mana

Projected energy. This is the family that looks like magic, and every item in it
is a piece of industrial equipment doing its job at a person.

| Item | What it does | Came from |
| --- | --- | --- |
| **Fireball** | A thrown ignition charge. The one everybody wants. | Reactor deck |
| **Fire breath** | The same fuel system in a cone instead of a ball. | Reactor deck |
| **Ignition seed** | A delayed charge you place and detonate on your own timing. | Reactor deck |
| **Arc lance** | A beam that chains between bodies standing too close together. | Reactor deck |
| **Static field** | A slow-moving orb that shocks anything that passes it. | Reactor deck |
| **Rad pulse** | Damage over time in an area that ignores armour entirely. | Reactor deck |
| **Frost lance** | Coolant projection. Slows, then freezes. | Cold storage |
| **Resonance note** | A sound cone that staggers and interrupts enemy casts. | The Choir |
| **Choral swell** | A channel that damages an entire room slowly and is extremely loud. | The Choir |
| **Signal jam** | Silences enemy casters and disables enemy Field devices for a while. | The Choir |
| **Void draw** | Pulls everything toward a point. | Reactor deck |
| **Kinetic push** | A shove. The reason railings and shafts are worth generating. | Maintenance |
| **Mirror bolt** | A projectile that gains damage every time it bounces off a wall. | Reactor deck |
| **Sunder wave** | A line that cracks forward along the floor and knocks down. | Maintenance |
| **Cauterizer** | One trigger that heals allies and burns enemies. | Medical |
| **Blood ledger** | Costs health instead of mana. Damage to match. | Medical |

## Ward — heat

Projections that stop things. Containment gear, blast doors and quarantine
equipment. Heat fills as you use these, and venting is loud and stationary.

| Item | What it does | Came from |
| --- | --- | --- |
| **Bubble shield** | A dome that blocks fire in both directions. | Reactor deck |
| **Deflect plate** | A directional shield you hold up. Reflects what hits it. | Security |
| **Blast shutter** | A deployable wall segment. Hard cover where there was none. | Emergency system |
| **Phase skin** | Brief intangibility. Walk through bodies and thin partitions. | Reactor deck |
| **Quarantine ring** | Enemies cannot cross it outward. You can. | Medical |
| **Absorb lattice** | Stores the damage you take and releases it as a burst. | Reactor deck |
| **Coolant shroud** | Immunity to heat and fire, and it lowers your own heat while up. | Cold storage |
| **Static veil** | Enemies lose track of you unless they are adjacent. | The Choir |
| **Pressure seal** | A personal shield that also refills your oxygen slowly. | Maintenance |
| **Reflect halo** | Returns a share of damage to whoever dealt it. | Reactor deck |
| **Anchor field** | Nothing inside it can be moved, including you. | Maintenance |
| **Last shutter** | Total immunity for about two seconds, then a large heat spike and self-damage. | Emergency system |

## Kinetic — stamina

Movement as a weapon, and the family that matters most on the walk back out.

| Item | What it does | Came from |
| --- | --- | --- |
| **Sprint boost** | Plain speed, cheap, always fine. | Security |
| **Blink** | A short teleport. | Reactor deck |
| **Phase step** | A short teleport that passes through a wall. | Reactor deck |
| **Mag boots** | Walls and ceilings become floor. | Maintenance |
| **Grapple winch** | Pull yourself to any surface you can see. | Maintenance |
| **Leap rig** | High jump, and a ground slam when you land. | Maintenance |
| **Slide plates** | A long low slide that passes under things. | Maintenance |
| **Hover pack** | Brief flight. | Maintenance |
| **Drop harness** | Fall down any shaft without damage. | Maintenance |
| **Tube launcher** | Enter the vault's pneumatic tube network and travel its lines fast. | Maintenance |
| **Recall anchor** | Drop a point, return to it later from anywhere. | Reactor deck |
| **Momentum bank** | The longer you keep moving, the harder your next hit lands. | Maintenance |
| **Cargo exo** | Far more carrying space, slower movement, shoves bodies aside. | Maintenance |

## Field — heat

Placed devices that hold ground while you do something else. Security turrets,
hydroponic systems, fire suppression, and the public address system.

| Item | What it does | Came from |
| --- | --- | --- |
| **Turret** | Shoots what it can see until it stops. | Security |
| **Mine cluster** | Proximity charges you scatter. | Security |
| **Shock plate** | A floor pad that stuns whatever steps on it. | Reactor deck |
| **Gravity well** | Pulls enemies into one place. | Reactor deck |
| **Suppression node** | Sprays fire suppressant, which blinds and smothers. | Emergency system |
| **Sprinkler root** | Grows vines that root anything standing in them. | Hydroponics |
| **Ammo press** | Slowly produces ammunition inside its radius. | Maintenance |
| **Repair drone** | Follows you and repairs your Ward items and equipment. | Maintenance |
| **Healing pool** | A zone that heals over time. | Medical |
| **Refrigeration coil** | Slows everything in its radius, including you. | Cold storage |
| **Beacon lamp** | Lights an area and reveals anything hiding in it. | Security |
| **Oxygen cache** | A placed tank that refills yours. | Maintenance |
| **PA speaker** | Broadcasts a shift announcement. Prints walk toward it. | The Choir |
| **Scarecrow** | A printed decoy body. Enemies attack it instead of you. | Printhouse |

---

## Items that talk to each other

Four hands means the interesting decision is which items combine, not which item
is strongest. These pairs should exist on purpose, and each crosses a family
boundary so a mixed build has a reason to exist beyond variety.

| Setup | Payoff |
| --- | --- |
| Rivet gun pins a body in place | Any Edge item, which does extra damage to pinned targets |
| Seed drill or sprinkler root slows a group | Cryo cleaver, which shatters anything chilled or held |
| Void draw or gravity well collects a crowd | Grenade launcher, mine cluster, choral swell |
| PA speaker pulls a patrol into a corridor | Line rifle down the length of it |
| Static veil hides you | Bolt thrower, which is silent and does not raise the alert |
| Kiln items that hurt you when fired | Absorb lattice, which turns that damage into a burst |
| Momentum bank rewards uninterrupted movement | Pneumatic hammer, or any Kinetic chain |
| Recall anchor dropped at the entrance | Any reckless push deeper than your tank allows |
| Oxygen cache placed on the way in | The walk back out, which is the whole dive |
| Signal jam disables enemy Field devices | A room full of turrets you were not going to survive |
| Cauterizer heals allies and burns enemies with one trigger | A squad standing in the right place |

## How the makers skew the list

DESIGN.md §5 gives six makers. They should not each get their own version of
everything. Each one bends the items it touches:

- **Kessler** — Arms with oversized magazines and cheap common ammunition, poor at range.
- **Orrery** — Focus and Ward, strong only when a second Orrery part is present.
- **Kiln** — a self-harming variant of anything. The rocket tube, the counterweight maul, the blood ledger, the last shutter.
- **Corvin** — hybrids that occupy one hand and do two jobs: the guard set, the suture blade, gunblades.
- **Meridian** — the whole Kinetic family and most utility.
- **Vigil** — Ward, Field, and everything that helps somebody else.

## Named items

Above legendary, hand-authored, one per archetype, scripted rather than rolled.
Five to show the register:

- **Long Sunday** — Focus. The Choir's last broadcast. Prints that hear it stop and return to their posts for a few seconds, which is not the same as being stunned.
- **Second Shift** — Arms. A rivet gun that pins a print to the wall, after which it keeps trying to work its route.
- **The Understudy** — Field. A scarecrow printed from your own pattern. Enemies commit to it completely.
- **Quiet Hours** — Ward. Makes no sound and absorbs yours. The only item that lowers your hearing radius instead of raising it.
- **Firstbreath** — Equipment-linked Ward. Your oxygen stops counting down while it is up, and its heat cost is brutal.

---

## What I would ship first

Eighteen items, three per family, chosen so the first playable slice already has
setup-and-payoff rather than a damage ladder:

Sidearm, service rifle, rivet gun · baton, fire axe, gauntlets · fireball, arc
lance, kinetic push · bubble shield, deflect plate, coolant shroud · sprint
boost, blink, grapple winch · turret, healing pool, PA speaker.

## Open questions

1. **Can an item's tree change its family behaviour?** DESIGN.md §8 gives every item its own tree. If the fireball's tree can push it toward leaving a burning patch, families blur in a way that is interesting but makes enemy silhouette-reading harder.
2. **Is 88 too many for a first library?** Each one needs a tree, an enemy behaviour and a silhouette. Fifty is the number in §22, and the cut would come from the ranged and melee lists, which are the widest here.
3. **Do enemies use every item?** Some of these — recall anchor, oxygen cache, cargo exo — make no sense on a print. If part of the catalogue is player-only, Rule 4 in §2 needs an explicit exception.
4. **How much of the catalogue may touch oxygen?** Pressure seal, oxygen cache and Firstbreath all extend the clock. Too many and the dive stops being timed.
5. **Are the department origins visible to a player?** The list is generated from them, but nothing currently tells a player that a fireball came off the reactor deck. If that stays invisible it is still a useful authoring tool, just not a fiction the player receives.

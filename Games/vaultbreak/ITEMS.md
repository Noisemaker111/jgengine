# Vaultbreak — hand items

The item catalogue. [DESIGN.md](DESIGN.md) owns the systems; this owns the list.

Status: a proposal to cut from. Nothing here is approved.

## The families are named plainly now

The previous names (Arms, Edge, Focus, Ward, Kinetic, Field) were invented words
that had to be learned before anything else made sense. They are gone.

| Family | Runs on | Was |
| --- | --- | --- |
| **Guns** | Ammo | Arms |
| **Melee** | Rage | Edge |
| **Spells** | Mana | Focus |
| **Shields** | Power | Ward |
| **Movement** | Stamina | Kinetic |
| **Devices** | Power | Field |

Power replaces Heat and drains like every other pool instead of filling
backwards. Items that overheat now carry overheating as a property of that item,
which is where it was interesting anyway.

## Two kinds of rarity

An item has two independent ratings and they answer different questions.

**How rare is it to find this kind of thing at all.** A pistol turns up in every
locker; a rocket tube does not. This is a property of the item type and it never
changes.

| Found | Means |
| --- | --- |
| **Issue** | Everybody was given one. Turns up constantly. |
| **Stocked** | Kept in supply rooms. Common if you look. |
| **Restricted** | Armoury and secure storage only. |
| **Sealed** | Locked away, deep, or on something that will fight about it. |
| **One-off** | A single authored item. One place, one holder. |

**How good is this particular one.** The five-tier ladder from DESIGN.md §5:
common, uncommon, rare, epic, legendary, plus item level from where it dropped.

The two multiply. A legendary pistol is a great roll on a boring thing and you
will see several. A common rocket tube is a bad roll on a thing you were excited
to find. Both are interesting, for opposite reasons, and neither is possible with
one axis.

*Alternative reading, in case I took the wrong one:* if you meant the **parts**
inside an item should carry their own rarity — a common rifle with a legendary
barrel — say so and I will build that instead. It is a different and also good
system.

## What makes an item worth existing

The first pass produced a list where most entries were a damage number with a
shape. These are the axes that make an item a decision instead. An item should
sit on at least one of them.

1. **Modes.** It does two things and switching costs a beat.
2. **Charge.** It accumulates something across a dive and spends it.
3. **Context.** It behaves differently depending on the vault's state — lights,
   gas, alert level, how full your cache is, how much air you have left.
4. **A cost that is not a pool.** It takes oxygen, health, cache space, or a
   whole second hand.
5. **Pairing.** It gains something specific when a named other item is in
   another hand.
6. **World.** It changes the level rather than the enemies — opens walls, seals
   doors, kills lights, reroutes the tubes.
7. **Printing.** It uses the one thing this fiction has that nothing else does.
8. **Memory.** It remembers across dives, or across Lives.

Axes 6 and 7 are where the first pass was weakest and they are the two the
setting is actually built on. The vault is a machine that is still running, and
its horror is that it prints people. Almost none of the original list touched
either.

---

# The catalogue

Every item lists what it does and how rare the type is to find. Origin is the
department it was printed from, which is the generation rule: a vault was a
workplace, and its armoury is security, maintenance, medical, hydroponics, the
reactor deck, cold storage, the morale office, and the printhouse.

## Guns — ammo

| Item | What it does | Found |
| --- | --- | --- |
| **Sidearm** | The issue pistol. Weak, fast, ammo everywhere. | Issue |
| **Service rifle** | Accurate, unremarkable, always fine. | Issue |
| **Stitcher** | High fire rate, useless past short range. | Issue |
| **Scattergun** | Spread, close, staggering. | Stocked |
| **Slug gun** | One heavy round that takes a body off its feet. | Stocked |
| **Convertible rifle** | Two modes: single-shot at range, automatic up close. Switching takes a beat. | Stocked |
| **Coil gun** | Three charge levels, each a different projectile: dart, lance, and a shot that punches through a wall. | Restricted |
| **Suppression drum** | Huge magazine, low damage, holds a corridor by itself. | Restricted |
| **Line rifle** | Charges, then penetrates everything in a straight line. | Restricted |
| **Grenade launcher** | Arcs and bounces, so it hits what you cannot see. | Restricted |
| **Rocket tube** | Very large damage. Hurts you at close range. | Sealed |
| **Rivet gun** | Pins a body to whatever is behind it. Pinned targets take extra melee damage. | Issue |
| **Nail carbine** | Automatic rivets, pins less reliably. | Stocked |
| **Bolt thrower** | Silent, ammo recoverable from corpses, does not raise the alert. | Stocked |
| **Pneumatic harpoon** | Pulls you to a surface, or a body to you. | Stocked |
| **Coolant lance** | A pressurised stream with no travel time. Chills. | Stocked |
| **Seed drill** | Fires spores that sprout where they land and slow anything crossing. | Stocked |
| **Acid sprayer** | Strips armour over time rather than doing damage. | Restricted |
| **Flare pistol** | Almost no damage. Marks what it hits through walls. | Issue |
| **Bone drill** | Extreme damage at contact range while you stay latched. | Restricted |
| **Deadman's rifle** | Damage rises as your oxygen falls. Best when you should already be leaving. | Sealed |
| **Overburden** | Damage scales with how full your cache is. Rewards greed directly. | Sealed |
| **Ration printer** | Prints ammunition from waste in your cache. Slow and extremely loud. | Restricted |

## Melee — rage

Rage builds by fighting instead of draining, so melee is the family that gets
stronger the longer a fight goes and is worthless at the start of one.

| Item | What it does | Found |
| --- | --- | --- |
| **Baton** | Fast, staggers, barely hurts. | Issue |
| **Fire axe** | Heavy swing that cleaves more than one body. | Issue |
| **Pipe wrench** | Slow, enormous, breaks armour. | Issue |
| **Gauntlets** | Punches. Builds rage fastest and has a parry window. | Stocked |
| **Cutting torch** | Two modes: a weapon that ignites, or a tool that cuts a hole through a wall. | Stocked |
| **Bone saw** | A bleed that stacks. Rewards staying on one target. | Stocked |
| **Guard set** | Shield and short blade in one hand. Block while attacking. | Stocked |
| **Chain whip** | Long reach, sweeps, wraps and pulls one body in. | Restricted |
| **Pneumatic hammer** | Charged strike that launches a body across a room. | Restricted |
| **Grafting shears** | Two-hit combo where the second hit heals you. | Stocked |
| **Cryo cleaver** | Slows on hit, shatters anything already chilled. | Restricted |
| **Rail spike** | Thrown and recalled. Melee that works at range. | Restricted |
| **Arc glaive** | Electrified reach weapon that chains a shock to whatever is near. | Restricted |
| **Counterweight maul** | Hits harder the more rage you hold, and hurts you when you miss. | Sealed |
| **Suture blade** | Stabs and injects a debuff. Barely damages anything. | Restricted |
| **Quiet blade** | Very large damage, but only while nothing in the vault is calling. | Sealed |
| **Ledger** | Records what ended your last Life. Extra damage against that kind of print, this Life and every one after. | One-off |

## Spells — mana

Projected energy, and every item in it is industrial equipment pointed at a
person. The vault's magic is electrical, acoustic and thermal rather than arcane.

| Item | What it does | Found |
| --- | --- | --- |
| **Fireball** | A thrown ignition charge. | Stocked |
| **Fire breath** | The same fuel system as a cone. | Stocked |
| **Ignition seed** | A delayed charge you place and detonate on your own timing. | Restricted |
| **Arc lance** | A beam that chains between bodies standing too close. | Restricted |
| **Static field** | A slow orb that shocks anything passing it. | Stocked |
| **Rad pulse** | Damage over time in an area, ignoring armour completely. | Restricted |
| **Frost lance** | Coolant projection. Slows, then freezes. | Stocked |
| **Resonance note** | A sound cone that staggers and interrupts enemy casts. | Stocked |
| **Choral swell** | A channel that damages a whole room slowly and is extremely loud. | Sealed |
| **Signal jam** | Silences enemy casters and disables enemy devices for a while. | Restricted |
| **Void draw** | Pulls everything toward one point. | Restricted |
| **Kinetic push** | A shove. The reason shafts and railings are worth generating. | Issue |
| **Mirror bolt** | Gains damage every time it bounces off a wall. | Restricted |
| **Sunder wave** | A line that cracks along the floor and knocks down. | Restricted |
| **Cauterizer** | One trigger that heals allies and burns enemies. | Restricted |
| **Blood ledger** | Costs health instead of mana. Damage to match. | Sealed |
| **Nightglass** | Does nothing while the lights are on. Very strong when they are not. | Sealed |

## Shields — power

| Item | What it does | Found |
| --- | --- | --- |
| **Bubble shield** | A dome that blocks fire in both directions. | Stocked |
| **Deflect plate** | A directional shield you hold. Reflects what hits it. | Issue |
| **Blast shutter** | A deployable wall segment. Hard cover where there was none. | Stocked |
| **Phase skin** | Brief intangibility. Walk through bodies and thin partitions. | Sealed |
| **Quarantine ring** | Enemies cannot cross it outward. You can. | Restricted |
| **Absorb lattice** | Stores damage you take, releases it as a burst. | Restricted |
| **Coolant shroud** | Immunity to heat and fire, and it lowers other items' overheating. | Stocked |
| **Static veil** | Enemies lose track of you unless adjacent. | Restricted |
| **Pressure seal** | A personal shield that also refills your oxygen slowly. | Sealed |
| **Reflect halo** | Returns a share of damage to whoever dealt it. | Restricted |
| **Anchor field** | Nothing inside can be moved, including you. | Restricted |
| **Last shutter** | Total immunity for about two seconds, then a large power spike and self-damage. | Sealed |

## Movement — stamina

The family that decides whether the walk back out is survivable.

| Item | What it does | Found |
| --- | --- | --- |
| **Sprint boost** | Plain speed, cheap, always fine. | Issue |
| **Blink** | A short teleport. | Restricted |
| **Phase step** | A short teleport that passes through a wall. | Sealed |
| **Mag boots** | Walls and ceilings become floor. | Stocked |
| **Grapple winch** | Pull yourself to any surface you can see. | Stocked |
| **Leap rig** | High jump, ground slam on landing. | Stocked |
| **Slide plates** | A long low slide that passes under things. | Issue |
| **Hover pack** | Brief flight. | Restricted |
| **Drop harness** | Fall down any shaft without damage. | Issue |
| **Tube launcher** | Enter the vault's pneumatic network and travel its lines. | Restricted |
| **Recall anchor** | Drop a point and return to it later from anywhere. | Sealed |
| **Momentum bank** | The longer you keep moving, the harder your next hit lands. | Restricted |
| **Cargo exo** | Much more carrying space, slower, shoves bodies aside. | Restricted |

## Devices — power

Placed things that hold ground while you do something else.

| Item | What it does | Found |
| --- | --- | --- |
| **Turret** | Shoots what it sees until it stops. | Stocked |
| **Mine cluster** | Proximity charges you scatter. | Stocked |
| **Shock plate** | A floor pad that stuns whatever steps on it. | Stocked |
| **Gravity well** | Pulls enemies into one place. | Restricted |
| **Suppression node** | Sprays suppressant, which blinds and smothers. | Stocked |
| **Sprinkler root** | Grows vines that root anything standing in them. | Stocked |
| **Ammo press** | Slowly produces ammunition inside its radius. | Restricted |
| **Repair drone** | Follows you and repairs shields and equipment. | Restricted |
| **Healing pool** | A zone that heals over time. | Restricted |
| **Refrigeration coil** | Slows everything in radius, including you. | Stocked |
| **Beacon lamp** | Lights an area and reveals what was hiding in it. | Issue |
| **Oxygen cache** | A placed tank that refills yours. | Restricted |
| **PA speaker** | Broadcasts a shift announcement. Prints walk toward it. | Restricted |
| **Scarecrow** | A printed decoy body. Enemies commit to it. | Sealed |

---

# Two families the first pass missed

These are where the setting's actual ideas live. Both are proposals for new
families rather than additions to existing ones, because neither fits the six.

## Vault items — power

The building is still running. These command it. They do not damage anything, and
several of them are stronger than anything that does.

| Item | What it does | Found |
| --- | --- | --- |
| **Override key** | Opens a sealed door. Also seals an open one, which matters more on the way out. | Stocked |
| **Light board** | Kills the lights in a section. You brought a lamp; they did not. | Restricted |
| **PA console** | Issue a shift change. Whole sections of the roster walk somewhere else for a while. | Sealed |
| **Bulkhead trigger** | Slams a pressure door. Cuts a wave in half, and can cut your squad in half. | Restricted |
| **Tube routing card** | Reroutes the pneumatic network, changing where its lines come out. Rewrites your own escape route. | Sealed |
| **Suppression override** | Delays the gas, or triggers it early somewhere you are not standing. | Sealed |
| **Shift card** | A forged credential. Prints treat you as staff until you do something staff would not do. | Sealed |
| **Ward siren** | Turns a vault's own alarm on deliberately. Everything comes to you, and everything is carrying something. | One-off |

## Printing items — power

The one verb no other game has. Every one of these should feel like a bad idea.

| Item | What it does | Found |
| --- | --- | --- |
| **Pattern lifter** | Copies the item a print is holding. You get a worse copy for the rest of the dive. | Sealed |
| **Body press** | Prints a copy of you that repeats your last few seconds of movement and fire. | Sealed |
| **Misprint injector** | Corrupts a living print. It turns on the ones next to it. | Sealed |
| **Scrambler** | A print you kill with this comes back wrong and hostile to everything, including you. | Sealed |
| **Understudy** | A decoy printed from your own pattern. Enemies commit to it completely. | One-off |
| **Second shift** | Pins a print to a wall, after which it keeps trying to work its route. | One-off |

---

# Items that talk to each other

Four hands means the decision is which items combine. Each pair crosses a family
boundary, so a mixed build has a reason to exist beyond variety.

| Setup | Payoff |
| --- | --- |
| Rivet gun pins a body | Any melee item, which does extra damage to pinned targets |
| Seed drill or sprinkler root slows a group | Cryo cleaver, which shatters anything held or chilled |
| Void draw or gravity well collects a crowd | Grenade launcher, mine cluster, choral swell |
| PA speaker or PA console moves a patrol into a corridor | Line rifle down the length of it |
| Light board kills the lights | Nightglass and static veil, which only work in the dark |
| Static veil hides you | Bolt thrower, silent and does not raise the alert |
| Items that hurt you when fired | Absorb lattice, which turns that damage into a burst |
| Recall anchor dropped at the entrance | Any push deeper than your tank allows |
| Oxygen cache placed on the way in | The walk back out, which is the whole dive |
| Signal jam disables enemy devices | A room of turrets you were not going to survive |
| Ward siren brings everything to you | Bulkhead trigger, which decides how much of it arrives |
| Pattern lifter copies an elite's weapon | The rest of the dive, with a weapon you have not earned |

## Two structural ideas worth deciding on

**Empty hands should be worth something.** A small set of items that scale with
how many hands you have left empty would make a one-hand character genuinely
different rather than simply worse, and would keep an option open at four hands
for a player who wants one enormous thing instead of four small ones. This
inverts the usual power curve on purpose.

**Two-hand items.** A few items that occupy two hands and are worth it. At four
hands this is a real trade; at one hand it is impossible, which gives the hand
progression something to unlock beyond quantity.

Both are proposals. Neither is in DESIGN.md.

## How the makers skew the list

Makers bend the items they touch rather than each getting a copy of everything:

- **Kessler** — guns with oversized magazines and cheap common ammunition, poor at range.
- **Orrery** — spells and shields, strong only when a second Orrery part is present.
- **Kiln** — a self-harming variant of anything: the rocket tube, the counterweight maul, the blood ledger, the last shutter.
- **Corvin** — hybrids that take one hand and do two jobs: the guard set, the suture blade, the convertible rifle.
- **Meridian** — the whole movement family and most utility.
- **Vigil** — shields, devices, and everything that helps somebody else.

## Named items

Above legendary, hand-authored, one holder each, scripted rather than rolled.

- **Long Sunday** — Spell. The Choir's last broadcast. Prints that hear it stop and return to their posts, which is not the same as being stunned.
- **Quiet Hours** — Shield. Makes no sound and absorbs yours. The only item that lowers your hearing radius instead of raising it.
- **Firstbreath** — Shield. Your oxygen stops counting down while it is up. The power cost is severe.
- **The Understudy** — Printing. A decoy printed from your own pattern.
- **Second Shift** — Printing. A print pinned by it goes on working its route.
- **Ward Siren** — Vault. Turns the vault's alarm on deliberately.

---

## What I would ship first

Eighteen items, three per original family, chosen so the first slice already has
setup and payoff rather than a damage ladder:

Sidearm, service rifle, rivet gun · baton, fire axe, gauntlets · fireball, arc
lance, kinetic push · bubble shield, deflect plate, coolant shroud · sprint
boost, blink, grapple winch · turret, healing pool, PA speaker.

Add the override key from the vault family as the nineteenth, because sealing a
door behind you is the first time the walk back out becomes a decision.

## Open questions

1. **Do the two new families exist?** Vault items and printing items are the best material here and neither is in DESIGN.md. They may instead be a property some devices have, rather than families of their own.
2. **Did I read the rarity note right?** This builds item-type rarity separate from quality. If you meant parts carrying their own rarity, that is a different build.
3. **Can an item's tree change its family behaviour?** Every item has its own tree, so a fireball's tree could push it toward leaving a burning patch. Interesting, but it makes reading an enemy's silhouette harder.
4. **How much of the catalogue may touch oxygen?** Pressure seal, oxygen cache, Firstbreath and deadman's rifle all bend the clock. Too many and the dive stops being timed.
5. **Do enemies use every item?** A recall anchor or a cargo exo makes no sense on a print. If part of the catalogue is player-only, Rule 4 needs an explicit exception.
6. **Is this still too small?** It is about 110 items. If the ambition is a library where players trade build ideas for years, the number is closer to 300 and the answer is generated variants over authored ones, which is a different production model.

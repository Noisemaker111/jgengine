# Vaultbreak — hand items

The item catalogue. [DESIGN.md](DESIGN.md) owns the systems; this owns the list.

Status: a proposal to cut from. Nothing here is approved.

## Eight families

| Family | Runs on | What it is for |
| --- | --- | --- |
| **Guns** | Ammo | Ranged, sustained, and it runs out |
| **Melee** | Rage | Close, and it gets stronger the longer a fight goes |
| **Spells** | Mana | Projected energy, mostly industrial equipment pointed at a person |
| **Shields** | Power | Stopping things |
| **Movement** | Stamina | Getting somewhere, and getting back |
| **Devices** | Power | Placed things that hold ground while you do something else |
| **Vault** | Power | Commanding a building that is still running |
| **Printing** | Power | The one verb no other setting has |

## Two kinds of rarity

**How rare the kind of thing is to find at all.** Fixed to the item type. Every
entry below lists one.

| Found | Means |
| --- | --- |
| **Issue** | Everybody was given one |
| **Stocked** | Kept in supply rooms |
| **Restricted** | Armoury and secure storage only |
| **Sealed** | Locked away, far out, or on something that will fight about it |
| **One-off** | A single authored item, one place, one holder |

**How good this one turned out.** Common, uncommon, rare, epic, legendary, plus
named items above the ladder, plus item level from where it dropped (DESIGN.md §5).

## How the library gets large

There are about 240 item types below. That is the authored layer, and it is not
where the size comes from. A single drop is a type, times a maker, times rolled
affixes, times rarity, times item level, times whatever its own tree has bought.
Two players holding the same rifle are not holding the same rifle. Types are what
a player *names*; everything else is what makes two of the same name different.

There are no swappable components. The things you would bolt on — an underbarrel
launcher, a second barrel, a bayonet — are milestone nodes on the item's own tree
(DESIGN.md §8), earned by using it. So the depth per type is a tree, and the work
of a large library is in trees and affixes rather than in a two hundred and
forty-first rifle.

## What makes an item worth existing

An item should sit on at least one of these. If it is only a damage number with a
shape, it should be an affix or a tree node instead.

1. **Modes** — it does two things and switching costs a beat.
2. **Charge** — it accumulates something across a dive and spends it.
3. **Context** — it behaves differently depending on the lights, the gas, the
   alert level, how full your cache is, or how much air you have left.
4. **A cost that is not a pool** — oxygen, health, cache space, or a second hand.
5. **Pairing** — it gains something when a named other item is in another hand.
6. **World** — it changes the level rather than the enemies.
7. **Printing** — it uses the fiction nothing else has.
8. **Memory** — it remembers across dives, or across Lives.

Everything is printed from a workplace: security, maintenance, medical,
hydroponics, the reactor deck, cold storage, the morale office, the printhouse.

---

# Guns — ammo

| Item | What it does | Found |
| --- | --- | --- |
| **Sidearm** | The issue pistol. Weak, fast, ammo everywhere. | Issue |
| **Service rifle** | Accurate, unremarkable, always fine. | Issue |
| **Stitcher** | High fire rate, useless past short range. | Issue |
| **Burst carbine** | Three-round bursts, very accurate, punishing rhythm. | Issue |
| **Recoilless rifle** | No recoil at all, low damage. For people who hate handling. | Issue |
| **Scattergun** | Spread, close, staggering. | Stocked |
| **Drum shotgun** | Automatic shotgun. Eats ammunition. | Restricted |
| **Slug gun** | One heavy round that takes a body off its feet. | Stocked |
| **Marksman rifle** | Scoped and slow. Rewards hitting heads. | Stocked |
| **Ricochet pistol** | Rounds bounce once toward whatever is nearest. | Stocked |
| **Convertible rifle** | Two modes: single-shot at range, automatic up close. Switching takes a beat. | Stocked |
| **Coil gun** | Three charge levels: dart, lance, and a shot that goes through a wall. | Restricted |
| **Suppression drum** | Huge magazine, low damage, holds a corridor alone. | Restricted |
| **Line rifle** | Charges, then penetrates everything in a straight line. | Restricted |
| **Bore rifle** | Drills through one wall and hits what is behind it. | Sealed |
| **Grenade launcher** | Arcs and bounces, so it hits what you cannot see. | Restricted |
| **Flak launcher** | Airbursts over cover. | Restricted |
| **Sticky launcher** | Grenades that adhere and detonate when you say so. | Restricted |
| **Rocket tube** | Very large damage. Hurts you at close range. | Sealed |
| **Beam cutter** | Continuous laser. Costs nothing extra while you stand still. | Restricted |
| **Rivet gun** | Pins a body to whatever is behind it. Pinned targets take extra melee damage. | Issue |
| **Nail carbine** | Automatic rivets, pins less reliably. | Stocked |
| **Net gun** | Immobilises one target completely for a few seconds. | Stocked |
| **Bolt thrower** | Silent, ammo recoverable from corpses, does not raise the alert. | Stocked |
| **Tranquiliser** | The print stops fighting and goes back to walking its route. | Restricted |
| **Pneumatic harpoon** | Pulls you to a surface, or a body to you. | Stocked |
| **Coolant lance** | A pressurised stream with no travel time. Chills. | Stocked |
| **Freon jet** | Freezes a body solid. It shatters if anything hits it. | Restricted |
| **Slag thrower** | Molten metal. Burns armour and lights the room. | Restricted |
| **Seed drill** | Fires spores that sprout and slow anything crossing them. | Stocked |
| **Spore cannon** | A cloud that blinds and chokes prints. | Restricted |
| **Slurry gun** | Coats the floor. Everything on it slips. | Stocked |
| **Acid sprayer** | Strips armour over time rather than doing damage. | Restricted |
| **Splint gun** | Fires a brace that heals an ally at range. | Restricted |
| **Flare pistol** | Almost no damage. Marks what it hits through walls. | Issue |
| **Signal rifle** | Every shot that lands also marks. | Restricted |
| **Bone drill** | Extreme damage at contact range while you stay latched. | Restricted |
| **Vent gun** | Fires your other items' overheat as a projectile. | Sealed |
| **Echo pistol** | Fires again by itself from where you were standing a second ago. | Sealed |
| **Deadman's rifle** | Damage rises as your oxygen falls. Best when you should already be leaving. | Sealed |
| **Overburden** | Damage scales with how full your cache is. Rewards greed directly. | Sealed |
| **Ledger gun** | Damage scales with how many of that print type you have killed this Life. | Sealed |
| **Ration rifle** | Fires cache items as ammunition. Damage depends on what you loaded. | Sealed |
| **Ration printer** | Prints ammunition from waste in your cache. Slow and extremely loud. | Restricted |

# Melee — rage

Rage builds by fighting instead of draining, so melee is weakest at the start of
a fight and strongest at the end of one.

| Item | What it does | Found |
| --- | --- | --- |
| **Baton** | Fast, staggers, barely hurts. | Issue |
| **Fire axe** | Heavy swing that cleaves more than one body. | Issue |
| **Pipe wrench** | Slow, enormous, breaks armour. | Issue |
| **Crowbar** | Pries doors and panels as well as bodies. | Issue |
| **Cleaver** | Heavy bleed, short reach. | Issue |
| **Twin knives** | Tiny damage, absurd speed, builds rage faster than anything. | Stocked |
| **Gauntlets** | Punches, with a parry window. | Stocked |
| **Backhand** | Deals nothing. A perfect parry staggers everything in the room. | Sealed |
| **Sledge** | Slow, and it breaks walls as readily as bodies. | Stocked |
| **Prod** | Electric. Stuns completely, damages nothing. | Issue |
| **Hook** | Pulls a body to you. | Stocked |
| **Boarding pike** | Long reach, but you must brace to swing it. | Stocked |
| **Cutting torch** | Two modes: a weapon that ignites, or a tool that cuts through a wall. | Stocked |
| **Weld gauntlet** | A punch that welds a body to the floor. | Restricted |
| **Buzzsaw arm** | Continuous grinding damage while you stay on a target. | Restricted |
| **Bone saw** | A bleed that stacks. Rewards staying on one target. | Stocked |
| **Autopsy set** | Enormous damage to anything already downed. | Restricted |
| **Guard set** | Shield and short blade in one hand. Block while attacking. | Stocked |
| **Chain whip** | Long reach, sweeps, wraps and pulls one body in. | Restricted |
| **Anchor chain** | Swings wide and staggers everything in a circle. | Restricted |
| **Pneumatic hammer** | Charged strike that launches a body across a room. | Restricted |
| **Sickle set** | Sweeps low and cuts several at once. | Stocked |
| **Grafting shears** | Two-hit combo where the second hit heals you. | Stocked |
| **Pipe shears** | Cuts through armour as if it were not there. | Restricted |
| **Cryo cleaver** | Slows on hit, shatters anything already chilled. | Restricted |
| **Coolant blade** | Extends its reach with a frost edge while held. | Restricted |
| **Rail spike** | Thrown and recalled. Melee that works at range. | Restricted |
| **Arc glaive** | Electrified reach weapon that chains a shock to whatever is near. | Restricted |
| **Counterweight maul** | Hits harder the more rage you hold, and hurts you when you miss. | Sealed |
| **Suture blade** | Stabs and injects a debuff. Barely damages anything. | Restricted |
| **Quiet blade** | Very large damage, but only while nothing in the vault is calling. | Sealed |
| **Shift baton** | The print believes it has been reprimanded and walks away. | Sealed |
| **Print stamp** | Leaves a mark. Marked bodies take more damage from everyone. | Sealed |
| **Ledger** | Records what ended your last Life. Extra damage against that kind of print, permanently. | One-off |
| **Reliquary blade** | Gains permanent damage for every Life it has ended. | One-off |

# Spells — mana

| Item | What it does | Found |
| --- | --- | --- |
| **Fireball** | A thrown ignition charge. | Stocked |
| **Fire breath** | The same fuel system as a cone. | Stocked |
| **Cinder cloud** | Leaves a burning patch that lingers. | Stocked |
| **Sear line** | A wall of fire along the floor. | Restricted |
| **Ignition seed** | A delayed charge you place and detonate on your own timing. | Restricted |
| **Arc lance** | A beam that chains between bodies standing too close. | Restricted |
| **Static field** | A slow orb that shocks anything passing it. | Stocked |
| **Grounding rod** | One enemy takes all shock damage in the area. | Restricted |
| **Overload** | Disables enemy shields and devices in a radius. | Restricted |
| **Rad pulse** | Damage over time in an area, ignoring armour completely. | Restricted |
| **Frost lance** | Coolant projection. Slows, then freezes. | Stocked |
| **Chain freeze** | Freezes several bodies in a line. | Restricted |
| **Flash** | Blinds everything currently looking at you. | Issue |
| **Ash veil** | A smoke wall you can see through and they cannot. | Stocked |
| **Resonance note** | A sound cone that staggers and interrupts enemy casts. | Stocked |
| **Chorus** | Prints sing along, revealing their positions through walls. | Restricted |
| **Dissonance** | Prints attack whatever is nearest, including each other. | Sealed |
| **Choral swell** | A channel that damages a whole room slowly and is extremely loud. | Sealed |
| **Long note** | The longer you channel, the larger the eventual detonation. | Sealed |
| **Signal jam** | Silences enemy casters and disables enemy devices for a while. | Restricted |
| **Null field** | No items work inside it. Yours or theirs. | Sealed |
| **Feedback** | For a while, enemy casts hurt the caster. | Sealed |
| **Void draw** | Pulls everything toward one point. | Restricted |
| **Pressure wave** | Pushes everything away from you. | Stocked |
| **Kinetic push** | A shove. The reason shafts and railings are worth generating. | Issue |
| **Sunder wave** | A line that cracks along the floor and knocks down. | Restricted |
| **Vacuum** | Pulls the air out of a room. Prints do not breathe. You do. | Sealed |
| **Siphon** | Drains a body slowly and gives you the health. | Restricted |
| **Rot bloom** | Spreads from a killed body to whatever is standing near it. | Restricted |
| **Mirror bolt** | Gains damage every time it bounces off a wall. | Restricted |
| **Cauterizer** | One trigger that heals allies and burns enemies. | Restricted |
| **Radiant pulse** | Heals everything in a radius, including them. | Stocked |
| **Blood ledger** | Costs health instead of mana. Damage to match. | Sealed |
| **Nightglass** | Does nothing while the lights are on. Very strong when they are not. | Sealed |

# Shields — power

| Item | What it does | Found |
| --- | --- | --- |
| **Deflect plate** | A directional shield you hold. Reflects what hits it. | Issue |
| **Cover plate** | A small hard shield on your back. Blocks from behind. | Issue |
| **Damp field** | Slightly reduces all incoming damage, indefinitely, cheaply. | Issue |
| **Bubble shield** | A dome that blocks fire in both directions. | Stocked |
| **Blast shutter** | A deployable wall segment. Hard cover where there was none. | Stocked |
| **Hold line** | A wall only you and your squad can shoot through. | Restricted |
| **Fog wall** | A barrier enemies will not cross but will shoot through. | Stocked |
| **Grip field** | Anything entering it slows to a crawl. | Restricted |
| **Quarantine ring** | Enemies cannot cross it outward. You can. | Restricted |
| **Anchor field** | Nothing inside can be moved, including you. | Restricted |
| **Spike shell** | Attackers take damage on contact. | Stocked |
| **Reflect halo** | Returns a share of damage to whoever dealt it. | Restricted |
| **Absorb lattice** | Stores damage you take, releases it as a burst. | Restricted |
| **Second skin** | One hit is ignored entirely, then a long recharge. | Restricted |
| **Static veil** | Enemies lose track of you unless adjacent. | Restricted |
| **Blind shell** | Near-total protection. You cannot see out either. | Sealed |
| **Bulwark** | Enormous coverage. You cannot move while it is up. | Restricted |
| **Sanctuary** | Nobody inside can be downed, only hurt. | Sealed |
| **Coolant shroud** | Immunity to heat and fire, and it cools your other items. | Stocked |
| **Vent screen** | A shield that doubles as a cooler for everything you carry. | Stocked |
| **Sump** | Absorbs gas. Your oxygen does not count down inside it. | Sealed |
| **Pressure seal** | A personal shield that refills your oxygen slowly. | Sealed |
| **Phase skin** | Brief intangibility. Walk through bodies and thin partitions. | Sealed |
| **Last shutter** | Total immunity for about two seconds, then a large power spike and self-damage. | Sealed |

# Movement — stamina

| Item | What it does | Found |
| --- | --- | --- |
| **Sprint boost** | Plain speed, cheap, always fine. | Issue |
| **Slide plates** | A long low slide that passes under things. | Issue |
| **Drop harness** | Fall down any shaft without damage. | Issue |
| **Dash plates** | Short repeatable dashes. | Issue |
| **Crouch rig** | Silent movement at full walking speed. | Stocked |
| **Vault harness** | Climb anything. | Stocked |
| **Wall run** | Run along vertical surfaces. | Stocked |
| **Mag boots** | Walls and ceilings become floor. | Stocked |
| **Grapple winch** | Pull yourself to any surface you can see. | Stocked |
| **Hookshot** | Pull, and swing from what you pulled. | Restricted |
| **Zip line** | Fire a line between two points the whole squad can use. | Restricted |
| **Leap rig** | High jump, ground slam on landing. | Stocked |
| **Kick plates** | A shove that launches enemies instead of you. | Stocked |
| **Hover pack** | Brief flight. | Restricted |
| **Freefall rig** | Descend a shaft at speed and land firing. | Restricted |
| **Tube launcher** | Enter the vault's pneumatic network and travel its lines. | Restricted |
| **Ghost walk** | Pass through prints unnoticed for a moment. | Sealed |
| **Blink** | A short teleport. | Restricted |
| **Phase step** | A short teleport that passes through a wall. | Sealed |
| **Reverse step** | Return to where you were two seconds ago, at the health you had then. | Sealed |
| **Recall anchor** | Drop a point and return to it later from anywhere. | Sealed |
| **Shortcut charge** | Blow a hole between two rooms and walk through it. | Restricted |
| **Momentum bank** | The longer you keep moving, the harder your next hit lands. | Restricted |
| **Cargo exo** | Much more carrying space, slower, shoves bodies aside. | Restricted |
| **Cargo sled** | Drag a heavy load without losing speed. | Stocked |
| **Homebound** | Very fast, and it only works in the direction of the entrance. | Sealed |

# Devices — power

| Item | What it does | Found |
| --- | --- | --- |
| **Turret** | Shoots what it sees until it stops. | Stocked |
| **Sentry drone** | Flies, follows you, fires weakly. | Restricted |
| **Mine cluster** | Proximity charges you scatter. | Stocked |
| **Tripwire** | A line that triggers whatever you hook to it. | Stocked |
| **Shock plate** | A floor pad that stuns whatever steps on it. | Stocked |
| **Static pylon** | Chains shock between two pylons. | Restricted |
| **Gravity well** | Pulls enemies into one place. | Restricted |
| **Suppression node** | Sprays suppressant, which blinds and smothers. | Stocked |
| **Sprinkler root** | Grows vines that root anything standing in them. | Stocked |
| **Bramble pod** | Grows a wall of thorns. | Stocked |
| **Refrigeration coil** | Slows everything in radius, including you. | Stocked |
| **Cold cell** | Freezes anything that enters. | Restricted |
| **Ammo press** | Slowly produces ammunition inside its radius. | Restricted |
| **Reclaimer** | Breaks corpses into salvage while you keep fighting. | Restricted |
| **Repair drone** | Follows you and repairs shields and equipment. | Restricted |
| **Sealant node** | Repairs a wall or door you broke. | Stocked |
| **Healing pool** | A zone that heals over time. | Restricted |
| **Med station** | A placed point that makes revives much faster. | Restricted |
| **Beacon lamp** | Lights an area and reveals what was hiding in it. | Issue |
| **Field lamp** | Portable light that also blinds prints looking at it. | Stocked |
| **Signal relay** | Extends squad comms and marks through walls. | Restricted |
| **Oxygen cache** | A placed tank that refills yours. | Restricted |
| **Air scrubber** | A zone where your oxygen stops counting down. | Sealed |
| **Tube cap** | Blocks a pneumatic line so nothing comes out of it. | Stocked |
| **Alarm box** | A fake alarm. Prints converge on it instead of you. | Restricted |
| **Bait crate** | A fake supply crate prints will try to guard. | Restricted |
| **PA speaker** | Broadcasts a shift announcement. Prints walk toward it. | Restricted |
| **Shift clock** | Prints in range clock out and walk back to quarters. | Sealed |
| **Scarecrow** | A printed decoy body. Enemies commit to it. | Sealed |

# Vault — power

The building is still running. These command it. Almost none of them deal damage
and several are stronger than anything that does.

| Item | What it does | Found |
| --- | --- | --- |
| **Override key** | Opens a sealed door. Also closes an open one. | Stocked |
| **Door welder** | Seals a door permanently, in both directions. | Restricted |
| **Intake override** | Reopens the entrance you came in through, from anywhere. | Sealed |
| **Lift key** | Calls a lift. Fast travel, and a defensible box. | Restricted |
| **Vent map** | Reveals the layout, including the route you took in. | Stocked |
| **Roster board** | Shows every print in the vault and where it is standing. | Sealed |
| **Light board** | Kills the lights in a section. You brought a lamp; they did not. | Restricted |
| **Power lever** | Cuts power to a section. No turrets, no lights, no doors. | Restricted |
| **Water main** | Floods a corridor. Everything slows, and shock conducts. | Restricted |
| **Furnace control** | Heats a section until standing in it hurts. | Sealed |
| **Freezer control** | The opposite. | Sealed |
| **Bulkhead trigger** | Slams a pressure door. Cuts a wave in half, or your squad. | Restricted |
| **Quarantine call** | The vault seals a section with prints inside it. | Sealed |
| **Tube routing card** | Reroutes the pneumatic network, changing where its lines come out. | Sealed |
| **Suppression override** | Delays the gas, or triggers it early somewhere you are not standing. | Sealed |
| **Shift whistle** | Every print in earshot returns to its post and stays there. | Sealed |
| **Shift card** | A forged credential. Prints treat you as staff until you do something staff would not. | Sealed |
| **PA console** | Issue a shift change. Whole sections of the roster relocate. | Sealed |
| **Ward siren** | Turns a vault's own alarm on deliberately. Everything comes to you, and everything is carrying something. | One-off |
| **Beacon of the house** | The vault decides you are staff and stops fighting, until you take something. | One-off |

# Printing — power

Every one of these should feel like a bad idea.

| Item | What it does | Found |
| --- | --- | --- |
| **Pattern reader** | See what is inside an unopened case before cracking it. | Restricted |
| **Ink tap** | Draws ink straight out of a printhouse. Very loud. | Restricted |
| **Copy plate** | Duplicates one item in your cache, badly. | Sealed |
| **Recursive plate** | Prints a copy of the last item you used. | Sealed |
| **Pattern lifter** | Copies the item a print is holding. You keep the worse copy for the dive. | Sealed |
| **Green print** | Prints an ally that fights for you until it degrades. | Sealed |
| **Body press** | Prints a copy of you that repeats your last few seconds of movement and fire. | Sealed |
| **Death mask** | Wear a print's face. That archetype ignores you. | Sealed |
| **Misprint injector** | Corrupts a living print. It turns on the ones next to it. | Sealed |
| **Scrambler** | A print killed with this comes back wrong, and hostile to everything. | Sealed |
| **Culling stamp** | A print killed with this is not reprinted for the rest of the dive. | Sealed |
| **Pattern burn** | Destroys a pattern. That archetype stops spawning in this vault. | Sealed |
| **Overprint** | Forces a printhouse to run too fast until it fails. | Sealed |
| **Self ledger** | Records this Life. On death, your next Life starts holding one item this one carried. | One-off |
| **Understudy** | A decoy printed from your own pattern. Enemies commit to it completely. | One-off |
| **Second shift** | A print pinned by it goes on trying to work its route. | One-off |

---

# Two-hand items

They take both hands, or two of four. At one hand they are unusable, which gives
the hand progression something to unlock besides quantity.

| Item | What it does | Found |
| --- | --- | --- |
| **Siege cannon** | Slow, enormous, removes a room. | Sealed |
| **Long rifle** | Extreme range and damage. Useless inside ten metres. | Restricted |
| **Great hammer** | The largest single melee hit in the game. | Restricted |
| **Harvester** | Melee that returns a large share of the damage it deals as health. | Sealed |
| **Tower shield** | Near-total frontal immunity while braced. | Restricted |
| **Twin cast** | Fires two spells at once, both at reduced strength. | Sealed |
| **Portal frame** | Place two points and move freely between them. | Sealed |
| **Breach drill** | Cuts through any wall in the vault. | Sealed |
| **Atmosphere pack** | Doubles your oxygen. Takes both hands to carry. | Sealed |
| **Printhouse rig** | A portable printer that makes items mid-dive. | Sealed |
| **Chorus organ** | The Choir's full instrument. Controls a whole room of prints at once. | One-off |
| **Long Sunday** | The Choir's last broadcast. Prints that hear it return to their posts, which is not the same as being stunned. | One-off |

# Empty-hand items

They scale with how many hands you leave empty, so one hand is a different
character rather than a worse one, and a four-hand player can still choose one
enormous thing over four small ones.

| Item | What it does | Found |
| --- | --- | --- |
| **Open palm** | Melee damage per empty hand. | Issue |
| **Focus stone** | Spell damage per empty hand. | Stocked |
| **Free grip** | Movement speed per empty hand. | Stocked |
| **Light load** | Oxygen drains more slowly per empty hand. | Restricted |
| **Quick draw** | Swap and reload speed per empty hand. | Stocked |
| **Gambler's rig** | Loot quality per empty hand. | Sealed |
| **Duelist** | Works only with every other hand empty. That hand hits enormously hard. | Sealed |
| **The Vow** | With three hands empty you cannot be downed. | One-off |

---

# Items that talk to each other

| Setup | Payoff |
| --- | --- |
| Rivet gun pins a body | Any melee item, which does extra damage to pinned targets |
| Seed drill or sprinkler root slows a group | Cryo cleaver, which shatters anything held or chilled |
| Freon jet freezes a body solid | Any heavy hit, which shatters it |
| Void draw or gravity well collects a crowd | Grenade launcher, mine cluster, choral swell |
| PA console moves a patrol into a corridor | Line rifle down the length of it |
| Light board kills the lights | Nightglass and static veil, which only work in the dark |
| Water main floods a corridor | Static pylon or arc lance, which conduct through it |
| Static veil hides you | Bolt thrower, silent and does not raise the alert |
| Items that hurt you when fired | Absorb lattice, which turns that damage into a burst |
| Vent gun needs heat to fire | Any overheating item in another hand |
| Recall anchor dropped at the entrance | Any push deeper than your tank allows |
| Oxygen cache or air scrubber placed on the way in | The walk back out, which is the whole dive |
| Signal jam disables enemy devices | A room of turrets you were not going to survive |
| Ward siren brings everything to you | Bulkhead trigger, which decides how much of it arrives |
| Pattern lifter copies an elite's weapon | The rest of the dive, with a weapon you did not earn |
| Culling stamp stops reprints | A long fight you would otherwise have to leave |

## How the makers skew the list

A maker is a property of the whole item, not of components inside it. Makers bend
what they touch rather than each getting a copy of everything:

- **Kessler** — guns with oversized magazines and cheap common ammunition, poor at range.
- **Orrery** — spells and shields, strong only while a second Orrery item is in another hand.
- **Kiln** — a self-harming variant of anything: rocket tube, counterweight maul, blood ledger, last shutter.
- **Corvin** — hybrids that take one hand and do two jobs: guard set, suture blade, convertible rifle.
- **Meridian** — the whole movement family, most vault items, and most utility.
- **Vigil** — shields, devices, and everything that helps somebody else.

---

## What I would ship first

Nineteen items, chosen so the first slice already has setup and payoff rather
than a damage ladder:

Sidearm, service rifle, rivet gun · baton, fire axe, gauntlets · fireball, arc
lance, kinetic push · bubble shield, deflect plate, coolant shroud · sprint
boost, blink, grapple winch · turret, healing pool, PA speaker · override key.

The override key is the nineteenth because sealing a door behind you is the first
moment the walk back out becomes a decision rather than a walk.

## Open questions

1. **Do vault and printing items have their own pools?** Both currently spend power, which is also what shields and devices use. A shield build and a vault build competing for the same meter may be wrong.
2. **How far can a milestone node go?** A fireball whose tree makes it leave a burning patch has quietly become a device. Trees that hand out hardware are the best part of this design and also the easiest place for families to stop meaning anything.
4. **How much of the catalogue may touch oxygen?** Sump, air scrubber, pressure seal, atmosphere pack, light load and deadman's rifle all bend the clock. Too many and the dive stops being timed.
5. **Do enemies use every item?** A recall anchor or a cargo exo makes no sense on a print. If part of the catalogue is player-only, Rule 4 needs an explicit exception.

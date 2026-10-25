### Added

- Creatures with temperaments: `decideTemperament` (`@jgengine/core/ai/temperament`) turns a creature's perception memory into flee, investigate, stalk, attack, guard or return. Passive creatures keep their distance, territorial ones defend the ground around their den and go home after, predators charge what they saw and follow a smell or a noise to where it came from. Light draws or drives off a creature, and a badly hurt one breaks off.
- Perception senses scent and light: a `"scent"` stimulus (blood, bait) reaches as far as `scentRange` times its strength, a candidate's `visibility` stretches or shrinks how far it is seen (a lamp on, crouched in the dark), and every memory records the `cue` that produced it.
- Codex fragments: an entry with `fragments: n` is learned after `n` calls to `codex.scan(id)`, the view shows `scanned` of `fragments`, and partial scans survive save and load. Old saves still load.

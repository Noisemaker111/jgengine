/**
 * A complete design brief for a made-up courier game: the shape `designBrief.ts` reads, used by the
 * games-design and games-depth tests and by the deep fixture game they play.
 */
export const EXAMPLE_BRIEF = `## Design brief

- Core loop: walk a parcel across town before its timer runs out
- Session loop: clear a district's board of ten parcels and buy the next van
- Long loop: open six districts, each with its own roads, rivals and cargo
- Second 0: on foot with one parcel in hand, so the first verb is walking it somewhere
- Onboarding: a dispatcher's radio calls each new thing the first time it matters
- Pace: something new every 2 minutes
- Longest cycle: 30 minutes, one district's season
- Minutes to see everything: 600

### First 10 minutes

- 0:00 one parcel; teaches walking and the drop-off ring
- 1:30 first pay; unlocks the bike
- 4:00 a fragile parcel; teaches careful steering
- 6:30 the board fills; unlocks choosing jobs
- 9:00 a rival courier; teaches racing for a job

### Start state

| Probe | At most |
| --- | --- |
| itemsSeen | 1 |
| unlocks | 0 |

### Content budget

| Kind | Count |
| --- | --- |
| items | 40 |
| areas | 6 |
| verbs | 12 |

### Systems

| System | Probe |
| --- | --- |
| delivery | delivered |
| vehicles | vehiclesOwned |
| jobs | jobsTaken |
| rivals | racesRun |
`;

# brightway-park plan

Brief: a seaside theme-park tycoon with the loop of RollerCoaster Tycoon: start on an empty lot, build a park guests want to visit, and keep it running for hours.

## Design brief

### Core loop

Build or adjust, watch guests react, fix problems.

- **Build or adjust**: lay paths from the gate, place a ride, connect its entrance and exit, add shops, scenery and staff, set the gate ticket and every price.
- **Watch guests react**: guests walk in, queue, ride, eat, drink, use the toilet, get sick, get tired, and say so. Their thoughts, mood and money are visible per guest and summed on the status card.
- **Fix problems**: a ride breaks and stays down until a mechanic fixes it; litter piles up until a handyman sweeps it; unhappy guests kick over bins unless security is near; prices too high empty the queues; a red month warns of bankruptcy.

Every problem comes from a system the player built into, and every fix is something the player buys or changes.

### Session goal

Each scenario is one objective with a deadline on the park calendar, for example "120 guests in the park and a 400 rating by the end of May, Year 1". Meeting it at any point before the deadline wins at once; the deadline passing, two red month-ends in a row, or the crowd's mood collapsing loses.

### Long loop

- **Research**: the lab unlocks the 28 rides, 10 shops and 14 scenery pieces over game months, one family chain at a time. A new park starts with 3 rides, 4 shops, the wooden coaster kit and the plain scenery.
- **Scenarios unlock each other**: winning one opens the next on the menu, kept across new games.
- **Loans**: the park opens owing the bank. Borrow in $1,000 steps to build faster, pay monthly interest, repay when the park is earning.
- **Staff**: mechanics (needed for every repair), handymen, entertainers and security guards, each on a monthly wage and a patrol area.
- **Park value and rating**: rating draws more guests and lets the park charge more at the gate; awards pay out at rating bands.
- **Marketing**: paid campaigns raise how many guests hear of the park for a few days.
- **Monthly books**: every month closes with a report of income and spending by kind, the loan's interest and the profit.

### What you have at second 0

An empty lot inside the fence, a closed gate with a short paved plaza behind it, $10,000 in the till, $10,000 owed to the bank, no guests, and a hint pointing at the gate. It is 09:00 on 1 March, Year 1.

### The first 10 minutes (at 1x)

1. **0:00** New game starts the first scenario. A hint points at the gate plaza: lay a path in from the gate.
2. **0:30** Path laid. The hint points at Build, then at the Carousel: place your first ride beside the path.
3. **1:00** Carousel placed; it is shut. The hint points at the ride: select it and press "Connect it" for an entrance and an exit.
4. **1:30** The ride is open. The hint points at "Open the gate".
5. **2:00** Gate open. The first guest walks in a few seconds later; more trickle in, one every several seconds at a new park's zero rating.
6. **2:30** Guests ride and start thinking out loud. The hint asks for food and drink stalls beside the path.
7. **4:00** Hungry and thirsty guests buy; some need the toilet. The hint asks for toilets. Rating starts to climb from zero.
8. **4:00-6:00** The carousel wears and breaks down. It stays down and guests complain. The hint points at Staff: hire a mechanic. The mechanic fixes it and keeps servicing it.
9. **6:00-8:00** Litter builds; the hint suggests a handyman. Day 3 or 4 begins; stalls restock at midnight.
10. **8:00-10:00** The hint points at the lab: start research on the next ride. The player places a second ride and sets prices; guests pour in faster as the rating climbs.

The first month closes at 20:00 with the monthly report.

### Content budget

- 28 rides, 10 shops and facilities, 14 scenery pieces, 4 staff roles: 34 lab topics unlock 24 rides, 6 shops and 4 scenery pieces in family chains.
- 3 scenarios, each unlocking the next, plus free play after any of them.
- Calendar: a day is 150 seconds, a month is 8 days (20 minutes at 1x), a year is the 8-month season March to October (2 hours 40 minutes at 1x).
- Scenario lengths at 1x: Brightway Beginnings 3 months (1 hour), Star Attraction 8 months (2 h 40), Full House 16 months (5 h 20). At 2x, half that.
- Estimated play: 4-9 hours to finish the three scenarios, plus open-ended free play. Lab topics total about 13 game months, so the full ride list arrives near the end of the last scenario.

## Features

- empty lot start — closed gate, starting cash and a loan, no guests until the park opens
- guest arrivals — trickle that ramps with rating and marketing
- research tree — rides, shops and scenery unlocked over game months
- guest needs — hunger, thirst, toilet, nausea, energy, happiness, money drive choices and complaints
- ride reliability — breakdowns that need a hired mechanic
- staff — hiring, wages, patrol areas
- pricing — gate ticket and ride and shop prices change demand
- litter and vandalism — handymen, bins and security
- monthly finances — month report, loan interest, bankruptcy
- scenarios — objectives with deadlines, win and lose, unlock chain
- calendar and speed — months and years, 1x to 8x
- onboarding — hints in the first scenario that point at things

## Milestones

1. [x] Design brief.
2. [x] Empty lot start, closed gate, arrival ramp, slower rating; the open-park proof plays from the empty lot.
3. [x] Monthly books, monthly loan interest and bankruptcy, marketing campaigns.
4. [ ] Repairs need a mechanic; reliability shown; research rescaled to months; bins cut litter.
5. [ ] Calendar months, long scenarios with an unlock chain, 8x speed.
6. [ ] Onboarding hints that point at the gate, the ride, the gate button and the staff button.

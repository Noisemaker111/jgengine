Fernwild now has weather and a climate by biome. Each biome has its own air: the south coast is hottest, the redwoods cool, and the snow biome drops below freezing at night, all colder with height and at night on ARK's hour-long day. Showers, a thunderstorm, a heatwave and a cold snap come round on a four-hour schedule that loops forever. The same storm falls as rain on the lowlands and as snow in the snow biome, sleet at the edge. Rain soaks a survivor under open sky and takes about 4 °C off; a roof, ceiling or rock overhead keeps it off; a campfire warms whoever stands near it. The HUD shows the weather and the temperature above the vitals, and the cold now hurts in the snow at night.

The day looks like ARK's too: full blue daylight from about 7:00 to 17:00 with a short dawn and dusk, where before the sky slid toward sunset orange all afternoon. While rain or snow falls the sky clouds over grey and the sun dims.

Two admin cheats were added for proofs: `clock` (settimeofday, weather schedule and all) and `teleport` (SetPlayerPos). A new flow, fernwild-weather, shoots a clear noon on the beach, an afternoon shower under a grey sky, and night snow in the north-west with the survivor freezing.

Engine seam: packages/core/src/weather/authoredWeather.ts (repeatSeconds, zone precipitationAs), packages/core/src/world/overhead.ts (new), packages/core/src/sky/daylightCycle.ts (dayHold, overcastDaylight), packages/core/src/sky/Daylight.draw.tsx (weather prop), packages/shell/src/Shell3dPresentation.tsx (passes the world's weather to the sky), packages/editor/src/SimulationInspector.tsx (repeat and falls-as fields)

Prevention: authored weather tests cover a looping schedule, a seamless lap and a lap shorter than the schedule being refused, and a zone turning a storm to snow with sleet at its edge. solidOverhead tests cover a ceiling, a wall beside you, the floor underfoot and a turned beam. Sky tests check the held noon sky through the afternoon with dusk unchanged, and that a storm greys the dome, dims the sun to a fifth and keeps a stormy night dark. Fernwild's climate tests check each biome, a freezing snow night that hurts against a warm beach, the same storm as rain on the beach and snow on the peaks, and a thatch roof and a campfire.

### Added

- `repeatSeconds` on authored weather: loop the schedule forever, each lap starting where the last ended.
- `precipitationAs: "rain" | "snow"` on a weather zone: whatever falls there falls as this, blending at the zone's edge.
- `solidOverhead(solids, at, { clearance?, reach? })` in `@jgengine/core/world/overhead`: whether a roof, ceiling or rock is over a point.
- `sky({ dayHold })`: how long the noon sky holds either side of noon under `timeOfDay`.
- `overcastDaylight(state, cover)` in `@jgengine/core/sky/daylightCycle`, and the `Sky` component's `weather` prop: falling rain or snow clouds the sky over. The shell passes the world's weather to the sky whenever the authored scene has weather.

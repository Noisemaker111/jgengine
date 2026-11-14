/**
 * The Root Server's numbers: the buried datacenter that broadcasts the Signal Storms. It never moves; it
 * pulses shocks at what comes close and spins up Choir drones as its firewall, more and faster as it is
 * hurt. Destroying it ends the storms and pays out Element and XP. Approximate, tuned so a
 * level-40 technician with a rigged mount and metal tools wins in a few minutes.
 */
export const ROOT_SERVER = {
  species: "root_server",
  firewallSpecies: "choir",
  level: 30,
  /** Metres past the chamber's edge at which it boots. */
  wakeExtra: 6,
  maxFirewall: 8,
  phases: [
    { at: 1, firewall: 2, firewallEvery: 25, tell: "" },
    { at: 0.66, firewall: 3, firewallEvery: 18, tell: "The Root Server reroutes power: its firewall spins up faster." },
    { at: 0.33, firewall: 4, firewallEvery: 12, tell: "The Root Server overclocks every rack. Drones pour out of the walls." },
  ],
  rewards: { element: 80 } as Readonly<Record<string, number>>,
  xp: 1500,
} as const;

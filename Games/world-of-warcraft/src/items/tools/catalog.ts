export interface ToolDef {
  id: string;
  name: string;
  use: string;
  weapon: Record<string, number>;
}

export const fishing_rod: ToolDef = {
  id: "fishing_rod",
  name: "Fishing Rod",
  use: "castFishingLine",
  weapon: {},
};

export const capture_orb: ToolDef = {
  id: "capture_orb",
  name: "Capture Orb",
  use: "attemptCapture",
  weapon: { catchPower: 1.4 },
};

export const tools: ToolDef[] = [fishing_rod, capture_orb];

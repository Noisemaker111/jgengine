/**
 * Single source of truth for the LLMville builder agent playbook.
 * Served at GET /dev/build (Accept: application/json) and GET /__llmville-builder/playbook.
 */

export interface BuilderScreenshotGuide {
  index: string;
  angles: readonly ["viewport", "perspective", "top", "side"];
  prerequisite: string;
  workflow: string[];
  verifyWorkflow: string[];
  exampleFetch: string;
  staleCaptureHint: string;
}

export interface BuilderAgentPlaybook {
  api: "llmville-builder";
  apiVersion: 1;
  audience: "coding-agents";
  summary: string;
  origin: string;
  discover: string;
  openapi: string;
  sceneApi: string;
  playbook: string;
  startHere: {
    message: string;
    steps: string[];
  };
  agentRules: {
    context: string;
    do: string[];
    doNot: string[];
  };
  howToCall: string;
  coreLoop: string[];
  coordinateSystem: {
    position: string;
    rotation: string;
    floor: string;
    colors: string;
  };
  examples: Record<string, unknown>;
  taskWalkthrough: {
    title: string;
    prompt: string;
    steps: string[];
  };
  screenshots: BuilderScreenshotGuide;
  notes: string[];
}

function builderScreenshotGuide(origin: string): BuilderScreenshotGuide {
  return {
    index: `${origin}/__llmville-builder/screenshot`,
    angles: ["viewport", "perspective", "top", "side"],
    prerequisite:
      "A browser tab must have /dev/build open so the 3D view can render and upload captures. Open it for the user if you can.",
    workflow: [
      `POST ${origin}/__llmville-builder/screenshot/request — ask the open /dev/build tab to capture now.`,
      `Poll GET ${origin}/__llmville-builder/screenshot?requestId=N until status.ready is true.`,
      `GET ${origin}/__llmville-builder/screenshot/viewport.png — the live camera (what the user sees).`,
      `Optional presets: perspective.png, top.png, side.png — fixed camera angles.`,
      "Save PNGs outside the repo or pass to a vision tool. Never paste base64 into chat.",
    ],
    verifyWorkflow: [
      "Ensure /dev/build is open in a browser tab (required — the tab uploads captures).",
      `POST ${origin}/__llmville-builder/screenshot/request and note requestId.`,
      "Poll GET /__llmville-builder/screenshot?requestId=N every 1–2s until status.ready is true (usually <10s).",
      "GET /__llmville-builder/screenshot/viewport.png — this matches the builder viewport, not a stale file.",
      "Check status.capturedAt and status.sceneVersion; status.stale=true means you need another request.",
    ],
    exampleFetch: `curl -X POST ${origin}/__llmville-builder/screenshot/request && sleep 8 && curl -o viewport.png ${origin}/__llmville-builder/screenshot/viewport.png`,
    staleCaptureHint:
      "If status.ready stays false or viewport.png is black, open /dev/build in a browser and POST /screenshot/request again. Do not trust PNGs without a fresh requestId.",
  };
}

export function buildBuilderAgentPlaybook(origin: string): BuilderAgentPlaybook {
  const playbookUrl = `${origin}/__llmville-builder/playbook`;
  return {
    api: "llmville-builder",
    apiVersion: 1,
    audience: "coding-agents",
    summary:
      "Remote HTTP API for the LLMville 3D builder. No auth token — localhost only. You do not need repository access.",
    origin,
    discover: `${origin}/.well-known/llmville-builder.json`,
    openapi: `${origin}/dev-assets/builder-api.openapi.json`,
    sceneApi: `${origin}/__llmville-builder`,
    playbook: playbookUrl,
    startHere: {
      message:
        "You were sent to the builder URL. Do not open or edit the LLMville repo — use HTTP from this origin only.",
      steps: [
        `Read this playbook: GET ${playbookUrl}`,
        "Check live status: GET /__llmville-builder/status",
        "Create an object: POST /__llmville-builder/assets (primitives/group — prefer over broken catalog modelKey placeholders)",
        "Or compose rooms: POST /__llmville-builder/scene/place",
        "Verify: POST /screenshot/request with {\"angles\":[\"viewport\"]}, poll, GET viewport.png",
      ],
    },
    agentRules: {
      context:
        "Treat yourself as an external agent with only HTTP access to this dev server. The game source code is not available to you.",
      do: [
        "Use curl, fetch, or WebFetch against the URLs in this playbook",
        "GET /__llmville-builder/status first — confirm browserConnected before screenshots",
        "POST /__llmville-builder/assets to create + save primitive/group objects in one call",
        "Prefer type group with box/cylinder/sphere children over modelKey catalog entries (many are placeholders)",
        "Compose rooms with POST /__llmville-builder/scene/place when building layouts",
        "POST /screenshot/request with {\"angles\":[\"viewport\"]} — does not move the user's camera",
        "Keep returned decor ids for later move/delete calls",
      ],
      doNot: [
        "Do not create scripts, files, or commits in the LLMville repository",
        "Do not run bun, npm, or import @llmville/game — you are not in the monorepo",
        "Do not assume shell or filesystem access to project source",
        "Do not copy screenshot PNGs into the workspace or paste image binary into chat",
        "Do not trust catalog modelKey alone — desk_lamp and others may render wrong GLBs",
        "Do not POST /screenshot/request with preset angles unless you need top/perspective views",
      ],
    },
    howToCall: "Standard HTTP. Mutation bodies are JSON. Mutation responses are JSON. Screenshot paths return image/png.",
    coreLoop: [
      "GET /__llmville-builder/status — browserConnected, scene version, screenshot readiness.",
      "POST /__llmville-builder/assets — create object on isolated stage; optional save + viewport verify.",
      "GET /__llmville-builder/scene — read mapData, version, updatedBy (agent|browser).",
      "POST /__llmville-builder/scene/place — append decor to the current scene.",
      "POST /__llmville-builder/scene — replace full mapData (rooms, walls, decor).",
      "POST /__llmville-builder/scene/move — update position/rotation by id.",
      "POST /__llmville-builder/screenshot/request — {\"angles\":[\"viewport\"]} default; poll until ready.",
    ],
    coordinateSystem: {
      position: "[x, y, z] meters. y=0 is the floor. A 1m tall box on the floor uses y=0.5.",
      rotation: "[rx, ry, rz] radians. [0, 1.57, 0] is a 90° yaw.",
      floor:
        "Read environment.floor from GET /scene: width, depth, centerX, centerZ define the editable floor rectangle.",
      colors: "color is #rrggbb. roughness and metalness are 0–1.",
    },
    examples: {
      fetchPlaybook: {
        method: "GET",
        path: "/dev/build",
        headers: { Accept: "application/json" },
      },
      readScene: {
        method: "GET",
        path: "/__llmville-builder/scene",
      },
      placeBox: {
        method: "POST",
        path: "/__llmville-builder/scene/place",
        body: {
          decor: {
            type: "box",
            args: [1, 1, 1],
            position: [0, 0.5, 0],
            color: "#ff4444",
          },
        },
      },
      placeBedroomItems: {
        method: "POST",
        path: "/__llmville-builder/scene/place",
        body: {
          items: [
            {
              id: "bedroom_bed",
              type: "group",
              position: [0, 0, -1.5],
              children: [
                { type: "box", args: [2, 0.35, 1.6], position: [0, 0.27, 0], color: "#ddd0bc" },
                { type: "box", args: [2, 0.9, 0.1], position: [0, 0.65, -0.75], color: "#5a3f2e" },
              ],
            },
            {
              id: "bedroom_rug",
              type: "plane",
              args: [3, 2.2],
              position: [0, 0.018, -0.8],
              rotation: [-1.5708, 0, 0],
              color: "#c47a62",
              doubleSide: true,
            },
          ],
        },
      },
      moveItem: {
        method: "POST",
        path: "/__llmville-builder/scene/move",
        body: {
          id: "bedroom_bed",
          position: [0.5, 0, -1.5],
          rotation: [0, 1.57, 0],
        },
      },
      deleteItems: {
        method: "POST",
        path: "/__llmville-builder/scene/delete",
        body: { ids: ["bedroom_bed"] },
      },
      createDeskLamp: {
        method: "POST",
        path: "/__llmville-builder/assets",
        body: {
          id: "desk_lamp",
          label: "Desk Lamp",
          tags: ["decor", "lamp"],
          save: true,
          verify: true,
          decor: {
            type: "group",
            footprint: { width: 1, depth: 1 },
            children: [
              { type: "cylinder", args: [0.14, 0.14, 0.05, 24], position: [0, 0.025, 0.02], color: "#2a2e34", metalness: 0.72 },
              { type: "cylinder", args: [0.03, 0.03, 0.34, 16], position: [-0.02, 0.2, 0], color: "#3a4048", metalness: 0.68 },
              { type: "box", args: [0.24, 0.03, 0.03], position: [0.08, 0.39, 0.03], rotation: [0, 0.15, -0.42], color: "#3a4048" },
              { type: "cylinder", args: [0.1, 0.12, 0.11, 24], position: [0.2, 0.47, 0.05], rotation: [0.55, 0.1, 0], color: "#f0d7a2", emissive: "#ffcc66", emissiveIntensity: 0.42 },
            ],
          },
        },
      },
      requestScreenshot: {
        method: "POST",
        path: "/__llmville-builder/screenshot/request",
        body: { angles: ["viewport"] },
        response: { requestId: 1, status: "pending", poll: "/__llmville-builder/screenshot?requestId=1" },
      },
      verifyViewport: {
        method: "GET",
        path: "/__llmville-builder/screenshot/viewport.png",
        response: "image/png binary — matches the live builder camera; fetch after POST /screenshot/request",
      },
    },
    taskWalkthrough: {
      title: "Create an object (lamp, chair, prop)",
      prompt: "fix the desk lamp / make a desk lamp",
      steps: [
        "GET /__llmville-builder/status — ensure browserConnected is true.",
        "POST /__llmville-builder/assets with id, label, and decor (type group + primitive children).",
        "Response includes scene.version, savedTo paths, and screenshot.poll URL.",
        "Poll GET /screenshot?requestId=N until status.ready, then GET viewport.png.",
        "User refines in /dev/build; browser pulls agent scene within ~2s.",
      ],
    },
    screenshots: builderScreenshotGuide(origin),
    notes: [
      "POST /assets is the fastest path: isolated stage + save + optional viewport verify in one call.",
      "Scene responses include updatedBy — agent edits win over stale browser session on pull.",
      "Primitives sit on y=0 floor; box center y = height/2, cylinder y = height/2.",
      "Groups use children with positions relative to the group origin.",
      "Many catalog modelKeys use placeholder GLBs — build with groups unless you know the model is correct.",
      "Screenshot default is viewport-only so the user's camera is not disturbed.",
    ],
  };
}

export function buildBuilderDiscoveryManifest(origin: string) {
  const playbook = buildBuilderAgentPlaybook(origin);
  return {
    apiVersion: playbook.apiVersion,
    audience: playbook.audience,
    summary: playbook.summary,
    origin: playbook.origin,
    discover: playbook.discover,
    openapi: playbook.openapi,
    sceneApi: playbook.sceneApi,
    playbook: playbook.playbook,
    screenshot: playbook.screenshots.index,
    firstStep: playbook.startHere.steps[0],
    agentRules: playbook.agentRules,
    screenshots: playbook.screenshots,
  };
}
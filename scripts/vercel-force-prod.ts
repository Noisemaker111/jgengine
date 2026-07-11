const token = process.env.VERCEL_TOKEN;
const teamId = process.env.VERCEL_TEAM_ID;
const sha = process.env.COMMIT_SHA ?? process.env.GITHUB_SHA;
const projectName = process.env.VERCEL_PROJECT_NAME ?? "jgengine-web";

if (!token) {
  console.error("VERCEL_TOKEN is required.");
  process.exit(1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const api = async (path: string, init?: RequestInit): Promise<any> => {
  const url = new URL(`https://api.vercel.com${path}`);
  if (teamId) url.searchParams.set("teamId", teamId);
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return res.json();
};

const projects = await api(`/v9/projects?search=${encodeURIComponent(projectName)}&limit=10`);
const project =
  (projects.projects as { id: string; name: string; link?: { type?: string; repoId?: number | string; org?: string; repo?: string } }[] | undefined)?.find(
    (entry) => entry.name === projectName,
  ) ?? (projects.projects as { id: string; name: string; link?: { repoId?: number | string } }[] | undefined)?.[0];

if (project === undefined) {
  console.error(`No Vercel project matching "${projectName}".`);
  process.exit(1);
}

const repoId = project.link?.repoId;
if (repoId === undefined) {
  console.error(`Project ${project.name} (${project.id}) has no linked GitHub repoId.`);
  process.exit(1);
}

const gitSource: Record<string, unknown> = {
  type: "github",
  repoId,
  ref: "main",
};
if (sha) gitSource.sha = sha;

console.log(`Forcing production deploy of ${project.name} @ ${typeof sha === "string" ? sha.slice(0, 7) : "main"}…`);

const created = await api("/v13/deployments?forceNew=1", {
  method: "POST",
  body: JSON.stringify({
    name: project.name,
    project: project.id,
    target: "production",
    gitSource,
  }),
});

const uid = created.id ?? created.uid;
if (typeof uid !== "string") {
  console.error("Deploy response missing id:", JSON.stringify(created));
  process.exit(1);
}

console.log(`Deployment ${uid} created — https://${created.url ?? ""}`);

const deadline = Date.now() + 20 * 60 * 1000;
while (Date.now() < deadline) {
  const d = await api(`/v13/deployments/${uid}`);
  const state = d.readyState ?? d.status;
  console.log(`Deployment ${uid}: ${state}`);
  if (state === "READY") {
    console.log(`Production READY — https://${d.url ?? created.url ?? ""}`);
    process.exit(0);
  }
  if (state === "ERROR" || state === "CANCELED") {
    console.error(`Deployment ended ${state}`);
    process.exit(1);
  }
  await sleep(10_000);
}

console.error(`Timed out waiting for deployment ${uid}`);
process.exit(1);

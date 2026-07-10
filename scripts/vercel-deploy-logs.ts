const token = process.env.VERCEL_TOKEN;
const teamId = process.env.VERCEL_TEAM_ID;
const sha = process.env.COMMIT_SHA ?? process.env.GITHUB_SHA;

if (!token) {
  console.error(
    "VERCEL_TOKEN secret is not set — this workflow cannot see Vercel deployments, so its " +
      "green check would be meaningless. Failing loudly instead of silently passing.",
  );
  console.error(
    "Fix: create a token at vercel.com/account/tokens, then add VERCEL_TOKEN (and " +
      "VERCEL_TEAM_ID for team projects) under repo Settings → Secrets and variables → Actions.",
  );
  process.exit(1);
}
if (!sha) {
  console.error("No commit SHA (COMMIT_SHA/GITHUB_SHA) provided.");
  process.exit(1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const api = async (path: string): Promise<any> => {
  const url = new URL(`https://api.vercel.com${path}`);
  if (teamId) url.searchParams.set("teamId", teamId);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return res.json();
};

type Deployment = {
  uid: string;
  name: string;
  readyState: string;
  url?: string;
  inspectorUrl?: string;
};

const findDeployments = async (): Promise<Deployment[]> => {
  const deadline = Date.now() + 4 * 60 * 1000;
  while (Date.now() < deadline) {
    const { deployments } = await api(`/v6/deployments?limit=25&meta-githubCommitSha=${sha}`);
    if (deployments?.length) return deployments;
    console.log(`No Vercel deployment for ${sha.slice(0, 7)} yet — waiting...`);
    await sleep(15000);
  }
  return [];
};

const waitForDeployment = async (uid: string): Promise<Deployment> => {
  const deadline = Date.now() + 20 * 60 * 1000;
  while (Date.now() < deadline) {
    const d = await api(`/v13/deployments/${uid}`);
    const state = d.readyState ?? d.status;
    if (["READY", "ERROR", "CANCELED"].includes(state)) return { ...d, uid, readyState: state };
    console.log(`Deployment ${uid}: ${state} — waiting...`);
    await sleep(10000);
  }
  throw new Error(`Timed out waiting for deployment ${uid}`);
};

const buildLogs = async (uid: string): Promise<string> => {
  const events = await api(`/v3/deployments/${uid}/events?builds=1&limit=-1&direction=forward`);
  const lines = (Array.isArray(events) ? events : [])
    .map((e: any) => e?.payload?.text ?? e?.text ?? "")
    .filter(Boolean);
  return lines.join("\n");
};

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
const summarize = async (md: string) => {
  if (!summaryPath) return;
  const { appendFileSync } = await import("node:fs");
  appendFileSync(summaryPath, md + "\n");
};

const deployments = await findDeployments();
if (deployments.length === 0) {
  console.log(`No Vercel deployment appeared for ${sha} (the project's ignoreCommand may have skipped it).`);
  await summarize(`### Vercel\n\nNo deployment for \`${sha.slice(0, 7)}\` — build skipped by ignoreCommand or Git integration lag.`);
  process.exit(0);
}

let failed = false;
for (const dep of deployments) {
  const done = await waitForDeployment(dep.uid);
  const logs = await buildLogs(dep.uid);
  const icon = done.readyState === "READY" ? "✅" : done.readyState === "CANCELED" ? "⚪" : "❌";
  const header = `${icon} ${done.name ?? dep.name} — ${done.readyState} — https://${done.url ?? dep.url ?? ""}`;

  console.log(`\n${"=".repeat(80)}\n${header}\n${"=".repeat(80)}`);
  console.log(logs || "(no build log lines returned)");

  const trimmed = logs.split("\n").slice(-400).join("\n");
  await summarize(
    `### Vercel: ${done.name ?? dep.name} — ${icon} ${done.readyState}\n\n` +
      `[deployment](https://${done.url ?? ""}) · [inspector](${done.inspectorUrl ?? ""})\n\n` +
      `<details><summary>Build log (last 400 lines)</summary>\n\n\`\`\`\n${trimmed}\n\`\`\`\n\n</details>`,
  );

  if (done.readyState === "ERROR") failed = true;
}

process.exit(failed ? 1 : 0);

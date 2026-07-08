import type { GitHubClient } from "../client";

export interface Workflow {
  id: number;
  name: string;
  state: string;
  path: string;
}

interface RawWorkflow {
  id: number;
  name: string;
  state: string;
  path: string;
}

interface RawWorkflowsResponse {
  workflows: RawWorkflow[];
}

export interface WorkflowRun {
  id: number;
  name: string | null;
  status: string;
  conclusion: string | null;
  event: string;
  headBranch: string | null;
  runNumber: number;
  createdAt: string;
  url: string;
}

interface RawWorkflowRun {
  id: number;
  name: string | null;
  status: string;
  conclusion: string | null;
  event: string;
  head_branch: string | null;
  run_number: number;
  created_at: string;
  html_url: string;
}

interface RawWorkflowRunsResponse {
  workflow_runs: RawWorkflowRun[];
}

function clampPerPage(perPage: number | undefined): number {
  return Math.min(perPage ?? 30, 100);
}

/** List the workflow definitions configured on a repository. */
export async function workflows(gh: GitHubClient, owner: string, name: string): Promise<Workflow[]> {
  const raw = await gh.rest<RawWorkflowsResponse>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/actions/workflows`);
  return raw.workflows.map((w) => ({ id: w.id, name: w.name, state: w.state, path: w.path }));
}

export interface WorkflowRunsOptions {
  perPage?: number;
  branch?: string;
}

/** List recent workflow runs (CI history) for a repository. */
export async function workflowRuns(
  gh: GitHubClient,
  owner: string,
  name: string,
  opts: WorkflowRunsOptions = {},
): Promise<WorkflowRun[]> {
  const params = new URLSearchParams({ per_page: String(clampPerPage(opts.perPage)) });
  if (opts.branch !== undefined) params.set("branch", opts.branch);
  const raw = await gh.rest<RawWorkflowRunsResponse>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/actions/runs?${params.toString()}`,
  );
  return raw.workflow_runs.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    conclusion: r.conclusion,
    event: r.event,
    headBranch: r.head_branch,
    runNumber: r.run_number,
    createdAt: r.created_at,
    url: r.html_url,
  }));
}

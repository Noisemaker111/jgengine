// jgengine.com's GitHub panels: the proxy and contributions endpoints the Worker serves to visitors.
import { githubContributionsHandler, githubProxyHandler } from "@jgengine/github/server";

const token = process.env["GITHUB_TOKEN"] || undefined;

export const githubProxy = githubProxyHandler({ token });
export const githubContributions = githubContributionsHandler({ token });

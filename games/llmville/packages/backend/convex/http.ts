import { httpRouter } from "convex/server";

import { authComponent, createAuth } from "./auth";
import {
  agentApiIndex,
  agentApiPing,
  agentApiPlaybook,
} from "./agentApiHttp";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth, { cors: true });

http.route({
  path: "/agent/api/v1",
  method: "GET",
  handler: agentApiIndex,
});

http.route({
  path: "/agent/api/v1/playbook",
  method: "GET",
  handler: agentApiPlaybook,
});

http.route({
  path: "/agent/api/v1/ping",
  method: "GET",
  handler: agentApiPing,
});

export default http;

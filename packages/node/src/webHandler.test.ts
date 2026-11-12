import { expect, test } from "bun:test";
import { createServer } from "node:http";

import { localRequest } from "./testFixtures";
import { toNodeHandler } from "./webHandler";

test("toNodeHandler bridges a fetch-standard handler onto a node server", async () => {
  const server = createServer(
    toNodeHandler(async (request) => {
      const url = new URL(request.url);
      if (url.pathname === "/boom") throw new Error("boom");
      return Response.json({ path: url.pathname, gameId: url.searchParams.get("gameId") }, { status: 201 });
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("expected a port");
  const base = `http://127.0.0.1:${address.port}`;

  const response = await localRequest(`${base}/api/servers?gameId=demo`);
  expect(response.status).toBe(201);
  expect(response.json()).toEqual({ path: "/api/servers", gameId: "demo" });

  const failed = await localRequest(`${base}/boom`);
  expect(failed.status).toBe(500);
  expect(failed.json()).toEqual({ error: "boom" });

  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

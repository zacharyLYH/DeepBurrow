import { createServer, type Server, type ServerResponse } from "node:http";
import { fixtureEvents, fixtureBurrow } from "../../../packages/types/src/fixtures.ts";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const send = (res: ServerResponse, status: number, body: string, type: string) => {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
};

export function createMockServer(): Server {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (url.pathname === "/burrow") {
      send(res, 200, JSON.stringify(fixtureBurrow), "application/json");
      return;
    }

    if (url.pathname === "/ask") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-store",
        connection: "keep-alive",
      });
      for (const event of fixtureEvents) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        await delay(20);
      }
      res.end();
      return;
    }

    send(res, 404, "not found", "text/plain");
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 8787);
  createMockServer().listen(port, () => {
    console.log(`mock sse on http://localhost:${port}`);
  });
}

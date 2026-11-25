import { createServer, type ServerResponse } from "node:http";
import { PUSH_PORT, type MockPush } from "./mock-push.ts";

const pushes: MockPush[] = [];
const json = (response: ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
};

createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200).end("ok");
    return;
  }
  if (request.method === "GET" && request.url === "/events") {
    json(response, 200, pushes);
    return;
  }
  if (request.method === "DELETE" && request.url === "/reset") {
    pushes.length = 0;
    response.writeHead(204).end();
    return;
  }
  if (request.method === "POST" && request.url === "/push") {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      pushes.push(JSON.parse(body) as MockPush);
      response.writeHead(202).end();
    });
    return;
  }
  response.writeHead(404).end();
}).listen(PUSH_PORT, "127.0.0.1", () => console.log(`mock push ${PUSH_PORT}`));

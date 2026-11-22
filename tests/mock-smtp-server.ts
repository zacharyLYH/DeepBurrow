import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { MAILBOX_PORT, SMTP_PORT } from "./mock-smtp.ts";

type Message = { to: string; data: string };
const messages: Message[] = [];

// Tests read delivered mail here, so the API's SMTP client is fully exercised.
createHttpServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200).end("ok");
    return;
  }
  const to = new URL(request.url ?? "/", "http://mock").searchParams.get("to");
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(messages.filter((message) => !to || message.to === to)));
}).listen(MAILBOX_PORT, "127.0.0.1");

createServer((socket) => {
  let buffer = "";
  let recipient = "";
  let data = "";
  let mode: "line" | "data" = "line";
  let authStep = 0;
  socket.setEncoding("utf8");
  const send = (line: string) => socket.write(`${line}\r\n`);
  send("220 mock-smtp");

  socket.on("data", (chunk: string) => {
    buffer += chunk;
    if (mode === "data") {
      const end = buffer.indexOf("\r\n.\r\n");
      if (end < 0) return;
      data = buffer.slice(0, end);
      buffer = buffer.slice(end + 5);
      messages.push({ to: recipient, data });
      mode = "line";
      send("250 OK");
    }

    let at: number;
    while ((at = buffer.indexOf("\r\n")) >= 0) {
      const line = buffer.slice(0, at);
      buffer = buffer.slice(at + 2);
      const upper = line.toUpperCase();
      if (upper.startsWith("EHLO") || upper.startsWith("HELO")) {
        send("250-mock\r\n250-AUTH LOGIN\r\n250 OK");
      } else if (upper.startsWith("AUTH LOGIN")) {
        authStep = 1;
        send("334 VXNlcm5hbWU6");
      } else if (authStep === 1) {
        authStep = 2;
        send("334 UGFzc3dvcmQ6");
      } else if (authStep === 2) {
        authStep = 0;
        send("235 OK");
      } else if (upper.startsWith("MAIL FROM")) {
        send("250 OK");
      } else if (upper.startsWith("RCPT TO")) {
        recipient = /<([^>]+)>/.exec(line)?.[1] ?? "";
        send("250 OK");
      } else if (upper === "DATA") {
        mode = "data";
        data = "";
        send("354 End data");
        return;
      } else if (upper === "QUIT") {
        send("221 Bye");
        socket.end();
      } else {
        send("250 OK");
      }
    }
  });
}).listen(SMTP_PORT, "127.0.0.1");

console.log(`mock smtp ${SMTP_PORT}, mailbox ${MAILBOX_PORT}`);

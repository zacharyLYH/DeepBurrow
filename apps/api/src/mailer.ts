import { once } from "node:events";
import { connect as netConnect, type Socket } from "node:net";
import { hostname } from "node:os";
import { connect as tlsConnect } from "node:tls";

type MailConfig = { host: string; port: number; user: string; pass: string; from: string };
type Conn = { socket: Socket; next: () => Promise<string>; detach: () => void };
type Reply = { code: number; lines: string[] };

const env = (): MailConfig => ({
  host: process.env.SMTP_HOST ?? "",
  port: Number(process.env.SMTP_PORT ?? 587),
  user: process.env.SMTP_USERNAME ?? "",
  pass: process.env.SMTP_PASSWORD ?? "",
  from: process.env.SMTP_FROM ?? "",
});

const reader = (socket: Socket): Conn => {
  let buffer = "";
  let closed = false;
  let wake: (() => void) | null = null;
  const lines: string[] = [];
  const data = (chunk: string) => {
    buffer += chunk;
    let at = buffer.indexOf("\r\n");
    while (at >= 0) {
      lines.push(buffer.slice(0, at));
      buffer = buffer.slice(at + 2);
      at = buffer.indexOf("\r\n");
    }
    wake?.();
    wake = null;
  };
  const close = () => {
    closed = true;
    wake?.();
    wake = null;
  };
  socket.setEncoding("utf8");
  socket.on("data", data);
  socket.on("close", close);
  return {
    socket,
    detach: () => {
      socket.off("data", data);
      socket.off("close", close);
    },
    next: async () => {
      while (!lines.length) {
        if (closed) throw new Error("SMTP connection closed");
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
      return lines.shift()!;
    },
  };
};

const readReply = async (conn: Conn): Promise<Reply> => {
  let line = await conn.next();
  const code = Number(line.slice(0, 3));
  const lines = [line];
  while (line[3] === "-") {
    line = await conn.next();
    lines.push(line);
  }
  return { code, lines };
};

const write = (conn: Conn, line: string) => conn.socket.write(`${line}\r\n`);

const expectReply = async (conn: Conn, line: string, codes: number[]) => {
  write(conn, line);
  const reply = await readReply(conn);
  if (!codes.includes(reply.code)) throw new Error(`SMTP ${reply.code}: ${reply.lines.at(-1)}`);
  return reply;
};

const address = (value: string) => /<([^>]+)>/.exec(value)?.[1] ?? value;

async function open(config: MailConfig): Promise<Conn> {
  const { host, port, user, pass } = config;
  const socket = netConnect({ host, port });
  socket.setTimeout(10_000, () => socket.destroy(new Error("SMTP timed out")));
  await once(socket, "connect");

  let conn = reader(socket);
  const greet = async () => (await expectReply(conn, `EHLO ${hostname()}`, [250])).lines;

  if ((await readReply(conn)).code !== 220) throw new Error("SMTP refused the connection");
  let caps = await greet();

  if (caps.some((line) => /STARTTLS/i.test(line))) {
    await expectReply(conn, "STARTTLS", [220]);
    conn.detach();
    const secure = await new Promise<Socket>((resolve, reject) => {
      const upgraded = tlsConnect({ socket, servername: host }, () => resolve(upgraded));
      upgraded.once("error", reject);
    });
    secure.setTimeout(10_000, () => secure.destroy(new Error("SMTP timed out")));
    conn = reader(secure);
    caps = await greet();
  }

  if (user && caps.some((line) => /AUTH\b.*LOGIN/i.test(line))) {
    await expectReply(conn, "AUTH LOGIN", [334]);
    await expectReply(conn, Buffer.from(user).toString("base64"), [334]);
    await expectReply(conn, Buffer.from(pass).toString("base64"), [235]);
  }
  return conn;
}

export async function sendLoginCode(to: string, code: string) {
  const config = env();
  const conn = await open(config);
  try {
    await expectReply(conn, `MAIL FROM:<${address(config.from)}>`, [250]);
    await expectReply(conn, `RCPT TO:<${to}>`, [250, 251]);
    await expectReply(conn, "DATA", [354]);
    write(
      conn,
      [
        `From: ${config.from}`,
        `To: ${to}`,
        "Subject: Your DeepBurrow code",
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=utf-8",
        "",
        `Your DeepBurrow code is ${code}. It expires shortly.`,
        ".",
      ].join("\r\n"),
    );
    const done = await readReply(conn);
    if (done.code !== 250) throw new Error(`SMTP ${done.code}`);
    write(conn, "QUIT");
  } finally {
    conn.detach();
    conn.socket.end();
  }
}

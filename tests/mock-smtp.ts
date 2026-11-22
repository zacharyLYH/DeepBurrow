export const SMTP_PORT = 2525;
export const MAILBOX_PORT = 2526;
const MAILBOX_URL = `http://127.0.0.1:${MAILBOX_PORT}`;

// The browser suite runs through this mock, never a real mail provider.
export const smtpEnv = {
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: String(SMTP_PORT),
  SMTP_USERNAME: "test",
  SMTP_PASSWORD: "test",
  SMTP_FROM: "DeepBurrow <no-reply@deepburrow.test>",
  CODE_RESEND_MS: "0",
};

// In-process apps in unit specs read the same env as the spawned API server.
Object.assign(process.env, smtpEnv);

type Message = { to: string; data: string };

const messages = async (email: string) => {
  const response = await fetch(`${MAILBOX_URL}/messages?to=${encodeURIComponent(email)}`);
  return (await response.json()) as Message[];
};

export const mailCount = async (email: string) => (await messages(email)).length;

export async function latestCode(email: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const code = (await messages(email)).at(-1)?.data.match(/\b(\d{6})\b/)?.[1];
    if (code) return code;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`no mail for ${email}`);
}

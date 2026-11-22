import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import type { Session } from "@/lib/api";

type Step = "email" | "code";

const post = async (path: string, body: unknown) => {
  const response = await fetch(`/api/auth/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
  } & Partial<Session>;
  return { ok: response.ok, data };
};

export function AuthScreen({
  notice,
  onSession,
}: {
  notice?: string;
  onSession: (session: Session) => void;
}) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  // Login and account creation share this request; the server decides later.
  const send = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setPending(true);
    setError("");
    try {
      const { ok, data } = await post("email", { email });
      if (!ok) {
        setError(data.error ?? "Could not send a code");
        return;
      }
      setStep("code");
      setCode("");
    } catch {
      setError("Could not reach the server");
    } finally {
      setPending(false);
    }
  };

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const { ok, data } = await post("verify", { email, code });
      if (!ok || !data.user || !data.burrowId) {
        setError(data.error ?? "Invalid or expired code");
        setCode("");
        return;
      }
      onSession({ user: data.user, burrowId: data.burrowId });
    } catch {
      setError("Could not reach the server");
    } finally {
      setPending(false);
    }
  };

  const emailStep = step === "email";

  return (
    <main
      data-testid="auth-screen"
      className="relative flex min-h-dvh items-center justify-center p-6"
    >
      <a
        href="/"
        data-testid="auth-home"
        aria-label="Back to DeepBurrow home"
        className="absolute left-4 top-4 flex items-center gap-2 text-sm font-semibold tracking-tight text-muted-foreground hover:text-foreground"
      >
        <img
          src="/deepburrow_logo.png"
          alt=""
          className="size-7 rounded-md object-contain"
          width={28}
          height={28}
        />
        DeepBurrow
      </a>
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl tracking-tight">DeepBurrow</CardTitle>
          <CardDescription>
            {emailStep
              ? "Enter your email and we'll send a six-digit code."
              : `Enter the code we sent to ${email}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={emailStep ? send : verify} className="space-y-3">
            {notice && (
              <p
                data-testid="auth-notice"
                className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground"
              >
                {notice}
              </p>
            )}
            {emailStep ? (
              <Input
                data-testid="auth-email"
                type="email"
                autoComplete="email"
                autoFocus
                required
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            ) : (
              <div className="flex justify-center">
                <InputOTP
                  data-testid="auth-code"
                  maxLength={6}
                  inputMode="numeric"
                  autoFocus
                  value={code}
                  onChange={setCode}
                >
                  <InputOTPGroup>
                    {Array.from({ length: 6 }, (_, index) => (
                      <InputOTPSlot key={index} index={index} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
            )}

            {error && (
              <p data-testid="auth-error" role="alert" className="text-center text-xs text-destructive">
                {error}
              </p>
            )}

            <Button data-testid="auth-submit" type="submit" className="w-full" disabled={pending}>
              {pending ? "Working…" : emailStep ? "Send code" : "Continue"}
            </Button>

            {emailStep ? (
              <p className="text-center text-[11px] text-muted-foreground">
                New here? The same form creates your account.
              </p>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <Button
                  data-testid="auth-resend"
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={pending}
                  onClick={() => void send()}
                >
                  Resend code
                </Button>
                <Button
                  data-testid="auth-back"
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    setStep("email");
                    setError("");
                  }}
                >
                  Change email
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

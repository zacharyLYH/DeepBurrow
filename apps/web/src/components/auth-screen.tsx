import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Session } from "@/lib/api";

type Mode = "sign-in" | "sign-up";

export function AuthScreen({
  notice,
  onSession,
}: {
  notice?: string;
  onSession: (session: Session) => void;
}) {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const signIn = mode === "sign-in";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/auth/${signIn ? "sign-in" : "sign-up"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      } & Partial<Session>;
      if (!response.ok || !data.user || !data.burrowId) {
        setError(data.error ?? "Could not sign in");
        return;
      }
      onSession({ user: data.user, burrowId: data.burrowId });
    } catch {
      setError("Could not reach the server");
    } finally {
      setPending(false);
    }
  };

  return (
    <main data-testid="auth-screen" className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <header className="mb-6 text-center">
          <h1 className="text-xl font-semibold tracking-tight">DeepBurrow</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {signIn ? "Sign in to your burrow." : "Create an account and start digging."}
          </p>
        </header>

        <form onSubmit={submit} className="space-y-3 rounded-xl border bg-card p-5 shadow-sm">
          {notice && (
            <p data-testid="auth-notice" className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              {notice}
            </p>
          )}
          <label className="block space-y-1 text-xs font-medium">
            <span>Email</span>
            <Input
              data-testid="auth-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="block space-y-1 text-xs font-medium">
            <span>Password</span>
            <Input
              data-testid="auth-password"
              type="password"
              autoComplete={signIn ? "current-password" : "new-password"}
              required
              minLength={signIn ? undefined : 10}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error && (
            <p data-testid="auth-error" role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <Button data-testid="auth-submit" type="submit" className="w-full" disabled={pending}>
            {pending ? "Working…" : signIn ? "Sign in" : "Create account"}
          </Button>
          <Button
            data-testid="auth-toggle"
            type="button"
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => {
              setMode(signIn ? "sign-up" : "sign-in");
              setError("");
            }}
          >
            {signIn ? "Need an account? Sign up" : "Already have an account? Sign in"}
          </Button>
        </form>
      </div>
    </main>
  );
}

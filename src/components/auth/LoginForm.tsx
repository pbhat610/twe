"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Spinner, Wordmark } from "@/components/ui/primitives";

export function LoginForm({ next, configured }: { next: string; configured: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      router.replace(next);
      router.refresh();
      return;
    }
    setError((await res.json().catch(() => ({}))).error ?? "Sign in failed");
    setBusy(false);
  };

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="hidden flex-col justify-between border-r border-border bg-surface-2/50 p-10 lg:flex">
        <Wordmark suffix="Interviewer" />
        <div>
          <p className="t-eyebrow mb-4">For recruiters</p>
          <p className="t-display max-w-[14ch] !text-[clamp(2.4rem,4vw,3.6rem)]">Every score, backed by their own words.</p>
        </div>
        <p className="max-w-[46ch] text-[13px] text-faint">
          Candidates never sign in. They join with the private link you send them.
        </p>
      </section>

      <section className="grid place-items-center px-5 py-12">
        <form onSubmit={submit} className="enter w-full max-w-[22rem]">
          <div className="mb-8 lg:hidden">
            <Wordmark suffix="Interviewer" />
          </div>
          <h1 className="t-h1">Sign in</h1>
          <p className="mt-2 text-[14px] text-muted">Create interview links, monitor live and read reports.</p>

          {!configured && (
            <p className="mt-5 rounded-sm border border-warn/30 bg-warn/10 p-3 text-[13px] text-warn">
              Login isn&apos;t configured. Set <code className="t-num">RECRUITER_EMAIL</code>, <code className="t-num">RECRUITER_PASSWORD</code>{" "}
              and <code className="t-num">AUTH_SECRET</code> (32+ chars) in <code className="t-num">.env.local</code>, then restart.
            </p>
          )}

          <label className="mt-7 block text-[13px] font-medium" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-sm border border-border-strong bg-surface px-3 text-[15px] outline-none transition-colors duration-150 focus:border-brand"
          />
          <label className="mt-4 block text-[13px] font-medium" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-sm border border-border-strong bg-surface px-3 text-[15px] outline-none transition-colors duration-150 focus:border-brand"
          />

          {error && (
            <p role="alert" className="mt-3 text-[13px] text-bad">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" className="mt-6 w-full" disabled={busy || !configured}>
            {busy ? <Spinner /> : <>Sign in <ArrowRight className="h-4 w-4" /></>}
          </Button>
        </form>
      </section>
    </main>
  );
}

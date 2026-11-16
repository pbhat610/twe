import { cookies } from "next/headers";
import { z } from "zod";
import { authConfigured, createSessionToken, sessionCookie, verifyCredentials } from "@/lib/auth";
import { handle } from "@/lib/http";

const Body = z.object({ email: z.string().min(1).max(200), password: z.string().min(1).max(200) });

// Basic brute-force protection (per instance): 5 failed attempts per IP per 5 minutes.
const failures = new Map<string, { count: number; until: number }>();
const WINDOW_MS = 5 * 60_000;

export const POST = handle(async (req: Request) => {
  if (!authConfigured()) {
    return Response.json({ error: "Login isn't configured. Set RECRUITER_EMAIL, RECRUITER_PASSWORD and AUTH_SECRET in .env.local." }, { status: 503 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const f = failures.get(ip);
  if (f && f.count >= 5 && f.until > Date.now()) {
    return Response.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  }

  const { email, password } = Body.parse(await req.json());
  if (!(await verifyCredentials(email, password))) {
    const next = f && f.until > Date.now() ? { count: f.count + 1, until: f.until } : { count: 1, until: Date.now() + WINDOW_MS };
    failures.set(ip, next);
    return Response.json({ error: "Incorrect email or password." }, { status: 401 });
  }

  failures.delete(ip);
  (await cookies()).set(sessionCookie(await createSessionToken(email.trim().toLowerCase())));
  return Response.json({ ok: true });
});

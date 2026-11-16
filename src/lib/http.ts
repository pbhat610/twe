import { connection } from "next/server";
import { ZodError } from "zod";
import { isAppError } from "@/application/errors";
import { readSessionCookie, verifySessionToken } from "@/lib/auth";

/** Maps domain/application errors to HTTP responses in one place. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (isAppError(err)) return Response.json({ error: err.message }, { status: err.status });
      if (err instanceof ZodError || (err as Error)?.name === "ZodError") return Response.json({ error: "Invalid request", issues: (err as ZodError).issues }, { status: 400 });
      console.error(err);
      const message = err instanceof Error ? err.message : "Unexpected error";
      return Response.json({ error: message }, { status: 500 });
    }
  };
}

/** Recruiter-only handler: verifies the session cookie inside the route too (not just in the proxy). */
export function handleRecruiter<C = unknown>(fn: (req: Request, ctx: C) => Promise<Response>) {
  const guarded = handle(async (req: Request, ctx: C) => {
    if (!(await verifySessionToken(readSessionCookie(req)))) {
      return Response.json({ error: "Please sign in" }, { status: 401 });
    }
    return fn(req, ctx);
  });
  return async (req: Request, ctx: C) => {
    // Per-request (depends on the caller's cookie). Kept outside `handle`'s
    // try/catch so Next's prerender bail-out signal isn't swallowed.
    await connection();
    return guarded(req, ctx);
  };
}

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

/**
 * Optimistic gate for recruiter-only routes. Candidate routes (/i/*, /api/i/*)
 * and the login endpoints are not matched. Route handlers re-check the session
 * (defence in depth), as the Next.js docs recommend.
 */
export async function proxy(req: NextRequest) {
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  }
  const login = new URL("/login", req.url);
  login.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/", "/pipeline/:path*", "/candidates/:path*", "/settings/:path*", "/interviews/:path*", "/report/:path*", "/api/interviews/:path*", "/api/assessments/:path*", "/api/candidates/:path*"],
};

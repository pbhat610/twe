import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

/** Server-component guard (defence in depth behind the proxy). */
export async function requireRecruiter(next = "/") {
  const session = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) redirect(`/login?next=${encodeURIComponent(next)}`);
  return session;
}

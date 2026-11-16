import { container } from "@/container";
import { handle } from "@/lib/http";

/** Mints a short-lived avatar session token (hosted avatar) or tells the client to render locally. */
export const POST = handle(async () => {
  const { avatarSessions } = await container();
  try {
    return Response.json(await avatarSessions.issue());
  } catch (err) {
    // Out of minutes / bad key shouldn't break the interview: fall back to the local avatar.
    console.warn("[avatar] hosted session unavailable:", (err as Error).message ?? err);
    return Response.json({ provider: "local" });
  }
});

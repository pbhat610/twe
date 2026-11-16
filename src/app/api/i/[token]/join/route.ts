import { z } from "zod";
import { container } from "@/container";
import { handle } from "@/lib/http";

const Body = z.object({ recordingConsent: z.boolean().default(false) });

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/i/[token]/join">) => {
  const { token } = await ctx.params;
  const { recordingConsent } = Body.parse(await req.json().catch(() => ({})));
  const { interviews } = await container();
  return Response.json(await interviews.join(token, { recordingConsent }));
});

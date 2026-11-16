import { container } from "@/container";
import { handle } from "@/lib/http";

/** Candidate: redacted view (no scores, notes or reasoning). */
export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/i/[token]">) => {
  const { token } = await ctx.params;
  const { interviews } = await container();
  return Response.json(await interviews.view(token));
});

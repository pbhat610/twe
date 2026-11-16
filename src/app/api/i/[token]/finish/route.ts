import { container } from "@/container";
import { handle } from "@/lib/http";

export const POST = handle(async (_req: Request, ctx: RouteContext<"/api/i/[token]/finish">) => {
  const { token } = await ctx.params;
  const { interviews } = await container();
  return Response.json(await interviews.finish(token));
});

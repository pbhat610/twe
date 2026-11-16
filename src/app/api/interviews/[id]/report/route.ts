import { container } from "@/container";
import { handleRecruiter } from "@/lib/http";

export const maxDuration = 60;

export const GET = handleRecruiter(async (_req: Request, ctx: RouteContext<"/api/interviews/[id]/report">) => {
  const { id } = await ctx.params;
  const { interviews } = await container();
  return Response.json(await interviews.report(id));
});

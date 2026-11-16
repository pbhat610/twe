import { container } from "@/container";
import { handleRecruiter } from "@/lib/http";

/** Recruiter: full view (plan rationale, analyses, agent log) for live monitoring. */
export const GET = handleRecruiter(async (_req: Request, ctx: RouteContext<"/api/interviews/[id]">) => {
  const { id } = await ctx.params;
  const { interviews } = await container();
  return Response.json(await interviews.get(id));
});

import { container } from "@/container";
import { handleRecruiter } from "@/lib/http";

/** Recruiter: the interview recording as an ordered list of chunk URLs. */
export const GET = handleRecruiter(async (_req: Request, ctx: RouteContext<"/api/interviews/[id]/recording">) => {
  const { id } = await ctx.params;
  const { interviews } = await container();
  return Response.json(await interviews.recording(id), { headers: { "cache-control": "no-store" } });
});

import { container } from "@/container";
import { handleRecruiter } from "@/lib/http";
import { PlanBody } from "@/lib/schemas";

/** Recruiter: edit questions any time; already-asked ones stay locked. */
export const PUT = handleRecruiter(async (req: Request, ctx: RouteContext<"/api/interviews/[id]/plan">) => {
  const { id } = await ctx.params;
  const plan = PlanBody.parse(await req.json());
  const { interviews } = await container();
  return Response.json(await interviews.updatePlan(id, plan));
});

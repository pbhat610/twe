import { container } from "@/container";
import { handleRecruiter } from "@/lib/http";
import { AssessmentBody } from "@/lib/schemas";
import type { Job } from "@/domain/types";

export const GET = handleRecruiter(async (_req: Request, ctx: RouteContext<"/api/assessments/[id]">) => {
  const { id } = await ctx.params;
  const { assessments } = await container();
  return Response.json(await assessments.get(id));
});

export const PUT = handleRecruiter(async (req: Request, ctx: RouteContext<"/api/assessments/[id]">) => {
  const { id } = await ctx.params;
  const body = AssessmentBody.parse(await req.json());
  const { assessments } = await container();
  return Response.json(await assessments.save({ ...body, assessment_id: id, job: body.job as Job }));
});

import { container } from "@/container";
import { handleRecruiter } from "@/lib/http";
import { AssessmentBody } from "@/lib/schemas";
import type { Job } from "@/domain/types";

export const GET = handleRecruiter(async () => {
  const { assessments } = await container();
  return Response.json(await assessments.list());
});

/** Save a new assessment (title, JD, edited questions, settings). */
export const POST = handleRecruiter(async (req: Request) => {
  const body = AssessmentBody.parse(await req.json());
  const { assessments } = await container();
  return Response.json(await assessments.save({ ...body, job: body.job as Job }), { status: 201 });
});

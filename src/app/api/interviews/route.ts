import { z } from "zod";
import { container } from "@/container";
import { handleRecruiter } from "@/lib/http";

const Body = z.object({ assessmentId: z.string().min(1), candidateId: z.string().min(1) });

/** Recruiter: invite one candidate to an assessment (see also /api/assessments/:id/invite). */
export const POST = handleRecruiter(async (req: Request) => {
  const { assessmentId, candidateId } = Body.parse(await req.json());
  const { interviews } = await container();
  return Response.json(await interviews.create(assessmentId, candidateId), { status: 201 });
});

/** Recruiter: dashboard list. */
export const GET = handleRecruiter(async () => {
  const { interviews } = await container();
  return Response.json(await interviews.list());
});

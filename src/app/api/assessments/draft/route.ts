import { container } from "@/container";
import { handleRecruiter } from "@/lib/http";
import { DraftBody } from "@/lib/schemas";

export const maxDuration = 60;

/** AI reads the pasted JD and drafts N role-based questions. Nothing is saved. */
export const POST = handleRecruiter(async (req: Request) => {
  const body = DraftBody.parse(await req.json());
  const { assessments } = await container();
  return Response.json(await assessments.draft(body));
});

import type { Candidate } from "@/domain/types";
import { container } from "@/container";
import { handleRecruiter } from "@/lib/http";
import { CandidateBody } from "@/lib/schemas";

// persona_note is a grader hint in the demo data; it never leaves the server.
const publicView = (c: Candidate) => Object.fromEntries(Object.entries(c).filter(([k]) => k !== "persona_note"));

export const GET = handleRecruiter(async () => {
  const { candidates } = await container();
  return Response.json((await candidates.list()).map(publicView));
});

/** Save a new or edited candidate (e.g. after reviewing a parsed resume). */
export const POST = handleRecruiter(async (req: Request) => {
  const body = CandidateBody.parse(await req.json());
  const { candidates } = await container();
  return Response.json(publicView(await candidates.save(body as Partial<Candidate> & { name: string })), { status: 201 });
});

import { z } from "zod";
import { container } from "@/container";
import { handleRecruiter } from "@/lib/http";

const Body = z.object({ candidateIds: z.array(z.string().min(1)).min(1).max(50) });

/** Invite candidates: one interview + private link each, from the assessment's questions. */
export const POST = handleRecruiter(async (req: Request, ctx: RouteContext<"/api/assessments/[id]/invite">) => {
  const { id } = await ctx.params;
  const { candidateIds } = Body.parse(await req.json());
  const { interviews } = await container();
  const created = [];
  for (const cid of candidateIds) created.push(await interviews.create(id, cid));
  return Response.json(created, { status: 201 });
});

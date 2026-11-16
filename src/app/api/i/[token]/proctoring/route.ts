import { z } from "zod";
import { PROCTORING_EVENTS, type ProctoringEventType } from "@/domain/proctoring";
import { container } from "@/container";
import { handle } from "@/lib/http";

const Body = z.object({
  events: z
    .array(
      z.object({
        type: z.enum(Object.keys(PROCTORING_EVENTS) as [ProctoringEventType, ...ProctoringEventType[]]),
        detail: z.string().max(120).optional(),
      }),
    )
    .max(20),
});

/** Candidate browser reports integrity signals (metadata only). */
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/i/[token]/proctoring">) => {
  const { token } = await ctx.params;
  const { events } = Body.parse(await req.json());
  const { interviews } = await container();
  const summary = await interviews.recordProctoring(token, events);
  return Response.json({ total: summary.total, critical: summary.critical });
});

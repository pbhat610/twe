import { z } from "zod";
import { container } from "@/container";
import { handle } from "@/lib/http";

export const maxDuration = 60;

const Body = z.object({
  turnId: z.string().min(1),
  // May be empty: an empty answer is recorded as no_answer (and costs no LLM call).
  answer: z.string().max(8000),
  via: z.enum(["voice", "text", "simulated"]).default("text"),
});

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/i/[token]/answers">) => {
  const { token } = await ctx.params;
  const { turnId, answer, via } = Body.parse(await req.json());
  const { interviews } = await container();
  return Response.json(await interviews.submitAnswer(token, turnId, answer, via));
});

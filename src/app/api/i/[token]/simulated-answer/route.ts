import { pickSampleAnswer, type SampleAnswers } from "@/application/simulation/sampleAnswerPicker";
import { container } from "@/container";
import { handle } from "@/lib/http";
import samples from "../../../../../../data/sample_answers.json";

/** Bonus: simulated mode. Picks the scripted answer whose topic best matches the current question. */
export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/i/[token]/simulated-answer">) => {
  const { token } = await ctx.params;
  const { interviews } = await container();
  const sim = await interviews.simulationContext(token);
  const answers = (samples as unknown as Record<string, SampleAnswers>)[sim.candidateId];
  if (!answers) return Response.json({ error: "No sample answers for this candidate" }, { status: 404 });
  const { topic, text } = pickSampleAnswer(answers, sim);
  return Response.json({ style: topic, text });
});

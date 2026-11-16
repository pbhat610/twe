import { BadRequestError } from "@/application/errors";
import { container } from "@/container";
import { handle } from "@/lib/http";

const MAX_BYTES = 10 * 1024 * 1024;

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/i/[token]/transcribe">) => {
  const { token } = await ctx.params;
  const { transcriber, interviews } = await container();
  if (!transcriber) return Response.json({ error: "Voice answers need an OpenAI key; please type your answer" }, { status: 503 });

  const form = await req.formData();
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) throw new BadRequestError("Missing audio");
  if (audio.size > MAX_BYTES) throw new BadRequestError("Recording too long");

  const keywords = await interviews.keywords(token); // bias recognition toward job vocabulary
  return Response.json({ text: await transcriber.transcribe(audio, { keywords }) });
});

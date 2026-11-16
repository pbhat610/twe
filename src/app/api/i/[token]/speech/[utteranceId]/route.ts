import { container } from "@/container";
import { handle } from "@/lib/http";

/**
 * Speaks only server-approved lines (looked up by id), never arbitrary text.
 * 204 tells the client to use its browser-voice fallback (no TTS configured).
 */
export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/i/[token]/speech/[utteranceId]">) => {
  const { token, utteranceId } = await ctx.params;
  const { interviews, speech } = await container();
  const text = await interviews.utterance(token, utteranceId);
  if (!speech) return new Response(null, { status: 204 });

  const { audio, contentType } = await speech.synthesize(text);
  return new Response(audio, { headers: { "content-type": contentType, "cache-control": "private, max-age=3600" } });
});

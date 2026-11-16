import { BadRequestError } from "@/application/errors";
import { container } from "@/container";
import { normalizeContentType } from "@/domain/recording";
import { handle } from "@/lib/http";

/**
 * Candidate browser uploads one ordered recording chunk: raw body,
 * `?seq=N`, Content-Type video/webm or video/mp4.
 */
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/i/[token]/recording">) => {
  const { token } = await ctx.params;
  const seq = Number(new URL(req.url).searchParams.get("seq"));
  const contentType = normalizeContentType(req.headers.get("content-type"));
  if (!contentType) throw new BadRequestError("Unsupported recording format");
  const { interviews } = await container();
  await interviews.recordChunk(token, seq, await req.arrayBuffer(), contentType);
  return new Response(null, { status: 204 });
});
